# Critical Infrastructure Security & Memory Fix

Goal: Fix 4 critical production issues: (1) OOM crashes from 160MB heap limit with SQLite overhead, (2) Encryption weakness from deterministic salt derivation, (3) Data corruption in streaming backup implementation, (4) Race conditions in concurrent entry creation. This is a comprehensive infrastructure fix requiring careful orchestration.

## IMPORTANT: Rules for implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `clara-0.1` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then verify the app builds correctly.
5. **Do NOT skip steps or combine steps.** Each step should keep the app fully functional.
6. **CRYPTO CHANGES ARE IRREVERSIBLE** - Backup the database before running crypto changes. Old encrypted data cannot be decrypted with new keys.

Critical fix guardrails (apply to all steps below):
- Do NOT change the encryption algorithm (keep AES-256-GCM)
- Do NOT change the authentication/session flow structure
- Do NOT remove any existing security measures
- All database schema changes must be backward compatible
- Memory optimizations must not break existing functionality
- Test on a copy of production data, never on live production during crypto changes

---

## The 4 Critical Risks - Detailed Explanation

### Risk 1: OOM Crashes from Memory Pressure

**The Problem:**
The app runs on Fly.io with 256MB RAM but Node.js heap is limited to 160MB via `NODE_OPTIONS="--max-old-space-size=160"`. Better-SQLite3 with WAL mode, prepared statements, and synchronous encryption creates memory pressure that exceeds this limit:

- Better-SQLite3 baseline: ~20-30MB for connection + WAL buffers
- Prepared statements cached per query: ~2-5MB
- Synchronous AES-GCM encryption buffers: ~5-10MB per large operation
- SvelteKit SSR runtime: ~40-60MB baseline
- **Total at rest: ~80-100MB**

**When OOM occurs:**
1. User exports large dataset (streaming decrypts every entry)
2. Concurrent requests pile up (each holding DB connection)
3. Backup operation runs while serving requests
4. Memory spikes to >160MB → Node.js V8 terminates process
5. Fly.io restarts machine → data loss for in-flight operations

**Current Code Issues:**
- `src/lib/db/connection.ts`: Database connection never closed, holds resources forever
- `src/lib/db/locations.ts:19-22`: Location cache grows unbounded with no size limit
- `src/lib/db/quotes.ts:33-36`: Quote source cache also unbounded
- `src/routes/api/export/+server.ts`: JSON.parse() on every decrypted entry creates heap pressure

**The Solution:**
1. Reduce heap limit to 140MB (give 20MB buffer for SQLite native memory)
2. Add connection cleanup on shutdown signals
3. Implement cache size limits with LRU eviction
4. Refactor export to use object streaming instead of JSON.parse()

---

### Risk 2: Encryption Weakness from Deterministic Salt Derivation

**The Problem:**
Current encryption uses a deterministic salt derived from the secret itself:

```typescript
// src/lib/server/crypto.ts:47-51
const salt = createHash('sha256').update('mcj-encryption-salt:' + secret, 'utf8').digest();
cachedKey = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
```

**Why this is dangerous:**
1. If an attacker steals the encrypted database but NOT the key, they can still derive the salt (it's just a hash of what they're trying to crack)
2. Using the secret as input to salt derivation provides zero additional entropy
3. This effectively reduces the key space - PBKDF2 iterations are wasted because salt is predictable
4. Standard practice: salt should be random and stored separately, or at least use a fixed non-secret value

**Attack Scenario:**
1. Attacker gains read access to `/data/journal.db` (through path traversal, backup leak, etc.)
2. Attacker sees encrypted blobs but doesn't have `JOURNAL_ENCRYPTION_KEY`
3. Attacker computes: `salt = sha256('mcj-encryption-salt:' + guessed_key)` for each guess
4. Attacker can verify guesses by checking if decryption produces valid JSON
5. Without proper salt, rainbow table attacks become feasible

**The Solution:**
1. Generate a random salt per environment and store it in database config table
2. Add migration to extract/create salt for existing databases
3. Maintain backward compatibility by trying legacy decryption if new fails
4. Update `getKey()` function to use stored salt instead of derived salt

**IMPORTANT:** This is a ONE-WAY migration. Once data is encrypted with the new key, it cannot be decrypted with old code.

---

### Risk 3: Data Corruption from Backup Implementation

**The Problem:**
The current backup implementation in `src/lib/db/backups.ts` is vulnerable to corruption:

```typescript
// Line 20-24: Checkpoints WAL, then reads file
database.pragma('wal_checkpoint(TRUNCATE)');
// ... then streams the database file directly
const readStream = fs.createReadStream(DB_PATH);
```

**Race condition:**
1. Request 1: Calls `wal_checkpoint(TRUNCATE)` - WAL is merged into main DB
2. Request 2: Executes INSERT statement - new data goes to WAL
3. Request 1: Starts reading database file - misses Request 2's data
4. Result: Backup is inconsistent (missing recent writes)

**File streaming issues:**
1. `fs.createReadStream()` doesn't guarantee atomic reads
2. If another process modifies DB during read, backup gets corrupted
3. Temp file handling has race condition:
   - Writes encrypted data to temp file
   - Then reads temp file and writes to final file
   - If process crashes during this, temp file leaks
4. No verification that backup is valid SQLite database

**The Solution:**
1. Use Better-SQLite3's built-in `backup()` API instead of file copy
2. Lock database during backup (SQLite has backup API with proper locking)
3. Add backup integrity verification
4. Implement atomic file operations with proper temp file cleanup
5. Add backup rotation strategy to prevent disk exhaustion

---

### Risk 4: Race Conditions in Concurrent Entry Creation

**The Problem:**
Entry creation in `src/routes/api/entries/+server.ts` has no transaction wrapping:

```typescript
// Lines 65-86: Multiple independent queries
const template = getActiveTemplate();  // Query 1
const dailyQuote = getOrCreateDailyQuote(date);  // Query 2 (may INSERT)
const encryptedData = encrypt(JSON.stringify(data));  // CPU work
const id = saveEntry(...);  // Query 3 (INSERT)
```

**Race condition scenarios:**

**Scenario A - Double Entry:**
1. User submits entry at 13:59:59
2. Request A: Passes `isPastCutoff()` check (returns false)
3. Request B: Same user submits again (double-click, retry, etc.)
4. Request A: Calls `saveEntry()` - succeeds
5. Request B: Calls `saveEntry()` - database UNIQUE constraint catches it
6. User sees error: "Entry for today already exists" (misleading error message)

**Scenario B - Quote Collisions:**
1. Two concurrent requests both call `getOrCreateDailyQuote('2025-01-28')`
2. Both check: no quote exists for today
3. Both pick random quote from list
4. Request A: INSERT OR IGNORE succeeds
5. Request B: INSERT OR IGNORE silently fails (IGNORE)
6. Both requests return success, but only one quote was actually stored
7. Users see different quotes depending on which request "won"

**Scenario C - Time Cutoff Race:**
1. Request checks `isPastCutoff()` at 13:59:59.999
2. Request proceeds to encrypt data (takes 100ms)
3. Clock rolls over to 14:00:00.001
4. Request tries to save entry
5. Error or inconsistent behavior

**The Solution:**
1. Wrap entry creation in SQLite transaction
2. Use `BEGIN IMMEDIATE` to get exclusive lock immediately
3. Recheck cutoff time INSIDE transaction
4. Handle daily quote creation atomically with entry
5. Return proper error messages for each failure case

---

## What These Fixes Do

**Problem Solved:**
- Eliminates OOM crashes that cause service disruption
- Fixes encryption vulnerability that weakens security guarantees
- Prevents backup corruption that could lead to data loss
- Removes race conditions that cause inconsistent behavior

**What These Fixes Do NOT Do:**
- Does NOT change the encryption algorithm (stays AES-256-GCM)
- Does NOT modify the authentication flow or session handling
- Does NOT add horizontal scaling (stays single-machine)
- Does NOT remove any existing security measures
- Does NOT change the API contract or response formats

**Why This Approach:**
- Fixes critical infrastructure issues without user-facing changes
- Maintains backward compatibility for API consumers
- Uses SQLite's native capabilities (backup API, transactions) instead of reinventing
- Each fix is independent and can be verified separately

---

## Critical Fix Targets

| Risk | Files | Issue | Priority |
|------|-------|-------|----------|
| OOM Memory Pressure | `src/lib/db/connection.ts`, `fly.toml`, `src/lib/db/locations.ts`, `src/lib/db/quotes.ts` | 160MB heap + SQLite overhead causes crashes | 🔴 Critical |
| Encryption Weakness | `src/lib/server/crypto.ts`, `src/lib/db/sessions.ts`, `src/lib/db/schema.ts` | Deterministic salt reduces key strength | 🔴 Critical |
| Backup Corruption | `src/lib/db/backups.ts` | File copy race condition, no verification | 🔴 Critical |
| Race Conditions | `src/routes/api/entries/+server.ts`, `src/lib/db/quotes.ts` | No transaction wrapping, concurrent issues | 🔴 Critical |

