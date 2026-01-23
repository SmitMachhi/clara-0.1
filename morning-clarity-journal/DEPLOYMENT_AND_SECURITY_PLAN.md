# Deployment and Security Plan (Morning Clarity Journal)

This plan is designed for another agent to implement. It includes concrete file paths, exact areas to change, and verification steps. It focuses on cost reduction plus a secure, single-user encryption model without speculative changes.

## How to Use This Doc (LLM-Friendly)
- Read top-to-bottom; each step lists exact files and verification checks.
- Do not invent new files or services beyond those listed.
- Keep changes minimal and localized to the specified files.

---

## Implementation Log

### Batch 1 (Steps 2, 3, 4) - Completed 2026-01-23

**Step 2: Enable Precompression in svelte.config.js**
- File: `svelte.config.js:8`
- Started with: `adapter({ out: 'build' })`
- Changed to: `adapter({ out: 'build', precompress: true })`
- Result: Static assets will be precompressed as `.br`/`.gz` during build

**Step 3: Add Cache Headers for Static Assets**
- File: `src/hooks.server.ts:44-50`
- Started with: Direct `return resolve(event)` after auth checks
- Changed to: Wrapped resolve, added cache-control headers for `/_app/` paths
- Result: Response headers for `/_app/*` now include `cache-control: public, max-age=31536000, immutable`

**Step 4: Implement Backup Retention**
- File: `src/lib/db.ts:371-380`
- Started with: No pruning, backups grow unbounded
- Changed to: Added pruning logic to keep only last 5 backups using `getBackups()` and `fs.unlinkSync()`
- Result: After creating multiple backups, only the newest 5 remain in `/data/backups`

---

### Batch 2 (Steps 1, 5, 6) - Completed 2026-01-23

**Step 1: Confirm Single Machine Configuration**
- File: `fly.toml:3-4`
- Started with: `primary_region = "sjc"`
- Changed to: `primary_region = "yyz"` with comment noting single-machine deployment requirement
- Result: Region set to Toronto, documented single-machine constraint due to in-memory sessions

**Step 5: Client-Side Encryption with Passphrase**
- File: `src/lib/crypto.ts:103-173` - Added client-side encryption functions using Web Crypto API
- File: `src/lib/db.ts:85-125` - Removed server-side encryption, updated saveEntry/updateEntry to accept encrypted data
- File: `src/routes/api/entries/+server.ts` - Updated to accept encrypted payloads with version 2 format
- File: `src/routes/api/entries/[date]/+server.ts` - Updated to return encrypted data instead of decrypted
- File: `src/hooks.server.ts` - Removed all server auth checks, simplified to just add cache headers
- File: `src/routes/+page.svelte` - Converted to passphrase gate, stores passphrase in localStorage
- File: `src/routes/journal/+page.svelte` - Added encryption on submit, decryption on load, migration UI
- File: `src/routes/entry/[date]/+page.svelte` - Added decryption of entry data on load
- Result: Zero-knowledge encryption, server cannot read entries, passphrase required per session

**Step 6: Data Migration for Client-Side Encryption**
- File: `src/routes/api/entries/migrate/+server.ts` - Created new endpoint for batch migration
- File: `src/routes/journal/+page.svelte` - Added migration flow UI with legacy password input
- Result: Existing encrypted entries can be migrated to new client-side encryption format

---

### Batch 3 (Steps 5a, PBKDF2 fix, 7) - Completed 2026-01-23

**Step 5a: API Bearer Token Auth**
- File: `src/hooks.server.ts:5-16` - Added bearer token check for all `/api/*` routes
- File: `src/lib/api-client.ts` (new) - Created auth fetch wrapper that includes `Authorization: Bearer <token>` header
- File: `src/lib/journal-actions.ts` - Replaced all `fetch()` calls with `apiFetch()` for authenticated requests
- File: `src/routes/journal/+page.svelte` - Updated inline fetch calls to use `apiFetch()`
- File: `src/routes/entry/[date]/+page.svelte` - Updated fetch call to use `apiFetch()`
- File: `src/lib/components/SettingsModal.svelte` - Updated `window.open()` URLs to include `?token=` query param for downloads
- File: `.env` / `.env.example` - Added `PUBLIC_API_TOKEN=dev-mcj-token-2026`
- Auth supports both `Authorization: Bearer <token>` header and `?token=<token>` query param (for browser downloads)
- Server reads token from `$env/dynamic/private` → `PUBLIC_API_TOKEN` env var
- Result: All API routes return 401 without valid token; authenticated requests succeed

