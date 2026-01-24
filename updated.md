## Security Hardening Plan – Phase 2 (GDPR-Level Security)

Goal: Harden authentication, strengthen encryption key derivation, add security headers, implement logout, data export, data wipe, rate-limit all sensitive endpoints, and sanitize error logging. Single-user personal app — no multi-tenant or DPA concerns.

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you don't repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.

Security guardrails (apply to all steps below):
- Do not print secrets, tokens, encryption keys, or database contents in logs or console output.
- Do not change UI/UX layout or styling.
- Avoid large refactors; keep diffs minimal and local to the listed files.
- Use tabs for indentation, single quotes for strings (per AGENTS.md).
- All new server-side files must NOT expose helpers to the client bundle.

---

### Step 1: Upgrade passphrase verification to PBKDF2 with salt

**File:** `morning-clarity-journal/src/lib/auth.ts`

**What to change:**

Replace the current `verifyPassphrase` function. Currently it uses plain SHA-256 without salt:
```typescript
const inputHash = createHash('sha256').update(input, 'utf8').digest();
const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
return timingSafeEqual(inputHash, expectedHash);
```

Replace with PBKDF2 using a deterministic salt derived from the passphrase itself (since there's no stored salt for a single-user env-var passphrase):

1. Add `pbkdf2Sync` to the import from `'crypto'`:
   ```typescript
   import { randomBytes, createHmac, timingSafeEqual, createHash, pbkdf2Sync } from 'crypto';
   ```

2. Add two constants after the existing constants block (after line 6):
   ```typescript
   const PBKDF2_ITERATIONS = 100000;
   const PBKDF2_KEYLEN = 32;
   ```

3. Replace the `verifyPassphrase` function body with:
   ```typescript
   export function verifyPassphrase(input: string): boolean {
   	const expected = env.JOURNAL_PASSPHRASE;
   	if (!expected) {
   		throw new Error('JOURNAL_PASSPHRASE environment variable is not set');
   	}
   	// Derive a deterministic salt from the expected passphrase using SHA-256.
   	// This avoids needing a stored salt while still preventing rainbow tables.
   	const salt = createHash('sha256').update('mcj-passphrase-salt:' + expected, 'utf8').digest();
   	const inputKey = pbkdf2Sync(input, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
   	const expectedKey = pbkdf2Sync(expected, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
   	return timingSafeEqual(inputKey, expectedKey);
   }
   ```

**Guardrails:**
- Do not change the function signature or any other function.
- Do not log the passphrase, salt, or derived keys.
- Keep `timingSafeEqual` for the final comparison.

---

### Step 2: Upgrade encryption key derivation to PBKDF2 with salt

**File:** `morning-clarity-journal/src/lib/server/crypto.ts`

**What to change:**

Replace the current `getKey` function. Currently it uses plain SHA-256 without salt:
```typescript
cachedKey = createHash('sha256').update(secret).digest();
```

Replace with PBKDF2:

1. Add `pbkdf2Sync` to the import from `'crypto'`:
   ```typescript
   import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'crypto';
   ```

2. Add two constants after `IV_LENGTH`:
   ```typescript
   const PBKDF2_ITERATIONS = 100000;
   const PBKDF2_KEYLEN = 32;
   ```

3. Replace the key derivation line inside `getKey()`:
   ```typescript
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
   ```

**CRITICAL WARNING:** This changes the derived key. All previously encrypted data will become unreadable. The implementing agent MUST do the following migration sub-steps IN ORDER:

A. **Before changing `getKey`**, add a temporary helper function at the top of the file:
   ```typescript
   function getLegacyKey(): Buffer {
   	const secret = env.JOURNAL_ENCRYPTION_KEY;
   	if (!secret) {
   		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
   	}
   	return createHash('sha256').update(secret).digest();
   }
   ```

B. Add a `decryptWithKey` helper that accepts a key parameter:
   ```typescript
   function decryptWithKey(stored: string, key: Buffer): string {
   	const { iv, tag, data } = JSON.parse(stored);
   	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
   	decipher.setAuthTag(Buffer.from(tag, 'base64'));
   	const decrypted = Buffer.concat([
   		decipher.update(Buffer.from(data, 'base64')),
   		decipher.final()
   	]);
   	return decrypted.toString('utf8');
   }
   ```

C. Add a `encryptWithKey` helper that accepts a key parameter:
   ```typescript
   function encryptWithKey(plaintext: string, key: Buffer): string {
   	const iv = randomBytes(IV_LENGTH);
   	const cipher = createCipheriv('aes-256-gcm', key, iv);
   	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
   	const tag = cipher.getAuthTag();
   	return JSON.stringify({
   		iv: iv.toString('base64'),
   		tag: tag.toString('base64'),
   		data: encrypted.toString('base64')
   	});
   }
   ```

D. Export a `migrateEncryptionKey` function that re-encrypts all data from old key to new key:
   ```typescript
   export function migrateEncryptionKey(): void {
   	const legacyKey = getLegacyKey();
   	const newKey = getKey(); // This uses the new PBKDF2 derivation

   	// If keys are the same (shouldn't happen but guard), skip
   	if (legacyKey.equals(newKey)) return;

   	// This function is called from db.ts during initialization.
   	// It will re-encrypt all BLOB columns that were encrypted with the legacy key.
   	// The caller (db.ts) must pass data to re-encrypt.
   	// We just export the helpers here.
   }
   ```

   Actually, simpler approach: export `reEncryptValue` instead:
   ```typescript
   export function reEncryptValue(stored: string): string {
   	const legacyKey = getLegacyKey();
   	const newKey = getKey();
   	if (legacyKey.equals(newKey)) return stored;
   	const plaintext = decryptWithKey(stored, legacyKey);
   	return encryptWithKey(plaintext, newKey);
   }

   export function needsKeyMigration(): boolean {
   	const legacyKey = getLegacyKey();
   	const newKey = getKey();
   	return !legacyKey.equals(newKey);
   }
   ```

E. Now update `getKey()` to use the new PBKDF2 derivation (as described above).

F. Update the existing `encrypt` function to use `encryptWithKey(plaintext, getKey())` internally.

G. Update the existing `decrypt` function to use `decryptWithKey(stored, getKey())` internally.

**File:** `morning-clarity-journal/src/lib/db.ts`

H. At the end of the initialization block in `getDbInternal()` (after line 156, before `return db;`), add a call to a new migration function:
   ```typescript
   migrateEncryptedDataToNewKey(db);
   ```

I. Add the migration function in `db.ts`:
   ```typescript
   function migrateEncryptedDataToNewKey(database: Database.Database): void {
   	// Only run if key derivation changed
   	const { needsKeyMigration, reEncryptValue } = await import('$lib/server/crypto.js');
   	// NOTE: Since this is not async, use the already-imported functions.
   	// The imports are at top of file already.

   	if (!needsKeyMigration()) return;

   	// Re-encrypt all encrypted columns
   	// 1. entries.encrypted_data, entries.captured_lat_encrypted, entries.captured_lng_encrypted
   	const entries = database.prepare('SELECT id, encrypted_data, captured_lat_encrypted, captured_lng_encrypted FROM entries').all() as Array<{
   		id: number;
   		encrypted_data: Buffer;
   		captured_lat_encrypted: Buffer | null;
   		captured_lng_encrypted: Buffer | null;
   	}>;
   	const updateEntry = database.prepare('UPDATE entries SET encrypted_data = ?, captured_lat_encrypted = ?, captured_lng_encrypted = ? WHERE id = ?');
   	for (const row of entries) {
   		const newData = Buffer.from(reEncryptValue(row.encrypted_data.toString('utf8')), 'utf8');
   		const newLat = row.captured_lat_encrypted ? Buffer.from(reEncryptValue(row.captured_lat_encrypted.toString('utf8')), 'utf8') : null;
   		const newLng = row.captured_lng_encrypted ? Buffer.from(reEncryptValue(row.captured_lng_encrypted.toString('utf8')), 'utf8') : null;
   		updateEntry.run(newData, newLat, newLng, row.id);
   	}

   	// 2. locations: name_encrypted, lat_encrypted, lng_encrypted, address_encrypted
   	const locations = database.prepare('SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations').all() as Array<{
   		id: number;
   		name_encrypted: Buffer | null;
   		lat_encrypted: Buffer | null;
   		lng_encrypted: Buffer | null;
   		address_encrypted: Buffer | null;
   	}>;
   	const updateLocation = database.prepare('UPDATE locations SET name_encrypted = ?, lat_encrypted = ?, lng_encrypted = ?, address_encrypted = ? WHERE id = ?');
   	for (const row of locations) {
   		const newName = row.name_encrypted ? Buffer.from(reEncryptValue(row.name_encrypted.toString('utf8')), 'utf8') : null;
   		const newLat = row.lat_encrypted ? Buffer.from(reEncryptValue(row.lat_encrypted.toString('utf8')), 'utf8') : null;
   		const newLng = row.lng_encrypted ? Buffer.from(reEncryptValue(row.lng_encrypted.toString('utf8')), 'utf8') : null;
   		const newAddr = row.address_encrypted ? Buffer.from(reEncryptValue(row.address_encrypted.toString('utf8')), 'utf8') : null;
   		updateLocation.run(newName, newLat, newLng, newAddr, row.id);
   	}

   	// 3. templates: source_text_encrypted, parsed_json_encrypted
   	const templates = database.prepare('SELECT id, source_text_encrypted, parsed_json_encrypted FROM templates').all() as Array<{
   		id: number;
   		source_text_encrypted: Buffer;
   		parsed_json_encrypted: Buffer;
   	}>;
   	const updateTemplate = database.prepare('UPDATE templates SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?');
   	for (const row of templates) {
   		const newSource = Buffer.from(reEncryptValue(row.source_text_encrypted.toString('utf8')), 'utf8');
   		const newParsed = Buffer.from(reEncryptValue(row.parsed_json_encrypted.toString('utf8')), 'utf8');
   		updateTemplate.run(newSource, newParsed, row.id);
   	}

   	// 4. template_presets: source_text_encrypted, parsed_json_encrypted
   	const presets = database.prepare('SELECT id, source_text_encrypted, parsed_json_encrypted FROM template_presets').all() as Array<{
   		id: number;
   		source_text_encrypted: Buffer;
   		parsed_json_encrypted: Buffer;
   	}>;
   	const updatePreset = database.prepare('UPDATE template_presets SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?');
   	for (const row of presets) {
   		const newSource = Buffer.from(reEncryptValue(row.source_text_encrypted.toString('utf8')), 'utf8');
   		const newParsed = Buffer.from(reEncryptValue(row.parsed_json_encrypted.toString('utf8')), 'utf8');
   		updatePreset.run(newSource, newParsed, row.id);
   	}
   }
   ```

J. Add `needsKeyMigration` and `reEncryptValue` to the import from `'$lib/server/crypto.js'` at the top of `db.ts`:
   ```typescript
   import { decrypt, encrypt, needsKeyMigration, reEncryptValue } from '$lib/server/crypto.js';
   ```

**Guardrails:**
- After this step, the app MUST still decrypt all existing data correctly.
- Do not log plaintext data during migration.
- The migration only runs once (since after re-encryption, `needsKeyMigration()` returns false because the legacy key and new key will produce different results on next derivation — wait, that's wrong. The legacy key is ALWAYS `SHA256(secret)` and the new key is ALWAYS `PBKDF2(secret, salt)`. They will NEVER be equal. So we need a different flag.)

**IMPORTANT FIX:** Instead of comparing keys, use a `config` table flag to track whether migration has run:

Replace the `needsKeyMigration()` check with a config-table check in `db.ts`:
```typescript
function migrateEncryptedDataToNewKey(database: Database.Database): void {
	// Check if migration already completed
	const migrationDone = database.prepare("SELECT value FROM config WHERE key = 'encryption_key_migrated_v2'").get() as { value: string } | undefined;
	if (migrationDone?.value === 'true') return;

	// ... (all the re-encryption logic from above, but use getLegacyKey/getKey from crypto.ts)
	// After successful migration:
	database.prepare("INSERT INTO config (key, value) VALUES ('encryption_key_migrated_v2', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'").run();
}
```

And export `getLegacyKey` from crypto.ts as well (temporarily, for migration), or better: export a `decryptWithLegacyKey(stored: string): string` function:
```typescript
export function decryptWithLegacyKey(stored: string): string {
	const legacyKey = getLegacyKey();
	return decryptWithKey(stored, legacyKey);
}
```

Then in `db.ts`, the migration uses `decryptWithLegacyKey` + `encrypt` (which now uses new key):
```typescript
const plaintext = decryptWithLegacyKey(row.encrypted_data.toString('utf8'));
const newCiphertext = encrypt(plaintext);
const newBuffer = Buffer.from(newCiphertext, 'utf8');
```

Remove the `needsKeyMigration` and `reEncryptValue` exports — just use `decryptWithLegacyKey` + `encrypt`.

**Final import in db.ts:**
```typescript
import { decrypt, encrypt, decryptWithLegacyKey } from '$lib/server/crypto.js';
```

---

### Step 3: Add security headers to all responses

**File:** `morning-clarity-journal/src/hooks.server.ts`

**What to change:**

After the line `const response = await resolve(event);` (currently line 27), add the following security headers to every response BEFORE the cache-control logic:

```typescript
response.headers.set('X-Content-Type-Options', 'nosniff');
response.headers.set('X-Frame-Options', 'DENY');
response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
if (process.env.NODE_ENV === 'production') {
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
}
```

**Guardrails:**
- Do not remove or change the existing HTTPS redirect logic.
- Do not remove or change the existing cache-control logic.
- `'unsafe-inline'` is needed for style-src because SvelteKit/Tailwind uses inline styles. If svelte-check or the build fails without it, keep it.
- Only set HSTS and CSP in production to avoid breaking local dev.

---

### Step 4: Add rate limiting to the session verification endpoint

**File:** `morning-clarity-journal/src/routes/api/session/+server.ts`

**What to change:**

Add rate limiting to prevent brute-force session probing. Use the same pattern as the auth endpoint:

1. Import rate limiting from auth.ts:
   ```typescript
   import { verifySessionToken, checkAuthRateLimit, recordAuthFailure, clearAuthFailures } from '$lib/auth.js';
   ```

2. Replace the `GET` handler with:
   ```typescript
   export const GET: RequestHandler = ({ cookies, getClientAddress }) => {
   	const ip = getClientAddress();
   	const rateLimitCheck = checkAuthRateLimit(ip);
   	if (!rateLimitCheck.ok) {
   		return new Response(null, {
   			status: 429,
   			headers: { 'Retry-After': String(rateLimitCheck.retryAfter) }
   		});
   	}

   	const sessionCookie = cookies.get('session');
   	if (verifySessionToken(sessionCookie)) {
   		clearAuthFailures(ip);
   		return new Response(null, { status: 204 });
   	}

   	recordAuthFailure(ip);
   	return new Response(null, { status: 401 });
   };
   ```

**Guardrails:**
- Keep the same 204/401 response codes.
- Do not add a response body.
- Use the existing rate limit constants (5 attempts per 15 minutes).

---

### Step 5: Add a logout endpoint

**File to create:** `morning-clarity-journal/src/routes/api/auth/logout/+server.ts`

**What to create:**

Create a new file with the following content:

```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete('session', { path: '/' });
	return new Response(null, { status: 204 });
};
```

**Guardrails:**
- This is a new file, so create it.
- The `cookies.delete` call must include `path: '/'` to match the original cookie path.
- No authentication check needed (logging out an unauthenticated user is a no-op).
- Do not add this route to the `excludedRoutes` list in `hooks.server.ts` — it requires an active session to be meaningful, but the middleware should still allow it. Actually, since the session cookie is being deleted, the user might not have a valid session. Add `'/api/auth/logout'` to the `excludedRoutes` array in `hooks.server.ts` so unauthenticated logouts don't return 403.

**File to also edit:** `morning-clarity-journal/src/hooks.server.ts`

Add `'/api/auth/logout'` to the `excludedRoutes` array:
```typescript
const excludedRoutes = ['/api/auth', '/api/session', '/api/auth/logout'];
```

---

### Step 6: Add a data export endpoint (JSON format)

**File to create:** `morning-clarity-journal/src/routes/api/export/+server.ts`

**What to create:**

This endpoint exports ALL user data as a single JSON file. It requires authentication (not in excludedRoutes).

```typescript
import type { RequestHandler } from './$types';
import { getAllEntries, getEntryByDate, getLocations, getActiveTemplate, getTemplatePresets, getTemplatePresetById } from '$lib/db.js';
import { decrypt } from '$lib/server/crypto.js';

export const GET: RequestHandler = async () => {
	// Gather all entries with decrypted data
	const entries = getAllEntries();
	const entriesWithData = entries.map(entry => {
		const full = getEntryByDate(entry.date);
		let data = null;
		if (full?.rawData) {
			try {
				const decrypted = decrypt(full.rawData.toString('utf8'));
				data = JSON.parse(decrypted);
			} catch {
				data = null;
			}
		}
		return {
			date: entry.date,
			timestamp: entry.timestamp,
			location_name: entry.location_name ?? null,
			captured_lat: entry.captured_lat,
			captured_lng: entry.captured_lng,
			data
		};
	});

	// Gather all locations
	const locations = getLocations();

	// Gather active template
	const activeTemplate = getActiveTemplate();

	// Gather all presets
	const presetSummaries = getTemplatePresets();
	const presets = presetSummaries.map(p => {
		const full = getTemplatePresetById(p.id);
		return {
			id: p.id,
			name: p.name,
			sourceText: full?.sourceText ?? null
		};
	});

	const exportData = {
		exportedAt: new Date().toISOString(),
		entries: entriesWithData,
		locations: locations.map(l => ({
			name: l.name,
			lat: l.lat,
			lng: l.lng,
			address: l.address
		})),
		activeTemplate: activeTemplate ? {
			sourceText: activeTemplate.sourceText
		} : null,
		presets
	};

	const json = JSON.stringify(exportData, null, 2);
	const filename = `journal-export-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(json, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
```

**Guardrails:**
- This endpoint is protected by the session middleware (not in excludedRoutes).
- Do not log any decrypted data.
- The response is a downloadable JSON file.

---

### Step 7: Add a data wipe endpoint

**File to create:** `morning-clarity-journal/src/routes/api/wipe/+server.ts`

**What to create:**

This endpoint deletes ALL user data from the database (entries, locations, templates, presets). It requires authentication and a confirmation body.

```typescript
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';

interface WipePayload {
	confirm: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<WipePayload>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	// Require explicit confirmation string to prevent accidental wipes
	if (body.data?.confirm !== 'DELETE_ALL_MY_DATA') {
		return errorResponse('Must send { "confirm": "DELETE_ALL_MY_DATA" } to proceed');
	}

	const database = getDb();

	// Delete all user data
	database.exec('DELETE FROM entries');
	database.exec('DELETE FROM locations');
	database.exec('DELETE FROM templates');
	database.exec('DELETE FROM template_presets');
	database.exec("DELETE FROM config WHERE key != 'encryption_key_migrated_v2'");

	return successResponse({ message: 'All data deleted' });
};
```

**Guardrails:**
- This endpoint is protected by the session middleware (not in excludedRoutes).
- Requires the exact confirmation string `DELETE_ALL_MY_DATA`.
- Preserves the encryption migration flag in config so migration doesn't re-run.
- Do not log what was deleted.

---

### Step 8: Sanitize console.error calls

**Files to edit:**
- `morning-clarity-journal/src/routes/api/backup/+server.ts`

**What to change:**

Replace the console.error on line 60:
```typescript
console.error('Backup error:', error);
```
With:
```typescript
console.error('Backup error:', error instanceof Error ? error.message : 'Unknown error');
```

This prevents stack traces from leaking into production logs.

**Guardrails:**
- Only change this one console.error in the server-side code.
- Do not remove the error logging entirely — just sanitize it.
- Do not touch client-side console.error calls (those are visible only to the user themselves).

---

### Step 9: Fix .env.example to use placeholder values

**File:** `morning-clarity-journal/.env.example`

**What to change:**

Replace the entire file contents with:
```
# Environment Configuration
# Copy this file to .env for local development

# Enable 2pm time cutoff for journal access
# Set to 'true' to enforce the cutoff (default is disabled)
VITE_ENABLE_TIME_CUTOFF=false
JOURNAL_ENABLE_TIME_CUTOFF=false

# IMPORTANT: Change all values below before deploying to production.
# Generate a strong passphrase (16+ characters, mix of letters/numbers/symbols).
JOURNAL_PASSPHRASE=change-me-to-a-strong-passphrase

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JOURNAL_ENCRYPTION_KEY=change-me-generate-with-crypto-randombytes-32

# Must be at least 32 characters. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JOURNAL_SESSION_SECRET=change-me-must-be-at-least-32-characters-long
```

**Guardrails:**
- Do not include real credentials or passphrases.
- Keep the time cutoff variables unchanged.
- Make sure instructions are clear for generating secure values.

---

### Step 10: Remove plaintext fallback columns from write paths

**File:** `morning-clarity-journal/src/lib/db.ts`

**What to change:**

Currently, the `addLocation` function writes empty placeholder values to the old plaintext columns (`name`, `lat`, `lng`, `address`). These columns still have `NOT NULL` constraints in the CREATE TABLE statement, so they can't be removed without a migration. Instead, change the CREATE TABLE statement to make them nullable and stop writing to them.

1. In the `CREATE TABLE locations` block (around line 67), change:
   ```sql
   name TEXT NOT NULL,
   lat REAL NOT NULL,
   lng REAL NOT NULL,
   address TEXT,
   ```
   To:
   ```sql
   name TEXT DEFAULT '',
   lat REAL DEFAULT 0,
   lng REAL DEFAULT 0,
   address TEXT,
   ```

2. In the `addLocation` function, stop writing placeholder values to old columns. Change the INSERT to:
   ```typescript
   const result = database.prepare(`
   	INSERT INTO locations (name, lat, lng, address, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted)
   	VALUES ('', 0, 0, NULL, ?, ?, ?, ?)
   `).run(
   	nameEncrypted,
   	latEncrypted,
   	lngEncrypted,
   	addressEncrypted
   );
   ```
   (This is functionally the same as before but makes intent clear — old columns get empty/zero values.)

3. In `saveEntry` and `updateEntry`, the `captured_lat` and `captured_lng` columns already write `null`. Confirm they stay as `null` and are not reverted. No change needed if already null.

**Guardrails:**
- Do not drop columns (SQLite doesn't support DROP COLUMN easily).
- The schema change only affects newly created databases. Existing databases already have the columns.
- Do not change any read paths (they already read from `*_encrypted` columns only).

---

### Step 11: Final verification

Run after each step: `npx svelte-check --threshold error`.

After all steps:
1. `npm run build`
2. `npm run dev`

Manual checks:
- App boots and login works with the correct passphrase.
- Creating a new entry works (encryption with new key derivation).
- Existing entries are still readable (migration ran successfully).
- `GET /api/export` returns a JSON file with all decrypted data.
- `POST /api/wipe` with `{"confirm":"DELETE_ALL_MY_DATA"}` clears all data.
- `POST /api/auth/logout` clears the session cookie.
- Response headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, etc.
- `.env.example` does not contain real credentials.
- No console.error calls log raw error objects on the server side.

---

## Implementation Logs

Step 1: Updated passphrase verification to use PBKDF2 with a deterministic salt and added PBKDF2 constants in `src/lib/auth.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 2: Switched encryption key derivation to PBKDF2, added legacy decrypt support, and implemented a one-time config-flagged re-encryption migration in `src/lib/server/crypto.ts` and `src/lib/db.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 3: Added security headers to all responses in `src/hooks.server.ts`, including production-only HSTS/CSP. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 4: Added rate limiting to `/api/session` with auth failure tracking and retry headers in `src/routes/api/session/+server.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 5: Added logout endpoint in `src/routes/api/auth/logout/+server.ts` and allowed unauthenticated access by updating `src/hooks.server.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Post-review fix: Made encryption key migration idempotent per-row to handle fresh DBs and partial retries safely in `src/lib/db.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 6: Added authenticated data export endpoint in `src/routes/api/export/+server.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 7: Added authenticated data wipe endpoint in `src/routes/api/wipe/+server.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 8: Sanitized server-side backup error logging in `src/routes/api/backup/+server.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 9: Updated `.env.example` with placeholder values and generation guidance. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
Step 10: Made legacy plaintext location columns nullable/defaulted and simplified `addLocation` placeholders in `src/lib/db.ts`. Ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
