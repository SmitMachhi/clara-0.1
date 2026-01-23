# Deployment and Security Plan (Morning Clarity Journal)

This plan is designed for another agent to implement. It includes concrete file paths, exact areas to change, and verification steps. It focuses on cost reduction plus a secure, single-user encryption model without speculative changes.

## How to Use This Doc (LLM-Friendly)
- Read top-to-bottom; each step lists exact files and verification checks.
- Do not invent new files or services beyond those listed.
- Keep changes minimal and localized to the specified files.

---

## Deployment Notes for the Implementer
- This app is optimized for single-user, single-machine use because the DB is local to the machine (`/data` volume). If client-side encryption is implemented, the current server session model should be removed or replaced (see Step 5).
- Do not add a second region or scale to multiple machines without implementing session persistence and a replicated DB solution (which would likely increase cost).
- If the app grows, evaluate managed Postgres or LiteFS separately; both add cost/complexity and are out of scope for this cost-reduction plan.

## Suggested Order of Work
1) Enable precompression in `svelte.config.js`.
2) Add cache headers in `src/hooks.server.ts`.
3) Implement backup retention in `src/lib/db.ts`.
4) Implement client-side encryption and passphrase UI (Step 5).
5) Implement data migration for existing entries (Step 6).
6) Confirm Fly scale is still 1x shared CPU / 256 MB.

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

### 5) Client-Side Encryption with Passphrase (Best Security for Single User)
**Why:** The server never sees or stores the encryption key; the DB stays unreadable if the server or volume is compromised.

**Behavioral changes**
- User enters a passphrase in the browser (one per session).
- The client derives the encryption key; the server only stores encrypted blobs.
- No password verification on the server (remove current auth flow or replace with minimal local UI gating).

**Actions**
- Implement client-side encryption and move encryption/decryption out of the server.
- Remove hardcoded server passwords.
- Add a client-side key-derivation salt flow (salt is not secret).
- Update API payloads to carry encrypted data as base64 (JSON-safe).

**Where**
- `src/lib/crypto.ts`:
  - Keep AES-256-GCM, but add a client-usable KDF (Web Crypto API or `crypto.subtle`) for key derivation.
  - Use a strong KDF (PBKDF2 with high iterations) and a 16–32 byte random salt.
- `src/lib/db.ts`:
  - Remove server-side encryption (`encryptJSON`, `decryptJSON`) and store already-encrypted payloads.
  - Update schema usage to store encrypted payloads as opaque blobs (still `BLOB` is fine).
- `src/routes/api/entries/+server.ts`:
  - Accept encrypted payloads from the client directly.
  - Remove server-side validation that requires plaintext fields (or move validation to client).
- `src/routes/api/entries/[date]/+server.ts`:
  - Return encrypted payloads to the client; do not decrypt on the server.
- `src/routes/+page.svelte` and `src/routes/journal/+page.svelte`:
  - Add passphrase entry UI (simple modal or inline prompt).
  - Derive key in the client and encrypt/decrypt payloads before calling APIs.
- `src/lib/auth.ts` and `src/routes/api/auth/+server.ts`:
  - Remove or bypass server auth; for a single user, rely on the passphrase gate on the client.
- Add salt storage:
  - Option A (recommended for multiple devices): store the salt in the DB `config` table with a tiny API endpoint to read/write it.
  - Option B (single device only): store salt in `localStorage` and do not persist it server-side.

**Notes**
- This is "zero-knowledge": server cannot decrypt entries.
- There is no recovery if the passphrase is lost. Consider a local hint if desired.
- Keep HTTPS on Fly (already `force_https = true` in `fly.toml`).
- If server auth is removed, the API becomes writeable by anyone who can reach it. Consider a simple shared token header (set via Fly secret) if you want integrity protection.

**Verification**
- DB rows are unreadable without the client passphrase.
- API responses contain only encrypted blobs.
- App still works after redeploy; old entries require migration (see next section).

---

### 6) Data Migration for Client-Side Encryption
**Why:** Existing entries are currently encrypted server-side with a hardcoded password.

**Actions**
- Add a one-time migration path:
  - Server returns encrypted data as-is.
  - Client asks for old passphrase (the existing hardcoded value) once, decrypts entries, then re-encrypts with new client passphrase and sends updates.

**Where**
- Implement a temporary client-only migration flow in `src/routes/journal/+page.svelte`:
  - Detect legacy entries (e.g., via a `encryption_version` flag).
  - Prompt for legacy passphrase (the current hardcoded one) and new passphrase.
  - Re-save entries via a migration API endpoint.
- Add a minimal migration API endpoint:
  - `src/routes/api/entries/migrate/+server.ts` to accept re-encrypted payloads and update DB rows.

**Verification**
- After migration, only new encryption format remains in DB.
- Legacy passphrase is no longer used or stored in the server code.

---

### 7) Reduce Cold Start Overhead (Optional, Low Risk)
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
- Add client passphrase UI and client-side crypto helpers.
- Add migration API endpoint and wire it to DB updates.
- Implement legacy decryption path (uses old hardcoded passphrase) and re-encrypt with new passphrase.
- Migrate all existing entries; verify random spot checks.
- Remove legacy server-side encryption and hardcoded secrets.
