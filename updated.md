## Code Quality Refactoring Plan – 200 Line Maximum Compliance

Goal: Refactor the 7 files that exceed the 200-line maximum rule defined in AGENTS.md. This plan splits large files into smaller, focused modules while preserving all existing functionality and maintaining backward compatibility.

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.

Refactoring guardrails (apply to all steps below):
- Do not change any existing functionality or behavior.
- All exports must remain accessible from their original import paths (use re-exports).
- All existing tests must continue to pass.
- Preserve existing type definitions and interfaces.
- Every new `.svelte` file must include the mandatory header comment block.
- Every new `.ts` file should have a single clear responsibility.
- Use tabs for indentation, single quotes for strings (per AGENTS.md).
- Keep each new file under 200 lines.

---

## Files to Refactor (Priority Order)

| File | Current Lines | Target | Priority |
|------|---------------|--------|----------|
| `src/lib/db.ts` | 1,264 | Split into 6 modules | 🔴 Critical |
| `src/lib/components/SettingsModal.svelte` | 883 | Split into 4 components | 🔴 Critical |
| `src/lib/template.ts` | 414 | Split into 2 modules | 🟡 High |
| `src/routes/journal/+page.svelte` | 368 | Extract logic to utilities | 🟡 High |
| `src/lib/components/JournalForm.svelte` | 258 | Minor extraction | 🟢 Medium |
| `src/routes/entry/[date]/+page.svelte` | 226 | Minor extraction | 🟢 Medium |
| `src/routes/+page.svelte` | 214 | Minor extraction | 🟢 Low |

---

### Step 1: Create Database Module Directory Structure

**Problem:** The `src/lib/db.ts` file is 1,264 lines (6x the limit). It contains database initialization, schema migrations, entry operations, location operations, template operations, backup operations, session management, and encryption helpers all in one file.

**Files to create:**
- `morning-clarity-journal/src/lib/db/index.ts`
- `morning-clarity-journal/src/lib/db/connection.ts`
- `morning-clarity-journal/src/lib/db/schema.ts`
- `morning-clarity-journal/src/lib/db/types.ts`

**What to change:**

1. Create the directory `src/lib/db/` if it does not exist.

2. Create `src/lib/db/types.ts` with all the interface and type definitions from `db.ts`. Extract these interfaces (found between lines 214-281 of the original file):
   ```typescript
   // Journal entry types
   export interface JournalData {
   	whoAmIDoingThisFor: string;
   	whatMakingAnxious: string;
   	whatAvoiding: string;
   	whyAvoiding: string;
   	fearUnderneath: string;
   	evidenceFearNotTrue: string;
   	upsideIfAct: string;
   	consumeInsteadProduce: string;
   	exactDistraction: string;
   	wasteToday: string;
   	commitment1: string;
   	commitment2: string;
   	commitment3: string;
   	// Legacy fields (for backward compatibility with old entries)
   	howLikely: string;
   	howBad10Days: string;
   	howBad10Months: string;
   	howBad10Years: string;
   	realFear: string;
   	kimTest: string;
   	whatDoILose: string;
   	whatConsumeInsteadProduce: string;
   	egoWillTell: string;
   	triggerTimeSituation: string;
   	temptedWhenWillBecause: string;
   	track: string;
   	nonNeg1What: string;
   	nonNeg1When: string;
   	nonNeg2What: string;
   	nonNeg2When: string;
   	nonNeg3What: string;
   	nonNeg3When: string;
   	trapRule: string;
   }

   export interface Entry {
   	id: number;
   	date: string;
   	timestamp: string;
   	location_id: number | null;
   	location_name?: string;
   	captured_lat: number | null;
   	captured_lng: number | null;
   	template_id: number | null;
   	created_at: string;
   }

   export interface EntryWithData extends Entry {
   	data: JournalData;
   }

   export interface TemplatePresetSummary {
   	id: number;
   	name: string;
   	created_at: string;
   }

   export interface ActiveSession {
   	nonce: string;
   	expiresAt: number;
   	deviceInfo: string;
   	locationId: number | null;
   	locationLat: number | null;
   	locationLng: number | null;
   	createdAt: number;
   }

   export interface Location {
   	id: number;
   	name: string;
   	lat: number;
   	lng: number;
   	address: string | null;
   }
   ```

3. Create `src/lib/db/connection.ts` with the database connection logic. Extract lines 1-28 (imports and constants) and lines 30-212 (getDbInternal function) from the original file:
   ```typescript
   import Database from 'better-sqlite3';
   import path from 'path';
   import fs from 'fs';
   import { randomBytes } from 'crypto';
   import { initializeSchema } from './schema.js';

   // Database path - use /data for production (Fly.io volume), local for dev
   export const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
   export const DB_PATH = path.join(DATA_DIR, 'journal.db');
   export const EMPTY_TEXT_PLACEHOLDER = '';
   export const EMPTY_COORDINATE_PLACEHOLDER = 0;

   // Lazy-initialized database connection
   let db: Database.Database | null = null;

   export function getDbInternal(): Database.Database {
   	if (db) return db;

   	// Ensure data directory exists
   	if (!fs.existsSync(DATA_DIR)) {
   		fs.mkdirSync(DATA_DIR, { recursive: true });
   	}

   	// Initialize database connection
   	db = new Database(DB_PATH);
   	db.pragma('journal_mode = WAL');

   	// Initialize schema and run migrations
   	initializeSchema(db);

   	return db;
   }

   export function getDb(): Database.Database {
   	return getDbInternal();
   }
   ```