---

## Implementation Steps

### ⚠️ PRE-STEP: BACKUP YOUR DATABASE

**Before starting, create a full backup:**
```bash
cd clara-0.1
cp /data/journal.db /data/journal.db.backup-$(date +%Y%m%d-%H%M%S)
# Or if local:
cp ./data/journal.db ./data/journal.db.backup-$(date +%Y%m%d-%H%M%S)
```

**Verify backup works:**
```bash
sqlite3 /data/journal.db.backup-XXXX "SELECT count(*) FROM entries;"
```

---

### Step 1: Fix Memory Configuration (OOM Prevention)

**Problem:** Node.js heap limit is too high for 256MB RAM system with SQLite overhead.

**Files to update:**
- `fly.toml`
- `src/lib/db/connection.ts`

**What to change:**

1. **Update fly.toml** - Reduce heap limit and add memory-safe settings:
   ```toml
   # Change line 12 from:
   NODE_OPTIONS = "--max-old-space-size=160"
   # To:
   NODE_OPTIONS = "--max-old-space-size=140 --optimize-for-size"
   ```
   
   Also add garbage collection tuning:
   ```toml
   [env]
     NODE_ENV = "production"
     PORT = "3000"
     NODE_OPTIONS = "--max-old-space-size=140 --optimize-for-size"
     # Add these:
     UV_THREADPOOL_SIZE = "4"
   ```

2. **Add graceful shutdown to connection.ts** - Read the current file first at `src/lib/db/connection.ts`:
   - Keep all existing code including DATA_DIR, DB_PATH, EMPTY_TEXT_PLACEHOLDER, EMPTY_COORDINATE_PLACEHOLDER
   - Keep the `getDbInternal()` and `getDb()` functions unchanged
   - Add AFTER the `getDb()` function:
   
   ```typescript
   /**
    * Close the database connection gracefully.
    * Should be called on SIGTERM/SIGINT for clean shutdown.
    */
   export function closeDb(): void {
   	if (db) {
   		db.close();
   		db = null;
   	}
   }
   ```

3. **Export closeDb function** - Add `closeDb` to the exports in `src/lib/db.ts`:
   - Read current exports at line 1-13
   - Add to the export list: `export { closeDb } from './db/connection.js';`

**Expected result:** Heap limit reduced to 140MB leaving 20MB buffer for SQLite native memory. Database can be closed cleanly on shutdown.

**Guardrails:**
- Do NOT remove the existing lazy initialization logic
- Do NOT change the WAL mode pragma
- Do NOT modify the DATA_DIR or DB_PATH logic
- Do NOT change how getDb() works - only add the close function

---

### Step 2: Add Cache Size Limits (Memory Leak Prevention)

**Problem:** Location and quote caches grow unbounded with no eviction policy.

**Files to update:**
- `src/lib/db/locations.ts`
- `src/lib/db/quotes.ts`

**What to change:**

1. **Update locations.ts cache** - Read current file at `src/lib/db/locations.ts`:
   
   a. Replace the simple cache interface (lines 14-22) with bounded cache:
   ```typescript
   // Before:
   interface LocationCache {
   	data: Location[] | null;
   	timestamp: number;
   }
   const locationCache: LocationCache = { data: null, timestamp: 0 };
   
   // After:
   const MAX_LOCATION_CACHE_SIZE = 100; // Reasonable limit for journal locations
   const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
   
   interface LocationCache {
   	data: Location[] | null;
   	timestamp: number;
   }
   
   const locationCache: LocationCache = { data: null, timestamp: 0 };
   ```
   
   b. Add cache size enforcement in `getLocations()` function:
   - After the cache is populated (around line 62-63), add validation:
   ```typescript
   // Enforce cache size limit
   if (locations.length > MAX_LOCATION_CACHE_SIZE) {
   	// Log warning but don't crash - just don't cache oversized data
   	console.warn(`Location cache size (${locations.length}) exceeds limit (${MAX_LOCATION_CACHE_SIZE}), skipping cache`);
   	return locations;
   }
   
   locationCache.data = locations;
   locationCache.timestamp = Date.now();
   ```