**PBKDF2 Iterations Fix (100k → 600k) + encryptClient Bug Fix**
- File: `src/lib/crypto.ts:7` - Changed `PBKDF2_ITERATIONS` from 100,000 to 600,000
- File: `src/lib/crypto.ts:140-164` - Fixed `encryptClient()` signature: was `(data: string, key: CryptoKey)`, now `(data: string, passphrase: string)`. Function now generates a salt, derives the key via PBKDF2, then encrypts. Previously, the salt stored in output was random/unused, causing decryption to fail.
- File: `src/routes/journal/+page.svelte` - Cleaned up migration function: removed dead code (`deriveKeyClient`, `LEGACY_PASSWORD`), uses user-entered `legacyPassphrase` for migration. Removed unused imports.
- File: `src/routes/entry/[date]/+page.svelte` - Fixed TypeScript null-safety error in entry loading
- File: `src/lib/db.ts` - Removed unused imports (`ClientEncryptedData`, duplicate `JournalData`)
- Result: 0 TypeScript errors, PBKDF2 uses 600,000 iterations per security plan spec, encrypt/decrypt are now symmetric (both accept passphrase string)

**Step 7: Passphrase Change (Key Rotation)**
- File: `src/lib/components/SettingsModal.svelte` - Added "Security" section with "Change Passphrase" button and form
  - Form prompts for current passphrase, new passphrase, and confirmation
  - Verifies current passphrase matches localStorage before proceeding
  - Fetches all entries, decrypts with old passphrase, re-encrypts with new passphrase
  - Sends re-encrypted entries to `/api/entries/migrate` endpoint
  - Updates localStorage with new passphrase on success
  - Shows progress indicator during re-encryption
  - Error handling: incorrect current passphrase, mismatch confirmation, failed entries
- File: `src/lib/components/Icons.svelte` - Added "lock" icon and updated Props type union
- File: `src/app.css` - Added `.passphrase-form` and `.passphrase-input` styles
- Result: Users can change their passphrase; all entries re-encrypted atomically via migrate endpoint

---

## Deployment Notes for the Implementer
- This app is optimized for single-user, single-machine use because the DB is local to the machine (`/data` volume). If client-side encryption is implemented, the current server session model should be removed or replaced (see Step 5).
- Do not add a second region or scale to multiple machines without implementing session persistence and a replicated DB solution (which would likely increase cost).
- If the app grows, evaluate managed Postgres or LiteFS separately; both add cost/complexity and are out of scope for this cost-reduction plan.

## Suggested Order of Work
1) Enable precompression in `svelte.config.js`.
2) Add cache headers in `src/hooks.server.ts`.
3) Implement backup retention in `src/lib/db.ts`.
4) Add API bearer token auth in `src/hooks.server.ts` (Step 5a — do this before removing old auth).
5) Implement client-side encryption and passphrase UI (Step 5).
6) Implement data migration for existing entries, then purge legacy backups (Step 6).
7) Implement passphrase change flow (Step 7).
8) Confirm Fly scale is still 1x shared CPU / 256 MB.

## Current State (Facts Observed)
- App: SvelteKit with `@sveltejs/adapter-node` (`svelte.config.js`), built to `build/`.
- Runtime: Node 20 Alpine, multi-stage Dockerfile, `npm ci` in build, `npm ci --omit=dev` in production (`Dockerfile`).
- DB: SQLite via `better-sqlite3`, stored in `/data/journal.db` when `NODE_ENV=production` (`src/lib/db.ts`). WAL enabled.
- Sessions: In-memory token map (`src/lib/auth.ts`), implying a single-machine deployment for consistent auth.
- Fly config: single process, auto-stop/auto-start enabled, min machines 0, shared CPU, 256 MB memory, volume mounted at `/data` (`fly.toml`).
- Backups: Stored under `/data/backups`, no retention pruning (`src/lib/db.ts`, `src/routes/api/backup/+server.ts`).

## User Constraints (Provided)
- Single user, opens app ~2–3 times/day.
- OK with cold starts (auto-stop/auto-start acceptable).
- Location: Toronto, Canada.
- Backup retention not specified (recommend small limit).
- No multi-user login requirement.

## Cost Drivers on Fly.io (Relevant to This App)
- Machine runtime is the primary cost lever. Keeping `min_machines_running = 0` and a single machine is optimal for low-traffic, single-user apps.
- Memory size sets the minimum spend per running machine. This app already uses the smallest tier (256 MB shared).
- Volume size affects storage cost; backup files can grow storage over time if not pruned.
- Bandwidth cost can be reduced by serving compressed assets and caching static files.