4. Create `src/lib/db/schema.ts` with the schema initialization and migration logic. Extract the schema creation SQL (lines 43-127) and all migration functions (lines 129-212, and the backfill functions at the end of the file lines 1139-1264):
   ```typescript
   import type Database from 'better-sqlite3';
   import { encrypt, decrypt, decryptWithLegacyKey } from '$lib/server/crypto.js';
   import { parseTemplateSource, serializeDefaultTemplate } from '../template.js';
   import { EMPTY_TEXT_PLACEHOLDER, EMPTY_COORDINATE_PLACEHOLDER } from './connection.js';

   export function initializeSchema(db: Database.Database): void {
   	// Schema creation SQL
   	db.exec(`
   		CREATE TABLE IF NOT EXISTS config (
   			key TEXT PRIMARY KEY,
   			value TEXT
   		);
   		// ... rest of schema creation
   	`);

   	// Run all migrations
   	runMigrations(db);
   }

   function runMigrations(db: Database.Database): void {
   	// All the PRAGMA table_info checks and ALTER TABLE statements
   	// All the backfill functions
   }

   // Include all backfill functions here
   ```

5. Create `src/lib/db/index.ts` that re-exports everything from the original `db.ts` location. This file will eventually become the main orchestrator that imports from all sub-modules and re-exports for backward compatibility:
   ```typescript
   // Re-export all types
   export * from './types.js';

   // Re-export database connection
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';

   // Note: More exports will be added in subsequent steps
   ```

**Guardrails:**
- Do not modify the original `src/lib/db.ts` file in this step.
- The new files should compile without errors but won't be used yet.
- Ensure all imports use `.js` extension for ESM compatibility.

---

### Step 2: Extract Entry Operations from db.ts

**Problem:** Entry-related operations (saveEntry, updateEntry, getAllEntries, getEntryByDate, etc.) are mixed with other database operations in db.ts.

**Files:**
- `morning-clarity-journal/src/lib/db/entries.ts` (new file)
- `morning-clarity-journal/src/lib/db/index.ts` (update)

**What to change:**

1. Create `src/lib/db/entries.ts` containing all entry-related functions. Extract these functions from the original db.ts (approximately lines 286-477):
   - `saveEntry` (lines 286-317)
   - `updateEntry` (lines 322-354)
   - `getAllEntries` (lines 359-397)
   - `getRecentEntrySummaries` (lines 399-436)
   - `getEntryByDate` (lines 441-477)
   - `hasEntryForDate` (lines 778-782)
   - `getEntryDates` (lines 787-791)

   The file should look like:
   ```typescript
   import { getDb } from './connection.js';
   import { encrypt } from '$lib/server/crypto.js';
   import { getLocations, getLocationById } from './locations.js';
   import { encryptOptionalNumber, decryptOptionalNumber } from './crypto-helpers.js';
   import type { Entry, EntryWithData } from './types.js';

   export function saveEntry(
   	date: string,
   	timestamp: string,
   	locationId: number | null,
   	encryptedData: string,
   	templateId: number | null,
   	capturedLat?: number | null,
   	capturedLng?: number | null
   ): number {
   	// ... implementation from original file
   }

   export function updateEntry(
   	date: string,
   	timestamp: string,
   	locationId: number | null,
   	encryptedData: string,
   	templateId: number | null,
   	capturedLat?: number | null,
   	capturedLng?: number | null
   ): boolean {
   	// ... implementation from original file
   }

   export function getAllEntries(): Entry[] {
   	// ... implementation from original file
   }

   export function getRecentEntrySummaries(limit: number): Entry[] {
   	// ... implementation from original file
   }

   export function getEntryByDate(date: string): (EntryWithData & { rawData: Buffer }) | null {
   	// ... implementation from original file
   }

   export function hasEntryForDate(date: string): boolean {
   	// ... implementation from original file
   }

   export function getEntryDates(): string[] {
   	// ... implementation from original file
   }
   ```

2. Create `src/lib/db/crypto-helpers.ts` for the encryption helper functions (extract from lines 1009-1035 of original file):
   ```typescript
   import { encrypt, decrypt } from '$lib/server/crypto.js';

   export function encryptOptionalString(value: string | null | undefined): Buffer | null {
   	if (value === null || value === undefined) return null;
   	const encrypted = encrypt(value);
   	return Buffer.from(encrypted, 'utf8');
   }

   export function encryptOptionalNumber(value: number | null | undefined): Buffer | null {
   	if (value === null || value === undefined) return null;
   	const encrypted = encrypt(value.toString());
   	return Buffer.from(encrypted, 'utf8');
   }

   export function decryptOptionalString(value: Buffer | null | undefined): string | null {
   	if (!value) return null;
   	return decrypt(value.toString('utf8'));
   }

   export function decryptOptionalNumber(value: Buffer | null | undefined): number | null {
   	const decrypted = decryptOptionalString(value);
   	if (decrypted === null) return null;
   	const parsed = Number(decrypted);
   	return Number.isFinite(parsed) ? parsed : null;
   }
   ```