2. **Update quotes.ts cache** - Read current file at `src/lib/db/quotes.ts`:
   
   a. Add cache size limit constant after line 32:
   ```typescript
   const SOURCE_ID = 1;
   const MAX_QUOTE_SOURCE_SIZE = 1024 * 1024; // 1MB max for quote source text
   ```
   
   b. In `getParsedQuotes()` function (around line 121-136), add size check:
   ```typescript
   // Before setting cache, check size limit
   if (source.sourceText.length > MAX_QUOTE_SOURCE_SIZE) {
   	console.warn(`Quote source exceeds cache size limit, skipping cache`);
   	return result;
   }
   ```

**Expected result:** Caches have maximum size limits preventing unbounded memory growth.

**Guardrails:**
- Do NOT remove the cache entirely (performance impact)
- Do NOT change the TTL values
- Keep the cache invalidation logic working
- Size limits should be generous (100 locations is plenty for a journal app)

---

### Step 3: Fix Encryption Salt (Security Hardening)

**⚠️ CRITICAL: This step changes how data is encrypted. Run on a COPY of production data first.**

**Problem:** Salt is derived from the secret itself, weakening encryption.

**Files to update:**
- `src/lib/server/crypto.ts`
- `src/lib/db/sessions.ts`
- `src/lib/db/schema.ts`

**What to change:**

1. **Update crypto.ts** - Read current file at `src/lib/server/crypto.ts`:
   
   a. Keep all existing imports and constants (lines 1-7)
   
   b. Modify `getKey()` function (lines 41-52) to accept salt parameter:
   ```typescript
   // Before:
   function getKey(): Buffer {
   	if (cachedKey) return cachedKey;
   	const secret = env.JOURNAL_ENCRYPTION_KEY;
   	if (!secret) {
   		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
   	}
   	// Deterministic salt from a fixed prefix + the secret itself.
   	// Ensures the same key is derived each run (required to decrypt existing data).
   	const salt = createHash('sha256').update('mcj-encryption-salt:' + secret, 'utf8').digest();
   	cachedKey = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
   	return cachedKey;
   }
   
   // After:
   function getKey(salt: Buffer): Buffer {
   	const secret = env.JOURNAL_ENCRYPTION_KEY;
   	if (!secret) {
   		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
   	}
   	return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
   }
   
   /**
    * Get or create the encryption salt from database.
    * Salt is stored in config table as 'encryption_salt'.
    */
   function getEncryptionSalt(): Buffer {
   	const database = getDb();
   	const row = database.prepare(
   		"SELECT value FROM config WHERE key = 'encryption_salt'"
   	).get() as { value: string } | undefined;
   
   	if (row?.value) {
   		return Buffer.from(row.value, 'hex');
   	}
   
   	// Generate new random salt
   	const newSalt = randomBytes(32);
   	database.prepare(`
   		INSERT INTO config (key, value)
   		VALUES ('encryption_salt', ?)
   		ON CONFLICT(key) DO UPDATE SET value = excluded.value
   	`).run(newSalt.toString('hex'));
   
   	return newSalt;
   }
   
   /**
    * Get the legacy deterministic salt for backward compatibility.
    * Used to decrypt data encrypted before the salt fix.
    */
   function getLegacySalt(): Buffer {
   	const secret = env.JOURNAL_ENCRYPTION_KEY;
   	if (!secret) {
   		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
   	}
   	return createHash('sha256').update('mcj-encryption-salt:' + secret, 'utf8').digest();
   }
   ```
   
   c. Update encrypt function (line 59-61):
   ```typescript
   // Before:
   export function encrypt(plaintext: string): string {
   	return encryptWithKey(plaintext, getKey());
   }
   
   // After:
   export function encrypt(plaintext: string): string {
   	const salt = getEncryptionSalt();
   	const key = getKey(salt);
   	return encryptWithKey(plaintext, key);
   }
   ```
   
   d. Update decrypt function (lines 63-65) to try new salt first, fallback to legacy:
   ```typescript
   // Before:
   export function decrypt(stored: string): string {
   	return decryptWithKey(stored, getKey());
   }
   
   // After:
   export function decrypt(stored: string): string {
   	// Try new salt-based key first
   	try {
   		const salt = getEncryptionSalt();
   		const key = getKey(salt);
   		return decryptWithKey(stored, key);
   	} catch {
   		// Fall back to legacy deterministic salt for backward compatibility
   		const legacyKey = getLegacyKey();
   		return decryptWithKey(stored, legacyKey);
   	}
   }
   ```
   
   e. Remove the cachedKey variable (line 8) since we no longer cache - salt can change:
   ```typescript
   // Remove: let cachedKey: Buffer | null = null;
   // Remove the getLegacyKey() function entirely (lines 10-16)
   ```

