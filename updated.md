## 256MB Optimization Plan - Memory, CPU, and I/O Hotspots

Goal: Make the app stable and fast on a 256mb Fly.io shared VM by reducing peak memory usage, avoiding large in-memory buffers, and lowering CPU spikes during cold start and heavy operations. This plan targets the highest-risk areas found in the audit: migrations/backfills, export, backup, and unbounded date lists.

## IMPORTANT: Rules for the implementing agent

1. **Follow `morning-clarity-journal/AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and functions correctly.
5. **Do NOT skip steps or combine steps.** Each step should keep the app fully functional.

Optimization guardrails (apply to all steps below):
- Preserve all existing functionality and response shapes unless a step explicitly changes an endpoint contract.
- Do not change public APIs without updating all callers in the same step.
- Avoid introducing new heavy dependencies.
- Prefer streaming and iteration over loading full tables or files into memory.
- Add comments for any non-obvious memory or performance decisions.

---

## Optimization Targets (Priority Order)

| Area | Files | Issue | Priority |
|------|-------|-------|----------|
| DB backfills on startup | `src/lib/db/schema-migrations.ts`, `src/lib/db/schema-backfills.ts` | Full-table `.all()` loads into memory on cold start | 🔴 Critical |
| Export endpoint | `src/routes/api/export/+server.ts`, `src/lib/db/entries.ts` | Builds full dataset + JSON string in memory | 🔴 Critical |
| Backup creation and download | `src/lib/db/backups.ts`, `src/routes/api/backup/+server.ts` | Reads entire DB and/or decrypted backup into memory | 🔴 Critical |
| Unbounded entry dates | `src/routes/api/entries/+server.ts`, `src/lib/db/entries.ts`, `src/lib/journal-actions.ts`, `src/lib/journal-page-helpers.ts` | Returns all dates forever | 🟡 High |
| Auth CPU spikes | `src/lib/auth.ts`, `src/routes/api/auth/+server.ts` | `pbkdf2Sync` blocks event loop | 🟡 High |

---

### Step 1: Convert Backfills to Streaming Iteration

**Problem:** `schema-backfills.ts` and the migration logic in `schema-migrations.ts` use `.all()` to load full tables into memory. This is risky on 256mb and slows cold start.

**Files to update:**
- `morning-clarity-journal/src/lib/db/schema-backfills.ts`
- `morning-clarity-journal/src/lib/db/schema-migrations.ts`

**What to change:**

1. In `schema-backfills.ts`, replace every `.all()` call that loads large tables with `prepare(...).iterate()` loops.
   - Target functions: `migrateEncryptedDataToNewKey`, `backfillTemplateParsedJson`, `backfillTemplatePresetParsedJson`, `backfillLocationsEncryptedData`, `backfillEntryCapturedCoordinates`, `backfillEntryLocationIdEncryption`.
2. Keep existing transactions, but iterate rows directly instead of storing arrays.
3. For `migrateEncryptedDataToNewKey`, convert each table loop to this pattern:
   - Prepare the SELECT.
   - Iterate rows with `for (const row of statement.iterate())`.
   - Re-encrypt and update each row with a prepared update statement.
4. Add a short comment in each updated function explaining the switch to iteration to avoid peak memory usage.
5. Ensure the logic still short-circuits when no rows are present by tracking whether any rows were processed (e.g., set a boolean on first iteration).

**Expected result:** No full-table arrays are created. Cold start memory spikes are reduced significantly.

**Guardrails:**
- Keep the transactional semantics and error behavior unchanged.
- Do not change table schemas or migration logic.

---

### Step 2: Stream Export Instead of Building Large JSON in Memory

**Problem:** `/api/export` builds a huge JSON object and string in memory, including decrypting every entry and creating arrays for quotes, locations, and presets.

**Files to update:**
- `morning-clarity-journal/src/routes/api/export/+server.ts`
- `morning-clarity-journal/src/lib/db/entries.ts`

**What to change:**

1. Add a new database iterator in `src/lib/db/entries.ts` for export:
   - `export function iterateEntriesWithRawData(): Iterable<...>`
   - Query should return entry fields plus `encrypted_data` and any encrypted location/quote fields needed for the export response.
   - Use `prepare(...).iterate()` and build location name lookup once using the existing helper.
2. Update `src/routes/api/export/+server.ts` to stream the response body:
   - Use `const encoder = new TextEncoder()` and `new ReadableStream({ start(controller) { ... } })`.
   - Emit JSON in chunks:
     - Start with `{` and static small fields (exportedAt, locations, quoteSource, quotes, dailyQuotes, activeTemplate, presets).
     - Stream `entries` as an array by writing `"[` then each entry JSON and commas, then `]`.
   - For each entry, decrypt `encrypted_data`, parse JSON, and emit one object at a time.
3. Preserve the existing response shape exactly, including property names and formats.
4. Ensure error handling is safe:
   - If decrypt or parse fails for an entry, emit `"data": null` for that entry (current behavior).
5. Keep headers from `noStoreHeaders()` and add `Content-Type: application/json`.

**Expected result:** Export uses bounded memory and scales with database size without spikes.

**Guardrails:**
- The response must remain valid JSON.
- Do not buffer the entire export string in memory.

---

### Step 3: Stream Backup Creation and Decryption

**Problem:** Backups currently read the entire DB into a Buffer and encrypt in memory. Downloads also decrypt the whole backup into memory before sending.

**Files to update:**
- `morning-clarity-journal/src/lib/db/backups.ts`
- `morning-clarity-journal/src/routes/api/backup/+server.ts`

**What to change:**

1. Update `createBackup()` to stream encryption:
   - Use `fs.createReadStream(DB_PATH)` and `crypto.createCipheriv`.
   - Write IV to the output file first.
   - Pipe the DB read stream through the cipher into a write stream.
   - After stream completion, append the auth tag to the output file.
   - Use `stream/promises` `pipeline()` to handle backpressure and errors.
2. Update `decryptBackup()` to stream decryption for downloads:
   - Read the IV and auth tag from the beginning of the file.
   - Create a read stream that starts after the header.
   - Create a decipher with the auth tag and stream-decrypt the rest.
3. Update the download response in `src/routes/api/backup/+server.ts`:
   - Return a streaming response body using `Readable.toWeb()` (Node 18+) or a `ReadableStream`.
   - Set `Content-Type` and `Content-Disposition` as before.
   - Avoid loading the whole decrypted file into memory.

**Expected result:** Backup and download are O(1) memory with respect to DB size.

**Guardrails:**
- Keep the encrypted file format consistent (IV + auth tag + ciphertext).
- Do not change the filename patterns or retention rules.

---

### Step 4: Limit Entry Dates to a Year Scope

**Problem:** `/api/entries` returns all entry dates, which grows forever and is loaded into memory on the journal page.

**Files to update:**
- `morning-clarity-journal/src/routes/api/entries/+server.ts`
- `morning-clarity-journal/src/lib/db/entries.ts`
- `morning-clarity-journal/src/lib/journal-actions.ts`
- `morning-clarity-journal/src/lib/journal-page-helpers.ts`

**What to change:**

1. Add a new DB helper in `entries.ts`:
   - `export function getEntryDatesForYear(year: number): string[]`
   - Use SQL `WHERE date >= 'YYYY-01-01' AND date <= 'YYYY-12-31'`.
2. Update the `GET` handler in `src/routes/api/entries/+server.ts`:
   - Accept optional `year` query param (number).
   - Default to current year if not provided or invalid.
   - Use `getEntryDatesForYear(year)` instead of `getEntryDates()`.
3. Update `fetchEntries()` in `src/lib/journal-actions.ts`:
   - Add a `year` argument and include it in the query string.
4. Update `loadJournalPageData()` in `src/lib/journal-page-helpers.ts`:
   - Pass the current year into `fetchEntries`.
5. Ensure the UI still displays year-based stats correctly.

**Expected result:** Only current year dates are fetched, reducing memory and response size.

**Guardrails:**
- Keep existing response shape for `recentEntries`.
- Ensure the journal page still uses `yearDates` from the current year for stats.

---

### Step 5: Make Passphrase Verification Non-Blocking

**Problem:** `pbkdf2Sync` blocks the event loop; on shared CPU this can delay requests.

**Files to update:**
- `morning-clarity-journal/src/lib/auth.ts`
- `morning-clarity-journal/src/routes/api/auth/+server.ts`
- Any other call sites of `verifyPassphrase`

**What to change:**

1. Replace `pbkdf2Sync` with async `pbkdf2`:
   - Create a `pbkdf2Async` helper using `util.promisify`.
   - Update `verifyPassphrase` to `async` and return `Promise<boolean>`.
2. Update all call sites to `await verifyPassphrase(...)`.
3. Ensure error handling remains identical.

**Expected result:** Authentication does not block the event loop during key derivation.

**Guardrails:**
- Keep the same PBKDF2 settings (iterations, key length, hash).
- Do not change auth rate limiting behavior.

---

### Step 6: Verification and Final QA

**Commands:**
- After each step: `npx svelte-check --threshold error`
- After all steps: `npm run build` then `npm run dev`

**Verification checks:**

1. **Migrations and backfills:**
   - Start the app on a test DB and confirm no errors on startup.
2. **Export still valid:**
   - Trigger export and confirm the JSON is valid and complete.
3. **Backup and download:**
   - Create a backup and download it; confirm file is valid and readable.
4. **Journal behavior:**
   - Confirm journal page loads and stats reflect current year entries.
5. **Auth:**
   - Verify login still works and errors are unchanged.

**Documentation:**
- Record memory-related changes and any behavior changes.
- Note any deviations if a step needed to be adjusted.

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)