3. Update `src/lib/db/index.ts` to re-export the entry functions:
   ```typescript
   export * from './types.js';
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';
   export * from './entries.js';
   export * from './crypto-helpers.js';
   ```

**Guardrails:**
- Entry functions depend on location functions, so create placeholder imports for now.
- All entry functions must maintain exact same signatures as original.
- Do not modify the original db.ts file yet.

---

### Step 3: Extract Location Operations from db.ts

**Problem:** Location-related operations are mixed with other database operations.

**Files:**
- `morning-clarity-journal/src/lib/db/locations.ts` (new file)
- `morning-clarity-journal/src/lib/db/index.ts` (update)

**What to change:**

1. Create `src/lib/db/locations.ts` containing all location-related functions. Extract these functions from the original db.ts (approximately lines 793-915):
   - `getLocations` (lines 805-824)
   - `findMatchingLocation` (lines 839-847)
   - `addLocation` (lines 852-868)
   - `deleteLocation` (lines 873-877)
   - `getLocationById` (lines 882-901)
   - `locationNameExists` (lines 906-915)
   - `haversineDistanceKm` helper (lines 828-837)
   - `normalizeLocationName` helper (lines 1033-1035)
   - `LOCATION_MATCH_TOLERANCE_KM` constant (line 826)

   The file should look like:
   ```typescript
   import { getDb } from './connection.js';
   import { EMPTY_TEXT_PLACEHOLDER, EMPTY_COORDINATE_PLACEHOLDER } from './connection.js';
   import { encryptOptionalString, encryptOptionalNumber, decryptOptionalString, decryptOptionalNumber } from './crypto-helpers.js';
   import type { Location } from './types.js';

   const LOCATION_MATCH_TOLERANCE_KM = 0.5;

   function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
   	const R = 6371;
   	const dLat = (lat2 - lat1) * Math.PI / 180;
   	const dLng = (lng2 - lng1) * Math.PI / 180;
   	const a = Math.sin(dLat / 2) ** 2 +
   		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
   		Math.sin(dLng / 2) ** 2;
   	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
   	return R * c;
   }

   function normalizeLocationName(value: string): string {
   	return value.trim().toLowerCase();
   }

   export function getLocations(): Location[] {
   	// ... implementation from original file
   }

   export function findMatchingLocation(lat: number, lng: number): Location | null {
   	// ... implementation from original file
   }

   export function addLocation(name: string, lat: number, lng: number, address?: string): number {
   	// ... implementation from original file
   }

   export function deleteLocation(id: number): boolean {
   	// ... implementation from original file
   }

   export function getLocationById(id: number): Location | null {
   	// ... implementation from original file
   }

   export function locationNameExists(name: string): boolean {
   	// ... implementation from original file
   }
   ```

2. Update `src/lib/db/index.ts` to re-export location functions:
   ```typescript
   export * from './types.js';
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';
   export * from './crypto-helpers.js';
   export * from './locations.js';
   export * from './entries.js';
   ```

**Guardrails:**
- All location functions must maintain exact same signatures as original.
- Do not modify the original db.ts file yet.

---

### Step 4: Extract Template Operations from db.ts

**Problem:** Template-related operations are mixed with other database operations.

**Files:**
- `morning-clarity-journal/src/lib/db/templates.ts` (new file)
- `morning-clarity-journal/src/lib/db/index.ts` (update)

**What to change:**

1. Create `src/lib/db/templates.ts` containing all template-related functions. Extract these functions from the original db.ts (approximately lines 615-773):
   - `createTemplateVersion` (lines 615-627)
   - `createTemplatePreset` (lines 629-641)
   - `getTemplatePresets` (lines 643-650)
   - `getTemplatePresetById` (lines 652-670)
   - `renameTemplatePreset` (lines 672-680)
   - `deleteTemplatePreset` (lines 682-689)
   - `setActiveTemplate` (lines 691-698)
   - `getTemplateById` (lines 700-717)
   - `getActiveTemplate` (lines 719-731)
   - `ensureActiveTemplate` (lines 733-754)
   - `backfillEntryTemplateIds` (lines 756-763)
   - `ensureTemplatePresetSeed` (lines 765-773)

   The file should look like:
   ```typescript
   import { getDb } from './connection.js';
   import { encrypt, decrypt } from '$lib/server/crypto.js';
   import { parseTemplateSource, serializeDefaultTemplate } from '../template.js';
   import type { TemplateModel } from '../template.js';
   import type { TemplatePresetSummary } from './types.js';
   import { EMPTY_TEXT_PLACEHOLDER } from './connection.js';

   export function createTemplateVersion(sourceText: string, parsed: TemplateModel): number {
   	// ... implementation from original file
   }

   export function createTemplatePreset(name: string, sourceText: string, parsed: TemplateModel): number {
   	// ... implementation from original file
   }

   export function getTemplatePresets(): TemplatePresetSummary[] {
   	// ... implementation from original file
   }

   // ... rest of template functions
   ```