2. **Add schema migration** - Read `src/lib/db/schema.ts` and add AFTER the existing table creation (after line 97):
   ```typescript
   // Migration: Ensure encryption salt exists
   const saltRow = db.prepare("SELECT value FROM config WHERE key = 'encryption_salt'").get() as { value: string } | undefined;
   if (!saltRow) {
   	// Generate and store salt for new databases
   	const newSalt = require('crypto').randomBytes(32).toString('hex');
   	db.prepare("INSERT INTO config (key, value) VALUES ('encryption_salt', ?)").run(newSalt);
   }
   ```

**Expected result:** Encryption now uses a random 32-byte salt stored in the database. Old data can still be decrypted via fallback. New data is encrypted with stronger key derivation.

**Guardrails:**
- Test on a COPY of production data before applying to live
- Verify you can decrypt old entries after the change
- The fallback to legacy decryption ensures backward compatibility
- Do NOT remove the legacy decryption path - it may be needed for years

---

### Step 4: Fix Backup Race Conditions (Data Integrity)

**Problem:** Current backup uses file copy which is vulnerable to race conditions and corruption.

**Files to update:**
- `src/lib/db/backups.ts`

**What to change:**

1. **Replace file copy with SQLite backup API** - Read current file at `src/lib/db/backups.ts`:
   
   a. Keep imports and constants (lines 1-11) but add backup verification:
   ```typescript
   // Add after line 11:
   const BACKUP_CHUNK_PAGES = 100; // Pages per backup step (balance of speed vs locking)
   ```
   
   b. Replace the entire `createBackup()` function (lines 20-66) with SQLite backup API:
   ```typescript
   export async function createBackup(): Promise<string> {
   	const database = getDb();
   
   	// Ensure backup directory exists
   	const backupDir = path.join(DATA_DIR, 'backups');
   	if (!fs.existsSync(backupDir)) {
   		fs.mkdirSync(backupDir, { recursive: true });
   	}
   
   	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
   	const backupPath = path.join(backupDir, `journal-backup-${timestamp}.db`);
   	const tempPath = `${backupPath}.tmp`;
   
   	try {
   		// Use SQLite's native backup API for consistency
   		const backupDb = new Database(tempPath);
   		
   		try {
   			// Perform backup with page-by-page copying (allows concurrent reads)
   			const backup = database.backup(backupDb);
   			
   			// Step through backup in chunks to minimize lock time
   			let remaining = backup.remaining;
   			while (remaining > 0) {
   				backup.step(BACKUP_CHUNK_PAGES);
   				remaining = backup.remaining;
   			}
   			
   			backup.finish();
   		} finally {
   			backupDb.close();
   		}
   
   		// Verify backup integrity before finalizing
   		const integrityCheck = verifyBackupIntegrity(tempPath);
   		if (!integrityCheck.valid) {
   			throw new Error(`Backup integrity check failed: ${integrityCheck.error}`);
   		}
   
   		// Atomically move temp file to final location
   		fs.renameSync(tempPath, backupPath);
   
   		// Apply retention policy
   		applyRetentionPolicy(backupDir);
   
   		return backupPath;
   	} catch (error) {
   		// Clean up temp file on any error
   		if (fs.existsSync(tempPath)) {
   			fs.unlinkSync(tempPath);
   		}
   		throw error;
   	}
   }
   
   /**
    * Verify that a backup file is a valid SQLite database.
    */
   function verifyBackupIntegrity(backupPath: string): { valid: boolean; error?: string } {
   	try {
   		const testDb = new Database(backupPath, { readonly: true });
   		try {
   			// Run SQLite integrity check
   			const result = testDb.pragma('integrity_check') as string | string[];
   			const isValid = Array.isArray(result) ? result[0] === 'ok' : result === 'ok';
   			
   			if (!isValid) {
   				return { valid: false, error: 'SQLite integrity check failed' };
   			}
   
   			// Verify required tables exist
   			const tables = testDb.prepare(
   				"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('entries', 'config')"
   			).all() as Array<{ name: string }>;
   			
   			if (tables.length < 2) {
   				return { valid: false, error: 'Backup missing required tables' };
   			}
   
   			return { valid: true };
   		} finally {
   			testDb.close();
   		}
   	} catch (error) {
   		return { 
   			valid: false, 
   			error: error instanceof Error ? error.message : 'Unknown error' 
   		};
   	}
   }
   
   /**
    * Apply retention policy to remove old backups.
    */
   function applyRetentionPolicy(backupDir: string): void {
   	const RETENTION_COUNT = 5;
   	const backups = getBackups();
   	
   	if (backups.length > RETENTION_COUNT) {
   		const backupsToDelete = backups.slice(RETENTION_COUNT);
   		for (const backup of backupsToDelete) {
   			try {
   				fs.unlinkSync(backup.path);
   			} catch (error) {
   				console.error(`Failed to delete old backup ${backup.filename}:`, error);
   			}
   		}
   	}
   }
   ```
   
   c. Update `getBackups()` function (lines 68-97) to handle both old and new backup formats:
   ```typescript
   export function getBackups(): Array<{
   	filename: string;
   	path: string;
   	size: number;
   	created: Date;
   }> {
   	const backupDir = path.join(DATA_DIR, 'backups');
   	if (!fs.existsSync(backupDir)) {
   		return [];
   	}
   
   	const files = fs.readdirSync(backupDir)
   		.filter(file => {
   			// Support both encrypted (.db.enc) and unencrypted (.db) backups
   			return file.startsWith('journal-backup-') && 
   				   (file.endsWith('.db') || file.endsWith('.db.enc'));
   		})
   		.map(file => {
   			const filePath = path.join(backupDir, file);
   			const stats = fs.statSync(filePath);
   			return {
   				filename: file,
   				path: filePath,
   				size: stats.size,
   				created: stats.birthtime
   			};
   		})
   		.sort((a, b) => b.created.getTime() - a.created.getTime());
   
   	return files;
   }
   ```
   
   d. Remove the old encrypted backup functions or update them to work with new system. If you want to keep encryption:
   - Encrypt the backup file AFTER SQLite creates it
   - Update `decryptBackup()` to decrypt and then stream

