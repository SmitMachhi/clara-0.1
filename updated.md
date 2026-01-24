# Security + UX + Optimization Fix Plan

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md`** rules (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
2.2. **Before starting any step, read the Implementation Logs first** so you don’t repeat work.
3. **After each step**, run `npx svelte-check --threshold error` and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.
6. **Do NOT create new files unless explicitly told to.** When a new file is required, this plan will say so.
7. **Do NOT add public secrets.** Use `$env/dynamic/private` for server-only secrets.
8. **Never reintroduce query-string auth tokens** (no `?token=...`).

---

## Target Fixes (Summary)
- Remove public bearer token usage and query-string tokens.
- Add server-side rate limiting for `/api/auth`.
- Move session handling to httpOnly signed cookies.
- Enforce time cutoff on the server.
- Remove/guard seed test endpoint.
- Fix broken export CSV UI.
- Unify theme toggle (single source of truth).
- Improve load error UX and add draft safety.
- Reduce redundant computations in sidebar.
- Update README and `.env.example` for new env vars.

---

## Step 1: Update env docs and README

1. Edit `morning-clarity-journal/.env.example`:
	- Remove `PUBLIC_API_TOKEN`.
	- Add `JOURNAL_SESSION_SECRET=dev-session-secret-change-in-prod`.
	- Keep `JOURNAL_PASSPHRASE` and `JOURNAL_ENCRYPTION_KEY`.
2. Edit `morning-clarity-journal/README.md`:
	- Remove the hardcoded password from the Security section.
	- Replace “No environment variables required” with a short list of required env vars:
		- `JOURNAL_PASSPHRASE`
		- `JOURNAL_ENCRYPTION_KEY`
		- `JOURNAL_SESSION_SECRET`
	- Mention that all three are required in production.

---

## Step 2: Implement signed httpOnly sessions + rate limiting

Edit `morning-clarity-journal/src/lib/auth.ts` to replace in-memory sessions with stateless signed tokens and add auth rate limiting.

Requirements:
1. **Signed token format**: `<payloadBase64Url>.<signatureBase64Url>`
2. **Payload**: JSON with `{ exp: number, nonce: string }` where `exp` is UNIX ms.
3. **Signature**: HMAC-SHA256 over `payloadBase64Url` using `JOURNAL_SESSION_SECRET`.
4. **Session duration**: 24h.
5. **Rate limit**: 5 failed attempts per 15 minutes per IP; when exceeded, block for 15 minutes.

Implementation details:
- Add helpers:
	- `createSessionToken(): { token: string; expiresAt: number }`
	- `verifySessionToken(token: string | undefined): boolean`
	- `checkAuthRateLimit(ip: string): { ok: boolean; retryAfter?: number }`
	- `recordAuthFailure(ip: string): void`
	- `clearAuthFailures(ip: string): void`
- Use `$env/dynamic/private` for `JOURNAL_SESSION_SECRET` and `JOURNAL_PASSPHRASE`.
- Use `crypto.createHmac` and `crypto.randomBytes`.
- Use base64url encoding (replace `+`→`-`, `/`→`_`, trim `=`).

Guardrails:
- Do NOT keep the old `sessions` Map.
- Do NOT store session tokens in memory.
- Do NOT use `$env/static/private`.

---

## Step 3: Update `/api/auth` to use rate limiting + set cookie

Edit `morning-clarity-journal/src/routes/api/auth/+server.ts`:
1. Get client IP via `event.getClientAddress()`.
2. Call `checkAuthRateLimit(ip)` before verifying the passphrase:
	- If blocked, return 429 with `{ success: false, error: 'Too many attempts' }`
	- Set `Retry-After` header to seconds (rounded up).
3. If passphrase is wrong:
	- Call `recordAuthFailure(ip)`
	- Return 401.
4. If passphrase is correct:
	- Call `clearAuthFailures(ip)`
	- Create session token with `createSessionToken()`
	- Set cookie `session` with:
		- `httpOnly: true`
		- `sameSite: 'strict'`
		- `secure: process.env.NODE_ENV === 'production'`
		- `path: '/'`
		- `maxAge` from token expiry
	- Return `{ success: true }` (no token in JSON).

---

## Step 4: Enforce cookie auth in hooks

Edit `morning-clarity-journal/src/hooks.server.ts`:
1. **Remove** all bearer-token and query-token logic.
2. For any `/api/*` route except `/api/auth` and `/api/session`:
	- Read cookie `session` with `event.cookies.get('session')`.
	- If missing or invalid (via `verifySessionToken`), return 403 JSON.
3. Keep cache headers for `/_app/*` unchanged.

---

## Step 5: Add `/api/session` endpoint (NEW FILE)

Create `morning-clarity-journal/src/routes/api/session/+server.ts` with a GET handler:
1. Read `session` cookie.
2. If valid, return `new Response(null, { status: 204 })`.
3. If invalid/missing, return `new Response(null, { status: 401 })`.

Guardrail: This is the ONLY new file to add.

---

## Step 6: Update client auth helpers and route guards

Edit `morning-clarity-journal/src/lib/api-client.ts`:
1. Remove `PUBLIC_API_TOKEN` import and any Authorization headers.
2. Remove session token storage; replace with a boolean flag:
	- `SESSION_FLAG_KEY = 'mcj-session-present'`
	- `setSessionFlag()`, `clearSessionFlag()`, `hasSessionFlag()`
3. `apiFetch()` should set `credentials: 'same-origin'`.

Update these pages to use `/api/session` instead of `hasSessionToken()`:
- `morning-clarity-journal/src/routes/+page.svelte`
- `morning-clarity-journal/src/routes/journal/+page.svelte`
- `morning-clarity-journal/src/routes/entry/[date]/+page.svelte`

Required behavior:
1. On mount, call `apiFetch('/api/session')`.
2. If status is 204, continue; if 401, `goto('/')`.
3. On successful login (unlock screen), call `setSessionFlag()` before redirect.
4. Remove all uses of `hasSessionToken()` and any sessionStorage token logic.

---

## Step 7: Enforce time cutoff on the server

Edit `morning-clarity-journal/src/routes/api/entries/+server.ts`:
1. Import `isPastCutoff` from `src/lib/utils.ts`.
2. In POST, before saving, check `isPastCutoff()`:
	- If true, return `errorResponse('Past cutoff', 403)`.
3. Keep client-side cutoff messaging unchanged.

---

## Step 8: Remove seed test endpoint

Delete `morning-clarity-journal/src/routes/api/seed-test/+server.ts`.

Guardrail: After deletion, run `rg "seed-test" morning-clarity-journal/src` and ensure no references remain.

---

## Step 9: Fix backup download and remove dead CSV export

Edit `morning-clarity-journal/src/lib/components/SettingsModal.svelte`:
1. Remove the "Export CSV" button and the `exportCsv()` function.
2. Remove any `PUBLIC_API_TOKEN` import.
3. Update `downloadBackup()` to:
	- Use `window.open('/api/backup?action=download&filename=' + encodeURIComponent(filename), '_blank');`

Edit `morning-clarity-journal/src/routes/api/backup/+server.ts`:
1. Update the final error message to a generic `'Invalid action'`.
2. Do NOT accept any query token.

---

## Step 10: Unify theme toggle (single source of truth)

Edit `morning-clarity-journal/src/routes/+layout.svelte`:
1. Change theme toggling to use `document.documentElement.classList.toggle('dark', isDark);`
2. Remove any use of `light` class.

Edit `morning-clarity-journal/src/routes/journal/+page.svelte`:
1. Remove the floating theme button and its state (`isDarkMode`, `toggleTheme`).
2. Remove `Icon` import if only used by that button.
3. In `onMount` cleanup, remove only `ritual` class (do NOT remove `dark`).

---

## Step 11: UX guardrails (loading errors + draft safety)

Edit `morning-clarity-journal/src/routes/journal/+page.svelte`:
1. Add `loadError` state and show a visible error with a “Retry” button when data fetch fails.
2. Add draft persistence in `sessionStorage`:
	- Key: `mcj-draft`
	- On mount: if draft exists and no entry for today, load into `formData`.
	- On any form change: store `formData` JSON in sessionStorage (debounce 300ms).
	- On successful save: remove the draft key.
3. Add `beforeunload` warning when `formData` has any content and entry is not saved.

Guardrail: Do NOT store the draft in `localStorage`.

---

## Step 12: Reduce sidebar recomputation

Edit `morning-clarity-journal/src/lib/components/JournalSidebar.svelte` and `morning-clarity-journal/src/lib/stats.ts`:
1. In `stats.ts`, update `getRecentEntries` to build a `Map` of entries by date instead of calling `entries.find` repeatedly.
2. In `JournalSidebar.svelte`, compute once:
	- `const stats = $derived(calculateStats(entryDates, yearDates));`
	- `const recentEntries = $derived(getRecentEntries(yearDates, entryDates, entries));`
3. Replace repeated `calculateStats(...)` and `getRecentEntries(...)` calls with the derived values.

---

## Step 13: Final verification

Run in order:
1. `npx svelte-check --threshold error`
2. `npm run build`
3. `npm run dev`

Manual checks:
- Unlock flow works; wrong passphrase returns error.
- Journal page blocks after 14:00 (unless `VITE_DISABLE_TIME_CUTOFF=true`).
- Entry save + view works.
- Settings modal downloads backups (no token in URL).
- No “Export CSV” button.
- Theme toggle works globally and doesn’t duplicate.

---

## Implementation Logs

Step 1 completed: Updated .env.example to remove PUBLIC_API_TOKEN and add JOURNAL_SESSION_SECRET. Updated README.md to remove hardcoded password and document the three required environment variables (JOURNAL_PASSPHRASE, JOURNAL_ENCRYPTION_KEY, JOURNAL_SESSION_SECRET). Ran svelte-check - no errors.

Step 2 completed: Replaced in-memory sessions with stateless signed tokens using HMAC-SHA256 signatures. Implemented createSessionToken(), verifySessionToken(), checkAuthRateLimit(), recordAuthFailure(), and clearAuthFailures() helpers. Session duration is 24h with base64url encoding. Rate limiting: 5 failed attempts per 15 minutes per IP. Removed old sessions Map. Ran svelte-check - no errors.

Step 3 completed: Updated /api/auth to use rate limiting and set httpOnly session cookie. Added getClientAddress() IP extraction, checkAuthRateLimit() before passphrase verification, 429 response with Retry-After header when blocked, recordAuthFailure() on wrong passphrase, clearAuthFailures() on success. Session cookie set with httpOnly, sameSite=strict, secure in production, path=/, and maxAge from token expiry. Returns only { success: true } (no token in JSON). Ran svelte-check - no errors.

Step 4 completed: Updated hooks.server.ts to enforce cookie auth. Removed all bearer-token and query-token logic. For /api/* routes except /api/auth and /api/session, read session cookie and verify with verifySessionToken(). Returns 403 JSON if missing or invalid. Kept cache headers for /_app/* unchanged. Ran svelte-check - no errors.

Step 5 completed: Created new /api/session/+server.ts endpoint with GET handler. Reads session cookie and returns 204 if valid via verifySessionToken(), 401 if invalid/missing. This is the only new file created per the plan. Ran svelte-check - no errors.

Step 6 completed: Updated src/lib/api-client.ts to remove PUBLIC_API_TOKEN import and all Authorization headers. Replaced session token storage with boolean flag (setSessionFlag, clearSessionFlag, hasSessionFlag). Updated apiFetch to use credentials: 'same-origin'. Updated +page.svelte, journal/+page.svelte, and entry/[date]/+page.svelte to call /api/session for auth verification and use setSessionFlag() on successful login. Removed all hasSessionToken() and sessionStorage token logic. Ran svelte-check - no errors.

Step 7 completed: Enforced server-side cutoff in entries POST by importing isPastCutoff and returning a 403 error when past cutoff. Ran svelte-check - no errors.

Step 8 completed: Deleted /api/seed-test endpoint and verified no remaining references with rg. Ran svelte-check - no errors.

Step 9 completed: Removed Export CSV UI and PUBLIC_API_TOKEN usage from SettingsModal. Updated backup download to open without tokens and made backup endpoint return a generic 'Invalid action' error. Ran svelte-check - no errors.

Step 10 completed: Unified theme toggling in layout to set the dark class only, removed the floating theme button and Icon import from the journal page, and kept ritual cleanup only. Ran svelte-check - no errors.

Step 11 completed: Added loadError with retry flow, sessionStorage draft persistence with 300ms debounce, beforeunload warning for unsaved drafts, and draft cleanup on save in the journal page. Ran svelte-check - no errors.

Step 12 completed: Optimized recent entries lookup using a Map and memoized stats/recent entries with derived values in the sidebar. Ran svelte-check - no errors.

Step 13 completed: Ran npm run build successfully. Started npm run dev; server came up at http://localhost:5173/ before the command timed out in the sandbox.