2. Update `src/lib/db/index.ts` to re-export template functions:
   ```typescript
   export * from './types.js';
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';
   export * from './crypto-helpers.js';
   export * from './locations.js';
   export * from './entries.js';
   export * from './templates.js';
   ```

**Guardrails:**
- All template functions must maintain exact same signatures as original.
- Template functions import from `../template.js` for TemplateModel type.
- Do not modify the original db.ts file yet.

---

### Step 5: Extract Session and Auth Operations from db.ts

**Problem:** Session management and authentication rate limiting are mixed with other database operations.

**Files:**
- `morning-clarity-journal/src/lib/db/sessions.ts` (new file)
- `morning-clarity-journal/src/lib/db/index.ts` (update)

**What to change:**

1. Create `src/lib/db/sessions.ts` containing all session-related functions. Extract these functions from the original db.ts (approximately lines 479-606):
   - `setActiveSession` (lines 479-503)
   - `updateSessionExpiration` (lines 505-519)
   - `clearActiveSession` (lines 521-524)
   - `getActiveSession` (lines 526-537)
   - `getPassphraseSalt` (lines 539-556)
   - `getAuthRateLimit` (lines 558-566)
   - `setAuthRateLimit` (lines 568-575)
   - `clearAuthRateLimit` (lines 577-580)
   - `blacklistSessionNonce` (lines 582-595)
   - `isSessionNonceBlacklisted` (lines 597-606)

   The file should look like:
   ```typescript
   import { randomBytes } from 'crypto';
   import { getDb } from './connection.js';
   import type { ActiveSession } from './types.js';

   export function setActiveSession(
   	nonce: string,
   	expiresAt: number,
   	deviceInfo: string,
   	locationId: number | null,
   	locationLat: number | null,
   	locationLng: number | null
   ): void {
   	// ... implementation from original file
   }

   export function updateSessionExpiration(nonce: string, newExpiresAt: number): boolean {
   	// ... implementation from original file
   }

   export function clearActiveSession(): void {
   	// ... implementation from original file
   }

   export function getActiveSession(): ActiveSession | null {
   	// ... implementation from original file
   }

   export function getPassphraseSalt(): string {
   	// ... implementation from original file
   }

   export function getAuthRateLimit(ip: string): { count: number; resetAt: number } | null {
   	// ... implementation from original file
   }

   export function setAuthRateLimit(ip: string, count: number, resetAt: number): void {
   	// ... implementation from original file
   }

   export function clearAuthRateLimit(ip: string): void {
   	// ... implementation from original file
   }

   export function blacklistSessionNonce(nonce: string, expiresAt: number): void {
   	// ... implementation from original file
   }

   export function isSessionNonceBlacklisted(nonce: string): boolean {
   	// ... implementation from original file
   }
   ```

2. Update `src/lib/db/index.ts` to re-export session functions:
   ```typescript
   export * from './types.js';
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';
   export * from './crypto-helpers.js';
   export * from './locations.js';
   export * from './entries.js';
   export * from './templates.js';
   export * from './sessions.js';
   ```

**Guardrails:**
- All session functions must maintain exact same signatures as original.
- Do not modify the original db.ts file yet.

---

### Step 6: Extract Backup Operations from db.ts

**Problem:** Backup-related operations are mixed with other database operations.

**Files:**
- `morning-clarity-journal/src/lib/db/backups.ts` (new file)
- `morning-clarity-journal/src/lib/db/index.ts` (update)

**What to change:**

1. Create `src/lib/db/backups.ts` containing all backup-related functions. Extract these functions from the original db.ts (approximately lines 921-1007):
   - `getBackupEncryptionKey` helper (lines 18-25)
   - Backup constants: `BACKUP_ENCRYPTION_ALGO`, `BACKUP_IV_LENGTH`, `BACKUP_AUTH_TAG_LENGTH` (lines 14-16)
   - `createBackup` (lines 921-963)
   - `getBackups` (lines 968-992)
   - `decryptBackup` (lines 994-1007)

   The file should look like:
   ```typescript
   import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
   import path from 'path';
   import fs from 'fs';
   import { getDb, DATA_DIR, DB_PATH } from './connection.js';

   const BACKUP_ENCRYPTION_ALGO = 'aes-256-gcm';
   const BACKUP_IV_LENGTH = 12;
   const BACKUP_AUTH_TAG_LENGTH = 16;

   function getBackupEncryptionKey(): Buffer {
   	const secret = process.env.JOURNAL_ENCRYPTION_KEY;
   	if (!secret) {
   		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
   	}
   	return scryptSync(secret, 'mcj-backup-encryption-salt', 32);
   }

   export function createBackup(): string {
   	// ... implementation from original file
   }

   export function getBackups(): Array<{ filename: string; path: string; size: number; created: Date }> {
   	// ... implementation from original file
   }

   export function decryptBackup(encryptedPath: string): Buffer {
   	// ... implementation from original file
   }
   ```