**Expected result:** Backups use SQLite's atomic backup API with integrity verification and proper temp file handling.

**Guardrails:**
- The SQLite backup API handles locking automatically
- Integrity check verifies the backup is valid before finalizing
- Atomic rename prevents partial backup files
- Keep backward compatibility with old backup formats for getBackups()

---

### Step 5: Fix Entry Creation Race Conditions (Transaction Safety)

**Problem:** Entry creation has multiple queries without transaction wrapping, causing race conditions.

**Files to update:**
- `src/routes/api/entries/+server.ts`
- `src/lib/db/quotes.ts`

**What to change:**

1. **Add transaction wrapper to entries API** - Read current file at `src/routes/api/entries/+server.ts`:
   
   a. Add import for database at top of file (line 1-15):
   ```typescript
   // Add to existing imports:
   import { getDb } from '$lib/db.js';
   ```
   
   b. Replace the entire POST handler (lines 34-87) with transaction-based approach:
   ```typescript
   export const POST: RequestHandler = async ({ request }) => {
   	const body = await parseJsonBody<EntryPayload>(request, 102400);
   	if (body.error) {
   		return errorResponse(body.error, 400, noStoreHeaders());
   	}
   
   	const { locationId, data, capturedLat, capturedLng } = body.data!;
   
   	if (!data || typeof data !== 'object') {
   		return errorResponse('Invalid data', 400, noStoreHeaders());
   	}
   
   	if (locationId !== null && (typeof locationId !== 'number' || locationId <= 0)) {
   		return errorResponse('Invalid location ID', 400, noStoreHeaders());
   	}
   
   	if (capturedLat !== null && capturedLat !== undefined) {
   		const validation = validateCoordinates(capturedLat, capturedLng || 0);
   		if (!validation.valid) {
   			return errorResponse(validation.error!, 400, noStoreHeaders());
   		}
   	}
   
   	// Begin transaction to ensure atomicity
   	const database = getDb();
   	
   	try {
   		// Use immediate mode to get exclusive lock right away
   		database.prepare('BEGIN IMMEDIATE').run();
   		
   		try {
   			// Recheck cutoff time INSIDE transaction (race condition fix)
   			if (isPastCutoff()) {
   				database.prepare('ROLLBACK').run();
   				return errorResponse('Past cutoff', 403, noStoreHeaders());
   			}
   
   			// Check if entry already exists for today (atomic check)
   			const now = new Date();
   			const date = formatDateISO(now);
   			const existingEntry = database.prepare(
   				'SELECT 1 FROM entries WHERE date = ?'
   			).get(date);
   			
   			if (existingEntry) {
   				database.prepare('ROLLBACK').run();
   				return errorResponse('Entry for today already exists', 409, noStoreHeaders());
   			}
   
   			const timestamp = formatDateTime(now);
   			const template = getActiveTemplate();
   			
   			if (!template) {
   				database.prepare('ROLLBACK').run();
   				return errorResponse('Failed to load template', 500, noStoreHeaders());
   			}
   
   			// Get or create daily quote atomically
   			const dailyQuote = getOrCreateDailyQuoteAtomic(database, date);
   			
   			const encryptedData = encrypt(JSON.stringify(data));
   			
   			// Insert entry within transaction
   			const dataBuffer = Buffer.from(encryptedData, 'utf8');
   			const capturedLatEncrypted = encryptOptionalNumber(capturedLat ?? null);
   			const capturedLngEncrypted = encryptOptionalNumber(capturedLng ?? null);
   			const locationIdEncrypted = encryptOptionalNumber(locationId);
   			const quoteIdEncrypted = encryptOptionalNumber(dailyQuote?.quote_id ?? null);
   			const quoteTextEncrypted = encryptOptionalString(dailyQuote?.text ?? null);
   			
   			const result = database.prepare(`
   				INSERT INTO entries (
   					date, timestamp, location_id, location_id_encrypted,
   					captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted,
   					quote_id_encrypted, quote_text_encrypted, template_id, encrypted_data
   				)
   				VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   			`).run(
   				date,
   				timestamp,
   				locationIdEncrypted,
   				null,
   				null,
   				capturedLatEncrypted,
   				capturedLngEncrypted,
   				quoteIdEncrypted,
   				quoteTextEncrypted,
   				template.id,
   				dataBuffer
   			);
   
   			// Commit transaction
   			database.prepare('COMMIT').run();
   
   			return successResponse({ id: result.lastInsertRowid, date }, noStoreHeaders());
   			
   		} catch (error) {
   			// Rollback on any error
   			database.prepare('ROLLBACK').run();
   			throw error;
   		}
   	} catch (error) {
   		console.error('Entry creation error:', error);
   		return errorResponse('Failed to save entry', 500, noStoreHeaders());
   	}
   };
   ```

