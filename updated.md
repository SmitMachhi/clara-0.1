## Security Hardening Plan (New)

Goal: Ensure all user-provided content (including coordinates) is encrypted at rest, remove sensitive artifacts from the repo, and harden authentication handling without changing UI/UX or feature behavior.

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you don’t repeat work.
3. **After each step**, run `npx svelte-check --threshold error` and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.

Security guardrails (apply to all steps below):
- Do not print secrets, tokens, or database contents in logs or console output.
- Do not add any new authentication mechanisms or change existing cookie semantics unless explicitly instructed.
- Do not change UI/UX layout or styling.
- Avoid large refactors; keep diffs minimal and local to the listed files.

### Step 1: Remove sensitive artifacts and prevent re-adding them

1. Delete `morning-clarity-journal/cookies.txt`.
2. Delete `morning-clarity-journal/data/journal.db`, `morning-clarity-journal/data/journal.db-wal`, and `morning-clarity-journal/data/journal.db-shm`.
3. Update or create `morning-clarity-journal/.gitignore` to include:
	- `cookies.txt`
	- `data/`
	- `data/*.db`
	- `data/*.db-*`
4. Confirm the files are no longer tracked by Git (only remove them from the repo; do not delete local data outside the repo root).

Guardrails:
- Do not delete any other files.
- Do not add new tooling or scripts.

### Step 2: Verify encryption at rest coverage (user-provided content only)

Review and update `morning-clarity-journal/src/lib/db.ts` and any other persistence logic:
1. Inventory all SQLite tables/columns used in `src/lib/db.ts`:
	- `entries`: `encrypted_data`, `date`, `timestamp`, `location_id`, `captured_lat`, `captured_lng`, `template_id`
	- `templates`: `source_text_encrypted`, `parsed_json`
	- `template_presets`: `source_text_encrypted`, `parsed_json`
	- `locations`: `name`, `lat`, `lng`, `address`
	- `config`: `value` (e.g., `active_template_id`)
2. Mark which columns must be encrypted at rest (balanced scope):
	- MUST already be encrypted: `entries.encrypted_data`, `templates.source_text_encrypted`, `template_presets.source_text_encrypted`
	- MUST be encrypted if currently plaintext: `templates.parsed_json`, `template_presets.parsed_json`, `locations.name`, `locations.address`, `locations.lat`, `locations.lng`, `entries.captured_lat`, `entries.captured_lng`
	- Metadata that can remain plaintext for queryability: `entries.date`, `entries.timestamp`, `entries.location_id`, `config.value`
3. For each plaintext user-content column above, implement encryption on write using `src/lib/server/crypto.ts`:
	- Add new `*_encrypted` columns (e.g., `parsed_json_encrypted`, `name_encrypted`, `address_encrypted`).
	- Backfill existing rows by reading plaintext values, encrypting, and writing to the new columns.
	- Update all read paths to decrypt from the encrypted columns only.
	- Stop writing to plaintext columns after backfill.
4. Keep decrypt paths server-side only; do not expose encryption helpers to the client.
5. Add or update a short code comment near storage logic clarifying which columns are encrypted at rest.

Guardrails:
- Do not change DB schema unless required to encrypt data.
- Do not log plaintext content during migration or debugging.

### Step 3: Enforce strong session secret length

Edit `morning-clarity-journal/src/lib/auth.ts`:
1. In both `createSessionToken` and `verifySessionToken`, after reading `env.JOURNAL_SESSION_SECRET`, enforce a minimum length of 32 characters.
2. If the secret is missing or too short, throw an error with the exact message: `JOURNAL_SESSION_SECRET must be at least 32 characters`.

Guardrails:
- Do not change the token format or expiry.
- Do not change error handling in callers.

### Step 4: Constant-time passphrase verification

Edit `morning-clarity-journal/src/lib/auth.ts`:
1. Replace the direct string comparison in `verifyPassphrase` with a constant-time comparison.
2. Use `createHash('sha256')` to hash both the input and expected passphrase into buffers, then compare with `timingSafeEqual`.
3. Keep the same error behavior if `JOURNAL_PASSPHRASE` is missing.

Guardrails:
- Do not change the public function signature.
- Do not log the passphrase or hashes.

### Step 5: Rotate secrets guidance and documentation

Edit `morning-clarity-journal/README.md` and `morning-clarity-journal/.env.example`:
1. Update the `JOURNAL_SESSION_SECRET` guidance to explicitly require 32+ characters.
2. Add a short note instructing users to rotate the session secret if a cookie file or DB file was ever committed.
3. Keep documentation changes minimal and consistent with existing style.

Guardrails:
- Do not add new sections unrelated to secrets or rotation.

### Step 6: Final verification (security hardening)

Run after each step: `npx svelte-check --threshold error`.

After all steps:
1. `npm run build`
2. `npm run dev`

Manual checks:
- App boot succeeds and login flow works as before.
- No references to `cookies.txt` or `data/journal.db*` remain in the repo.
- Auth continues to accept the correct passphrase.
- All persisted user content is encrypted at rest (verify stored DB values are ciphertext, not plaintext).

---

## Implementation Logs

Step 1 complete: removed cookies/db artifacts, updated `morning-clarity-journal/.gitignore` to ignore sensitive files, and ran `npx svelte-check --threshold error` (0 errors, 2 warnings).