2. Update `src/lib/db/index.ts` to re-export backup functions:
   ```typescript
   export * from './types.js';
   export { getDb, DATA_DIR, DB_PATH } from './connection.js';
   export * from './crypto-helpers.js';
   export * from './locations.js';
   export * from './entries.js';
   export * from './templates.js';
   export * from './sessions.js';
   export * from './backups.js';
   ```

**Guardrails:**
- All backup functions must maintain exact same signatures as original.
- Do not modify the original db.ts file yet.

---

### Step 7: Replace Original db.ts with Index Re-exports

**Problem:** Now that all functions are extracted to sub-modules, the original db.ts needs to be replaced with an index file that re-exports everything for backward compatibility.

**Files:**
- `morning-clarity-journal/src/lib/db.ts` (replace entire content)

**What to change:**

1. Replace the entire content of `src/lib/db.ts` with re-exports from the db/ directory:
   ```typescript
   // Re-export all database functionality from sub-modules
   // This file maintains backward compatibility with existing imports

   export * from './db/types.js';
   export { getDb, DATA_DIR, DB_PATH } from './db/connection.js';
   export * from './db/crypto-helpers.js';
   export * from './db/locations.js';
   export * from './db/entries.js';
   export * from './db/templates.js';
   export * from './db/sessions.js';
   export * from './db/backups.js';
   ```

2. Verify all existing imports throughout the codebase still work:
   - `import { getDb, ... } from '$lib/db.js'` should continue to work
   - All type imports should continue to work

**Guardrails:**
- Run `npx svelte-check --threshold error` to verify no import errors.
- Run `npm run build` to verify the app compiles.
- All imports from `$lib/db.js` throughout the codebase must continue to work without modification.

---

### Step 8: Create Settings Modal Sub-components Directory

**Problem:** The `SettingsModal.svelte` file is 883 lines (4x the limit). It contains three distinct tab panels: Locations, Database, and Template, each with their own state and logic.

**Files to create:**
- `morning-clarity-journal/src/lib/components/settings/SettingsLocations.svelte`
- `morning-clarity-journal/src/lib/components/settings/SettingsDatabase.svelte`
- `morning-clarity-journal/src/lib/components/settings/SettingsTemplate.svelte`

**What to change:**

1. Create directory `src/lib/components/settings/` if it does not exist.

2. Create `src/lib/components/settings/SettingsLocations.svelte` with the Locations tab content. Extract from the original SettingsModal.svelte lines 534-622 (the `{#if activeTab === 'locations'}` block):
   ```svelte
   <!-- purpose: Location management panel for settings -->
   <!-- context: Sub-component of SettingsModal for adding/deleting locations -->
   <!-- location: src/lib/components/settings/SettingsLocations.svelte -->

   <script lang="ts">
   	import { formatCoordinate } from '$lib/location-utils.js';
   	import { captureAndSaveLocation, addLocation, deleteLocation } from '$lib/journal-actions.js';
   	import type { Location } from '$lib/db.js';
   	import Icon from '$lib/components/Icons.svelte';
   	import Spinner from '$lib/components/Spinner.svelte';
   	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
   	import SettingsRow from '$lib/components/SettingsRow.svelte';
   	import ExpandableSection from '$lib/components/ExpandableSection.svelte';

   	let {
   		locations,
   		onLocationsChanged
   	}: {
   		locations: Location[];
   		onLocationsChanged: () => Promise<void>;
   	} = $props();

   	let newLocationName = $state('');
   	let newLocationLat = $state('');
   	let newLocationLng = $state('');
   	let newLocationAddress = $state('');
   	let isGettingLocation = $state(false);
   	let locationError = $state('');
   	let isAddingLocation = $state(false);
   	let isDeletingLocation = $state<number | null>(null);

   	function getCurrentLocationAndSave() {
   		// ... implementation from original
   	}

   	async function addLocationPreset() {
   		// ... implementation from original
   	}

   	async function deleteLocationPreset(id: number) {
   		// ... implementation from original
   	}
   </script>

   <section class="settings-tab-panel">
   	<!-- Locations tab HTML from original file -->
   </section>
   ```