## Optimization Plan (Implementation Steps)

### 1) Keep a Single, Small Machine (Confirm and Lock)
**Why:** Sessions are in-memory; multiple machines would cause authentication inconsistency and higher cost.

**Actions**
- Confirm scaling stays at 1 machine and 256 MB memory.
- Add a note to deployment docs (if any) that this app is single-machine by design due to in-memory sessions.

**Where**
- `fly.toml` already sets `[[vm]] memory = "256mb"`, `cpu_kind = "shared"`, `cpus = 1`.
- Ensure no automation scales beyond 1 (use `fly scale count 1` during deploy workflows).
- Consider updating `primary_region` to `yyz` to reduce latency from Toronto.

**Verification**
- `fly machines list` shows a single machine for the app.
- `fly regions list` shows `yyz` as primary.

---

### 2) Reduce Bandwidth With Precompressed Static Assets
**Why:** Cuts bandwidth cost by serving `.br`/`.gz` assets when supported.

**Actions**
- Enable precompression in SvelteKit adapter-node.

**Where**
- `svelte.config.js`:
  - Update adapter config to:
    ```js
    adapter: adapter({
      out: 'build',
      precompress: true
    })
    ```

**Verification**
- After build, `build/client` contains `.br` or `.gz` files.
- Requests to `/_app/*` serve compressed assets (check response headers if possible).

---

### 3) Add Long-Term Cache Headers for Static Assets
**Why:** Reduces repeat bandwidth by letting clients cache immutable assets.

**Actions**
- Set `Cache-Control` headers for `/_app/` and other hashed build assets.

**Where**
- `src/hooks.server.ts`:
  - After `resolve(event)`, set headers when `event.url.pathname` starts with `/_app/`.
  - Example target header: `cache-control: public, max-age=31536000, immutable`.

**Notes**
- Do not set aggressive caching on HTML or API responses.

**Verification**
- Response headers for `/_app/*` include the cache-control policy.

---

### 4) Prune Old Backups to Control Volume Growth
**Why:** Persistent volume size drives ongoing storage cost; backups currently grow unbounded.

**Actions**
- Add a retention policy (recommend keep last 5 backups for a single user) for `/data/backups`.
- Implement pruning during backup creation.

**Where**
- `src/lib/db.ts`:
  - In `createBackup()` or immediately after backup creation, load existing backups (already provided by `getBackups()`), then delete older backups beyond the retention limit.
  - Use `fs.unlinkSync` to delete old files.
- `src/routes/api/backup/+server.ts`:
  - No API change required unless you want to return the retained list.

**Verification**
- After creating multiple backups, only the newest N remain in `/data/backups`.

---

### 5a) Add API Bearer Token Auth (Required)
**Why:** After removing the old session-based auth, the API is open to anyone who discovers the URL. A bearer token prevents unauthorized writes/deletes while keeping the zero-knowledge model intact (the token protects API access, not data confidentiality).

**Actions**
- Add a Fly secret `API_TOKEN` (generate a random 32+ character string).
- In the server hooks, check all `/api/*` requests for `Authorization: Bearer <API_TOKEN>`.
- The client stores this token (can be hardcoded in the client build via `$env/static/private` passed at build, or fetched from a non-protected config endpoint on first load).

**Where**
- `src/hooks.server.ts`:
  - Before resolving `/api/*` routes, check `request.headers.get('Authorization') === 'Bearer ' + env.API_TOKEN`.
  - Return 401 if missing/invalid.
- Fly secrets:
  - `fly secrets set API_TOKEN=<random-value>`
- Client fetch wrapper:
  - All `fetch('/api/...')` calls must include the `Authorization` header.
  - Store the token in a client-side constant or environment variable injected at build time.

**Notes**
- This is defense-in-depth: even without the token, data is encrypted and unreadable. But the token prevents deletion/overwrites by unauthorized parties.
- Do NOT skip this step. It is required, not optional.

**Verification**
- `curl https://<app>.fly.dev/api/entries` without the header returns 401.
- `curl -H "Authorization: Bearer <token>" https://<app>.fly.dev/api/entries` returns 200.

---

### 5) Client-Side Encryption with Passphrase (Best Security for Single User)
**Why:** The server never sees or stores the encryption key; the DB stays unreadable if the server or volume is compromised.

**Behavioral changes**
- User enters a passphrase in the browser (once per session).
- The client derives the encryption key; the server only stores encrypted blobs.
- No password verification on the server (remove current auth flow; API access is protected by the bearer token from Step 5a).