2. **Add atomic quote function** - Add to `src/lib/db/quotes.ts`:
   ```typescript
   /**
    * Atomically get or create daily quote within a transaction.
    * Must be called inside an active transaction.
    */
   export function getOrCreateDailyQuoteAtomic(
   	database: Database.Database,
   	date: string
   ): { quote_id: number | null; text: string } | null {
   	// Check for existing quote ( WITHIN transaction, so locked)
   	const existingRow = database.prepare(`
   		SELECT quote_id_encrypted, quote_text_encrypted
   		FROM daily_quotes
   		WHERE date = ?
   	`).get(date) as {
   		quote_id_encrypted: Buffer | null;
   		quote_text_encrypted: Buffer;
   	} | undefined;
   
   	if (existingRow) {
   		return {
   			quote_id: decryptOptionalNumber(existingRow.quote_id_encrypted),
   			text: decrypt(existingRow.quote_text_encrypted.toString('utf8'))
   		};
   	}
   
   	// Get quote source
   	const sourceRow = database.prepare(`
   		SELECT source_text_encrypted
   		FROM quote_sources
   		WHERE id = 1
   	`).get() as { source_text_encrypted: Buffer } | undefined;
   
   	if (!sourceRow) {
   		return null;
   	}
   
   	const sourceText = decrypt(sourceRow.source_text_encrypted.toString('utf8'));
   	const parsed = parseQuoteSource(sourceText);
   
   	if (parsed.quotes.length === 0) {
   		return null;
   	}
   
   	// Select random quote
   	const quoteText = parsed.quotes[Math.floor(Math.random() * parsed.quotes.length)];
   	const quoteTextEncrypted = Buffer.from(encrypt(quoteText), 'utf8');
   
   	// Insert within same transaction
   	database.prepare(`
   		INSERT OR IGNORE INTO daily_quotes (date, quote_id_encrypted, quote_text_encrypted)
   		VALUES (?, ?, ?)
   	`).run(date, null, quoteTextEncrypted);
   
   	return { quote_id: null, text: quoteText };
   }
   ```