3. Create `src/lib/components/settings/SettingsDatabase.svelte` with the Database tab content. Extract from the original SettingsModal.svelte lines 624-711 (the `{:else if activeTab === 'database'}` block):
   ```svelte
   <!-- purpose: Database backup and data management panel -->
   <!-- context: Sub-component of SettingsModal for backups, exports, and data wipe -->
   <!-- location: src/lib/components/settings/SettingsDatabase.svelte -->

   <script lang="ts">
   	import { TIME } from '$lib/constants.js';
   	import { requestBackup, fetchBackups } from '$lib/journal-actions.js';
   	import { apiFetch } from '$lib/api-client.js';
   	import Icon from '$lib/components/Icons.svelte';
   	import Spinner from '$lib/components/Spinner.svelte';
   	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
   	import SettingsRow from '$lib/components/SettingsRow.svelte';

   	let {
   		onLocationsChanged,
   		onTemplateChanged
   	}: {
   		onLocationsChanged: () => Promise<void>;
   		onTemplateChanged: () => Promise<void>;
   	} = $props();

   	let isCreatingBackup = $state(false);
   	let backupError = $state('');
   	let backupSuccess = $state('');
   	let backups = $state<{ filename: string; size: number; created: string }[]>([]);
   	let isLoadingBackups = $state(false);
   	let isExporting = $state(false);
   	let showWipeConfirm = $state(false);
   	let isWiping = $state(false);
   	let wipeError = $state('');

   	// ... all database-related functions from original
   </script>

   <section class="settings-tab-panel">
   	<!-- Database tab HTML from original file -->
   </section>
   ```

4. Create `src/lib/components/settings/SettingsTemplate.svelte` with the Template tab content. Extract from the original SettingsModal.svelte lines 713-881 (the `{:else}` block which is the template tab):
   ```svelte
   <!-- purpose: Template editor and preset management panel -->
   <!-- context: Sub-component of SettingsModal for editing journal templates -->
   <!-- location: src/lib/components/settings/SettingsTemplate.svelte -->

   <script lang="ts">
   	import { apiFetch } from '$lib/api-client.js';
   	import Icon from '$lib/components/Icons.svelte';
   	import Spinner from '$lib/components/Spinner.svelte';
   	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
   	import SettingsRow from '$lib/components/SettingsRow.svelte';
   	import ExpandableSection from '$lib/components/ExpandableSection.svelte';
   	import Dropdown from '$lib/components/Dropdown.svelte';

   	let {
   		onTemplateChanged
   	}: {
   		onTemplateChanged: () => Promise<void>;
   	} = $props();

   	// All template state from original file lines 47-70
   	let isLoadingTemplate = $state(false);
   	let isSavingTemplate = $state(false);
   	let templateDraft = $state('');
   	// ... rest of state

   	// All template functions from original file
   	// highlightTemplate, syncTemplateScroll, escapeHtml, etc.
   </script>

   <section class="settings-tab-panel">
   	<!-- Template tab HTML from original file -->
   </section>
   ```

**Guardrails:**
- Each sub-component must include the mandatory Svelte header comment block.
- Each sub-component should be under 200 lines.
- Do not modify the original SettingsModal.svelte yet.

---

### Step 9: Refactor SettingsModal to Use Sub-components

**Problem:** The original SettingsModal.svelte needs to be refactored to use the new sub-components.

**Files:**
- `morning-clarity-journal/src/lib/components/SettingsModal.svelte` (refactor)

**What to change:**

1. Replace the content of SettingsModal.svelte to import and use the sub-components:
   ```svelte
   <!-- purpose: Settings modal with Apple-style grouped list layout -->
   <!-- context: Manage locations, database backups/export/wipe, and template presets -->
   <!-- location: src/lib/components/SettingsModal.svelte -->

   <script lang="ts">
   	import type { Location } from '$lib/db.js';
   	import Modal from '$lib/components/Modal.svelte';
   	import SegmentedControl from '$lib/components/SegmentedControl.svelte';
   	import SettingsLocations from '$lib/components/settings/SettingsLocations.svelte';
   	import SettingsDatabase from '$lib/components/settings/SettingsDatabase.svelte';
   	import SettingsTemplate from '$lib/components/settings/SettingsTemplate.svelte';

   	let {
   		open,
   		locations,
   		onclose,
   		onLocationsChanged,
   		onTemplateChanged
   	}: {
   		open: boolean;
   		locations: Location[];
   		onclose: () => void;
   		onLocationsChanged: () => Promise<void>;
   		onTemplateChanged: () => Promise<void>;
   	} = $props();

   	let activeTab = $state<'locations' | 'database' | 'template'>('locations');

   	const segments = [
   		{ value: 'locations', label: 'Locations' },
   		{ value: 'database', label: 'Database' },
   		{ value: 'template', label: 'Template' }
   	];

   	$effect(() => {
   		if (open) {
   			activeTab = 'locations';
   		}
   	});
   </script>

   {#if open}
   	<Modal open={open} title="Settings" onclose={onclose} className="settings-modal-extended">
   		<SegmentedControl
   			{segments}
   			selected={activeTab}
   			onselect={(v) => { activeTab = v as 'locations' | 'database' | 'template'; }}
   		/>

   		{#if activeTab === 'locations'}
   			<SettingsLocations {locations} {onLocationsChanged} />
   		{:else if activeTab === 'database'}
   			<SettingsDatabase {onLocationsChanged} {onTemplateChanged} />
   		{:else}
   			<SettingsTemplate {onTemplateChanged} />
   		{/if}
   	</Modal>
   {/if}
   ```

2. The refactored SettingsModal.svelte should be under 60 lines.

**Guardrails:**
- Run `npx svelte-check --threshold error` to verify no errors.
- Test that all three tabs still function correctly.
- The settings modal behavior should be identical to before.

---