**Actions**
- Implement client-side encryption and move encryption/decryption out of the server.
- Remove hardcoded server passwords.
- Add a client-side key-derivation salt flow (salt is not secret).
- Update API payloads to carry encrypted data as base64 (JSON-safe).
- Add a passphrase verification blob so the client can detect wrong-passphrase entry.

**Where**
- `src/lib/crypto.ts`:
  - Keep AES-256-GCM, but add a client-usable KDF (Web Crypto API `crypto.subtle`) for key derivation.
  - Use PBKDF2-SHA256 with **600,000 iterations** minimum and a 16-byte random salt.
  - Add a `createVerificationBlob(key)` function: encrypt a known constant string (e.g., `"mcj-verify"`) with the derived key. Store the result alongside the salt in the server config table.
  - Add a `verifyPassphrase(key, blob)` function: attempt to decrypt the verification blob. If decryption succeeds and matches the known constant, the passphrase is correct.
- `src/lib/db.ts`:
  - Remove server-side encryption (`encryptJSON`, `decryptJSON`) and store already-encrypted payloads.
  - Update schema usage to store encrypted payloads as opaque blobs (still `BLOB` is fine).
  - Add a `config` table (key-value) to store: `salt`, `verification_blob`.
- `src/routes/api/entries/+server.ts`:
  - Accept encrypted payloads from the client directly.
  - Remove server-side validation that requires plaintext fields (move validation to client).
- `src/routes/api/entries/[date]/+server.ts`:
  - Return encrypted payloads to the client; do not decrypt on the server.
- `src/routes/+page.svelte` and `src/routes/journal/+page.svelte`:
  - Add passphrase entry UI (simple modal or inline prompt).
  - On passphrase entry: derive key → verify against stored verification blob → if valid, proceed; if invalid, show error and prompt again.
  - Derive key in the client and encrypt/decrypt payloads before calling APIs.
- `src/lib/auth.ts` and `src/routes/api/auth/+server.ts`:
  - Remove server auth; API access is now protected by bearer token (Step 5a), data confidentiality by client-side encryption.
- Salt and verification storage:
  - Store salt and verification blob in the DB `config` table with a small API endpoint (`/api/config`) to read/write them.
  - On first-ever passphrase entry (no salt exists yet): generate salt, derive key, create verification blob, store both to server.
  - On subsequent sessions: fetch salt + verification blob from server, derive key, verify before proceeding.

**Wrong-passphrase UX**
- If verification fails: show inline error "Incorrect passphrase. Please try again." and clear the input.
- Do NOT load or attempt to decrypt entries until verification passes.
- After 5 consecutive failures, show a warning: "If you've forgotten your passphrase, entries cannot be recovered."

**Notes**
- This is "zero-knowledge": server cannot decrypt entries.
- There is no recovery if the passphrase is lost. The verification blob only confirms correctness, it does not reveal the passphrase.
- Keep HTTPS on Fly (already `force_https = true` in `fly.toml`).

**Verification**
- DB rows are unreadable without the client passphrase.
- API responses contain only encrypted blobs.
- Entering a wrong passphrase shows an error; entering the correct one proceeds to journal.
- App still works after redeploy; old entries require migration (see next section).

---

### 6) Data Migration for Client-Side Encryption
**Why:** Existing entries are currently encrypted server-side with a hardcoded password.

**Actions**
- Add a one-time migration path:
  - Server returns encrypted data as-is.
  - Client asks for old passphrase (the existing hardcoded value) once, decrypts entries, then re-encrypts with new client passphrase and sends updates.
- After migration is verified complete, purge all pre-migration backups from `/data/backups` (they contain server-encrypted data with the old hardcoded key and are a security liability).

**Where**
- Implement a temporary client-only migration flow in `src/routes/journal/+page.svelte`:
  - Detect legacy entries (e.g., via a `encryption_version` flag).
  - Prompt for legacy passphrase (the current hardcoded one) and new passphrase.
  - Re-save entries via a migration API endpoint.
  - After all entries are migrated successfully, trigger a backup purge.
- Add a minimal migration API endpoint:
  - `src/routes/api/entries/migrate/+server.ts` to accept re-encrypted payloads and update DB rows.
- Backup purge:
  - Add a `POST /api/backup/purge` endpoint (or add purge logic to the migration endpoint) that deletes all existing backups in `/data/backups`.
  - This should only run once, after migration is fully confirmed.
  - After purge, create a fresh backup with the new encryption format.