3. **Export the atomic function** - Add to `src/lib/db/index.ts`:
   ```typescript
   export { getOrCreateDailyQuoteAtomic } from './db/quotes.js';
   ```

4. **Import Database type** - At top of `src/lib/db/quotes.ts`:
   ```typescript
   import type Database from 'better-sqlite3';
   ```

**Expected result:** Entry creation is wrapped in a transaction with immediate locking. Cutoff time is rechecked inside transaction. Quote creation is atomic.

**Guardrails:**
- Use `BEGIN IMMEDIATE` to get exclusive lock immediately (prevents other writes)
- Always ROLLBACK on error to avoid leaving transaction open
- Recheck cutoff inside transaction (clock may have ticked)
- Check for existing entry atomically (prevents duplicate key errors)

---

### Step 6: Add Graceful Shutdown Handler

**Problem:** No cleanup on process termination, leaving database connections open.

**Files to update:**
- `src/hooks.server.ts`

**What to change:**

1. **Add shutdown handler** - Read current file at `src/hooks.server.ts`:
   
   a. Add import at top (after line 6):
   ```typescript
   import { closeDb } from '$lib/db.js';
   ```
   
   b. Add shutdown signal handlers AFTER the handle function (at end of file, after line 155):
   ```typescript
   // Graceful shutdown handlers
   function handleShutdown(signal: string): void {
   	console.log(`Received ${signal}, closing database connection...`);
   	try {
   		closeDb();
   		console.log('Database connection closed successfully');
   	} catch (error) {
   		console.error('Error closing database:', error);
   	}
   	// Exit after a brief delay to allow logs to flush
   	setTimeout(() => {
   		process.exit(0);
   	}, 100);
   }
   
   // Register handlers only in production to avoid dev mode issues
   if (process.env.NODE_ENV === 'production') {
   	process.on('SIGTERM', () => handleShutdown('SIGTERM'));
   	process.on('SIGINT', () => handleShutdown('SIGINT'));
   }
   ```

**Expected result:** Database connection closes cleanly on SIGTERM/SIGINT signals.

**Guardrails:**
- Only register handlers in production (dev mode can have issues)
- Add small delay before exit to allow logs to flush
- Catch errors during close to prevent hanging

---

### Step 7: Verification and Final QA

**Commands:**
- After each step: `npx svelte-check --threshold error`
- After all steps: `npm run build`

**Verification checks:**

1. **Memory configuration:**
   - Check fly.toml has `NODE_OPTIONS = "--max-old-space-size=140 --optimize-for-size"`
   - Verify `UV_THREADPOOL_SIZE = "4"` is set
   - Confirm closeDb() is exported from db.ts

2. **Cache limits:**
   - Verify locations.ts has MAX_LOCATION_CACHE_SIZE = 100
   - Verify quotes.ts has MAX_QUOTE_SOURCE_SIZE = 1MB
   - Check both have size enforcement logic

3. **Encryption salt:**
   - Start the app and check database: `SELECT * FROM config WHERE key = 'encryption_salt';`
   - Verify a random hex value exists
   - Create a test entry and verify it can be decrypted
   - Verify old entries still decrypt correctly (backward compatibility)

4. **Backup integrity:**
   - Trigger a backup via API or script
   - Verify backup file is created
   - Check backup integrity: `sqlite3 backup-file.db "PRAGMA integrity_check;"`
   - Verify required tables exist in backup
   - Test backup rotation (keep only 5 most recent)

5. **Race condition fixes:**
   - Create an entry and verify it succeeds
   - Try to create duplicate entry (should get 409 error)
   - Test entry creation at exactly cutoff time
   - Verify transaction rollback works (if error occurs, no partial data)

6. **Graceful shutdown:**
   - Start the app: `npm run dev`
   - Press Ctrl+C to send SIGINT
   - Verify "Database connection closed successfully" message appears

7. **TypeScript validation:**
   - Run `npx svelte-check --threshold error`
   - Verify: No type errors
   - Verify: All new imports resolve correctly
   - Verify: No unused variables

8. **Build verification:**
   - Run `npm run build`
   - Verify: Build completes successfully
   - Verify: No build warnings or errors

**Documentation:**
- Record all changes in the Implementation Logs
- Document the encryption migration (one-way change)
- Note the backup format change (may need to communicate to users)

---

## Implementation Logs

(Agent: Write a brief paragraph here after completing each step above. Before starting any step, read all existing logs first to avoid duplication.)