### Step 10: Split template.ts into Parser and Data Modules

**Problem:** The `template.ts` file is 414 lines. It contains both the template parsing logic and the static data definitions (journalTemplate, legacyFieldIds).

**Files:**
- `morning-clarity-journal/src/lib/template/parser.ts` (new file)
- `morning-clarity-journal/src/lib/template/data.ts` (new file)
- `morning-clarity-journal/src/lib/template/types.ts` (new file)
- `morning-clarity-journal/src/lib/template/index.ts` (new file)
- `morning-clarity-journal/src/lib/template.ts` (replace with re-exports)

**What to change:**

1. Create directory `src/lib/template/` if it does not exist.

2. Create `src/lib/template/types.ts` with the interface definitions (lines 3-42 of original):
   ```typescript
   export interface JournalData {
   	whoAmIDoingThisFor: string;
   	// ... rest of interface
   }

   export interface TemplateBlock {
   	type: 'hp' | 'mp';
   	text: string;
   	placeholder?: string;
   }

   export interface TemplateField {
   	id: string;
   	label: string;
   	placeholder: string;
   	type: 'hp' | 'mp';
   }

   export interface TemplateQuestion {
   	id: string;
   	number: number;
   	question: string;
   	fields: TemplateField[];
   }

   export interface TemplateModel {
   	questions: TemplateQuestion[];
   	fieldIds: string[];
   }
   ```

3. Create `src/lib/template/parser.ts` with the parsing functions (lines 44-223 of original):
   ```typescript
   import type { TemplateModel } from './types.js';

   const MAX_TEMPLATE_BYTES = 20 * 1024;
   const MAX_TEMPLATE_LINES = 200;
   const textEncoder = new TextEncoder();

   function getTemplateSize(sourceText: string): number {
   	return textEncoder.encode(sourceText).length;
   }

   function parseLabelAttribute(
   	attributeText: string,
   	lineNumber: number,
   	errors: string[]
   ): string | null {
   	// ... implementation
   }

   export function parseTemplateSource(sourceText: string): { parsed: TemplateModel; errors: string[] } {
   	// ... implementation from original file
   }
   ```

4. Create `src/lib/template/data.ts` with the static data (lines 225-414 of original):
   ```typescript
   import type { TemplateQuestion, TemplateModel } from './types.js';

   export const journalTemplate: TemplateQuestion[] = [
   	// ... the 6 questions array from original
   ];

   export const legacyFieldIds = [
   	// ... the legacy field IDs array from original
   ];

   export function serializeDefaultTemplate(): string {
   	// ... implementation from original
   }

   export function createEmptyFormData(template: TemplateModel): Record<string, string> {
   	// ... implementation from original
   }

   export function getEmptyJournalData(): Record<string, string> {
   	// ... implementation from original
   }

   export function getCurrentFieldIds(): string[] {
   	return journalTemplate.flatMap(q => q.fields.map(f => f.id));
   }
   ```

5. Create `src/lib/template/index.ts` that re-exports everything:
   ```typescript
   export * from './types.js';
   export * from './parser.js';
   export * from './data.js';
   ```

6. Replace `src/lib/template.ts` with re-exports for backward compatibility:
   ```typescript
   // Re-export all template functionality from sub-modules
   export * from './template/index.js';
   ```

**Guardrails:**
- Run `npx svelte-check --threshold error` to verify no errors.
- All imports from `$lib/template.js` must continue to work without modification.
- Each new file should be under 200 lines.

---

### Step 11: Extract Journal Page Logic to Utilities

**Problem:** The `journal/+page.svelte` file is 368 lines. It contains data loading logic, draft management, and GPS capture logic that can be extracted.

**Files:**
- `morning-clarity-journal/src/lib/journal-page-helpers.ts` (new file)
- `morning-clarity-journal/src/routes/journal/+page.svelte` (update)

**What to change:**