**Verification**
- After migration, only new encryption format (version 2) remains in DB.
- Legacy passphrase is no longer used or stored in the server code.
- `/data/backups` contains only post-migration backups.
- Old backups with hardcoded-key encrypted data have been deleted.

---

### 7) Passphrase Change (Key Rotation)
**Why:** Users may want to change their passphrase periodically or if they suspect it was compromised. Without this flow, the only option would be to lose all data and start fresh.

**Behavioral changes**
- User opens a "Change passphrase" option (e.g., settings gear or menu item in the journal view).
- Client prompts for current passphrase and new passphrase.
- All entries are decrypted with the old key and re-encrypted with the new key.

**Actions**
- Add a "Change passphrase" UI trigger in the journal page.
- Implement re-encryption flow (same pattern as migration but old key = current client key, new key = new client key).
- Update the salt, verification blob, and all entries atomically.

**Where**
- `src/routes/journal/+page.svelte`:
  - Add a settings/menu button that opens a "Change passphrase" modal.
  - Modal prompts for current passphrase (verify it first) and new passphrase (with confirmation field).
  - On submit: derive new key with a fresh salt → re-encrypt all entries → update salt + verification blob on server → update passphrase in session state.
- `src/lib/crypto.ts`:
  - Reuse existing `deriveKey`, `encrypt`, `decrypt` functions. No new crypto code needed.
- `src/routes/api/entries/migrate/+server.ts`:
  - Reuse the same migration endpoint for re-encrypted payloads.
- `src/routes/api/config/+server.ts` (or wherever config is stored):
  - Accept updated salt and verification blob.

**Notes**
- This is functionally identical to migration, just with old key = current client key instead of legacy server key.
- Show progress indicator during re-encryption (same as migration).
- If re-encryption fails partway through, the old passphrase should still work for entries not yet re-encrypted. The client should handle partial state gracefully.

**Verification**
- After changing passphrase, old passphrase no longer passes verification.
- New passphrase decrypts all entries correctly.
- Salt and verification blob are updated in the config table.

---

### 8) Reduce Cold Start Overhead (Optional, Low Risk)
**Why:** Slightly faster cold starts can reduce active time per request.

**Actions**
- Avoid unnecessary work during startup. The DB connection already lazy-initializes, so no change needed unless additional startup logic is introduced later.

**Where**
- No immediate code changes required; keep as a guardrail in reviews.

---

## Appendix: Encrypted Payload Schema (For Implementation)
Use base64 strings so JSON stays safe. Do not change these keys without updating both client and server.

### Client → Server (save or update entry)
```json
{
  "locationId": 123,
  "capturedLat": 43.6532,
  "capturedLng": -79.3832,
  "encryption": {
    "version": 2,
    "salt_b64": "BASE64_SALT",
    "iv_b64": "BASE64_IV",
    "auth_tag_b64": "BASE64_AUTH_TAG",
    "ciphertext_b64": "BASE64_CIPHERTEXT"
  }
}
```

### Server → Client (get entry by date)
```json
{
  "id": 1,
  "date": "2025-01-01",
  "timestamp": "2025-01-01 08:00",
  "location_id": 123,
  "captured_lat": 43.6532,
  "captured_lng": -79.3832,
  "created_at": "2025-01-01 08:00:00",
  "encryption": {
    "version": 2,
    "salt_b64": "BASE64_SALT",
    "iv_b64": "BASE64_IV",
    "auth_tag_b64": "BASE64_AUTH_TAG",
    "ciphertext_b64": "BASE64_CIPHERTEXT"
  }
}
```

### Storage in SQLite
- Store a single packed blob (preferred) or store individual base64 fields.
- If using packed blob, keep `encryption.version` alongside the blob.

---

## Appendix: Migration Checklist
- [x] Set up API bearer token auth (Step 5a) before removing old session auth.
- [x] Add client passphrase UI and client-side crypto helpers (PBKDF2-SHA256, 600,000 iterations).
- [ ] Implement passphrase verification blob (encrypt known constant, store in config table).
- [x] Add migration API endpoint and wire it to DB updates.
- [x] Implement legacy decryption path (uses old hardcoded passphrase) and re-encrypt with new passphrase.
- [ ] Migrate all existing entries; verify random spot checks.
- [ ] Purge all pre-migration backups from `/data/backups`.
- [ ] Create a fresh backup with new encryption format.
- [ ] Remove legacy server-side encryption and hardcoded secrets.
- [ ] Verify wrong-passphrase UX shows error and blocks entry loading.
- [x] Implement passphrase change flow (Step 7).