1. Create `src/lib/journal-page-helpers.ts` with extracted logic:
   ```typescript
   import { apiFetch } from '$lib/api-client.js';
   import { fetchLocations, fetchEntries } from '$lib/journal-actions.js';
   import { createEmptyFormData } from '$lib/template.js';
   import type { TemplateModel } from '$lib/template.js';
   import type { Location, Entry } from '$lib/db.js';

   export const DRAFT_STORAGE_KEY = 'mcj-draft';
   export const DRAFT_DEBOUNCE_MS = 300;

   export interface JournalPageData {
   	locations: Location[];
   	entries: Entry[];
   	entryDates: string[];
   	template: TemplateModel | null;
   	formData: Record<string, string>;
   }

   export async function loadJournalPageData(): Promise<{ data: JournalPageData | null; error: string }> {
   	try {
   		const [locationsResult, entriesResult, templateResult] = await Promise.all([
   			fetchLocations().catch(() => null),
   			fetchEntries().catch(() => null),
   			loadTemplate()
   		]);

   		if (!locationsResult || !entriesResult || !templateResult.template) {
   			return { data: null, error: 'Failed to load journal data.' };
   		}

   		return {
   			data: {
   				locations: locationsResult,
   				entries: entriesResult.entries,
   				entryDates: entriesResult.entryDates,
   				template: templateResult.template,
   				formData: templateResult.formData
   			},
   			error: ''
   		};
   	} catch {
   		return { data: null, error: 'Failed to load journal data.' };
   	}
   }

   async function loadTemplate(): Promise<{ template: TemplateModel | null; formData: Record<string, string> }> {
   	try {
   		const response = await apiFetch('/api/template');
   		if (!response.ok) {
   			return { template: null, formData: {} };
   		}
   		const data = await response.json();
   		if (!data?.parsed?.fieldIds) {
   			return { template: null, formData: {} };
   		}
   		const template = data.parsed as TemplateModel;
   		return {
   			template,
   			formData: createEmptyFormData(template)
   		};
   	} catch {
   		return { template: null, formData: {} };
   	}
   }

   export function saveDraft(formData: Record<string, string>): void {
   	try {
   		sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
   	} catch (err) {
   		console.error('Failed to save draft', err);
   	}
   }

   export function restoreDraft(currentFormData: Record<string, string>): Record<string, string> {
   	try {
   		const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
   		if (!rawDraft) return currentFormData;
   		const parsedDraft = JSON.parse(rawDraft);
   		if (parsedDraft && typeof parsedDraft === 'object') {
   			return { ...currentFormData, ...parsedDraft };
   		}
   	} catch (err) {
   		console.error('Failed to restore draft', err);
   	}
   	return currentFormData;
   }

   export function clearDraft(): void {
   	try {
   		sessionStorage.removeItem(DRAFT_STORAGE_KEY);
   	} catch (err) {
   		console.error('Failed to clear draft', err);
   	}
   }
   ```

2. Update `src/routes/journal/+page.svelte` to use the extracted helpers. Replace the data loading logic with calls to the helper functions. The file should become shorter by using these utility functions.

**Guardrails:**
- Run `npx svelte-check --threshold error` to verify no errors.
- The journal page behavior should be identical to before.
- The +page.svelte file should now be under 280 lines (still over 200 but reduced).

---

### Step 12: Minor Refactoring for Remaining Files

**Problem:** JournalForm.svelte (258 lines), entry/[date]/+page.svelte (226 lines), and +page.svelte (214 lines) are slightly over the 200-line limit.

**Files:**
- `morning-clarity-journal/src/lib/components/JournalForm.svelte`
- `morning-clarity-journal/src/routes/entry/[date]/+page.svelte`
- `morning-clarity-journal/src/routes/+page.svelte`

**What to change:**

1. For `JournalForm.svelte` (258 lines), extract the `syncContent` directive and paste handler to a utility:
   - Create `src/lib/form-helpers.ts` with `handlePaste` and `syncContent` functions
   - This should reduce JournalForm.svelte by ~30 lines

2. For `entry/[date]/+page.svelte` (226 lines), extract `hasLegacyContent` and `getTimestampParts` helpers:
   - Move these to `src/lib/entry-helpers.ts`
   - This should reduce the file by ~20 lines

3. For `+page.svelte` (214 lines), the file is very close to the limit:
   - Move the `ExistingSessionInfo` interface to a shared types file
   - Extract `getOptionalLocation` to a utility
   - This should reduce the file below 200 lines

**Guardrails:**
- Run `npx svelte-check --threshold error` after each extraction.
- Each file should be under 200 lines after refactoring.
- All behavior must remain identical.

---

### Step 13: Final Verification and Cleanup

Run after each step: `npx svelte-check --threshold error`.

After all steps:
1. `npm run build`
2. `npm run dev`

Manual verification checklist:
- [ ] All imports from `$lib/db.js` work throughout the codebase
- [ ] All imports from `$lib/template.js` work throughout the codebase
- [ ] Settings modal opens and all three tabs function correctly
- [ ] Locations can be added and deleted
- [ ] Backups can be created and downloaded
- [ ] Template editor works and saves correctly
- [ ] Journal entry form loads and submits correctly
- [ ] Past entries can be viewed
- [ ] Login/unlock screen works
- [ ] No console errors during normal operation

File line counts after refactoring:
- [ ] `src/lib/db.ts` is under 20 lines (just re-exports)
- [ ] All files in `src/lib/db/` are under 200 lines
- [ ] `src/lib/components/SettingsModal.svelte` is under 60 lines
- [ ] All files in `src/lib/components/settings/` are under 200 lines
- [ ] `src/lib/template.ts` is under 10 lines (just re-exports)
- [ ] All files in `src/lib/template/` are under 200 lines
- [ ] `src/routes/journal/+page.svelte` is under 280 lines
- [ ] `src/lib/components/JournalForm.svelte` is under 200 lines
- [ ] `src/routes/entry/[date]/+page.svelte` is under 200 lines
- [ ] `src/routes/+page.svelte` is under 200 lines

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)

Step 1: Added new db module scaffolding (types, connection, schema + split migrations/backfills to keep files under 200 lines) and index re-exports without touching `src/lib/db.ts`. `npx svelte-check --threshold error`: 0 errors.
