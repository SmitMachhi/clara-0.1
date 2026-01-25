## Security Hardening Plan – Phase 2 (Audit Findings Remediation)

Goal: Address critical and high-severity security issues identified in the comprehensive security audit. Fix path traversal, unauthenticated logout, missing CSRF protection, XSS risks, input validation gaps, and authentication bypass vectors.

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.

Security guardrails (apply to all steps below):
- Do not change UI/UX layout or styling unless explicitly specified.
- Keep all existing routes and HTTP methods.
- Do not log user data or decrypted content.
- Preserve current auth behavior and cookie name (`session`).
- Use tabs for indentation, single quotes for strings (per AGENTS.md).

---

### Step 1: Fix Path Traversal Vulnerability in Backup Download

**Problem:** The backup download endpoint at `/api/backup` takes a `filename` query parameter directly from user input. While it checks against the backup list, there's no validation that the filename matches expected patterns.

**Files:**
- `morning-clarity-journal/src/routes/api/backup/+server.ts`

**What to change:**

1. Add a filename validation function at the top of the file (after imports):
   ```typescript
   function isValidBackupFilename(filename: string): boolean {
   	// Only allow filenames matching: journal-backup-YYYY-MM-DDTHH-MM-SS.db
   	const pattern = /^journal-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/;
   	return pattern.test(filename);
   }
   ```

2. In the GET handler, before checking if the backup exists in the list, validate the filename format. Find this code block:
   ```typescript
   if (action === 'download' && url.searchParams.get('filename')) {
   	const filename = url.searchParams.get('filename');
   ```

   Change it to:
   ```typescript
   if (action === 'download' && url.searchParams.get('filename')) {
   	const filename = url.searchParams.get('filename');

   	if (!filename || !isValidBackupFilename(filename)) {
   		return errorResponse('Invalid backup filename', 400, noStoreHeaders());
   	}
   ```

3. Also add a check that the resolved path is within the backup directory. After getting the backup from the list, add:
   ```typescript
   if (!backup) {
   	return notFoundResponse('Backup not found');
   }

   // Verify the backup path is within the expected directory
   const backupDir = path.join(process.env.NODE_ENV === 'production' ? '/data' : './data', 'backups');
   const resolvedPath = path.resolve(backup.path);
   const resolvedBackupDir = path.resolve(backupDir);

   if (!resolvedPath.startsWith(resolvedBackupDir + path.sep)) {
   	return errorResponse('Invalid backup path', 400, noStoreHeaders());
   }
   ```

4. Add the `path` import at the top of the file if not already present:
   ```typescript
   import path from 'path';
   ```

**Guardrails:**
- Do not change the backup file format or naming convention.
- Do not change how backups are created or listed.
- Keep all existing response formats.

---

### Step 2: Add Authentication Check to Logout Endpoint

**Problem:** The logout endpoint at `/api/auth/logout` clears the server session without verifying the request comes from an authenticated user. This allows CSRF attacks to log users out.

**Files:**
- `morning-clarity-journal/src/routes/api/auth/logout/+server.ts`

**What to change:**

1. Replace the entire file content with:
   ```typescript
   import { json } from '@sveltejs/kit';
   import { verifySessionToken } from '$lib/auth.js';
   import { clearActiveSession, getActiveSession } from '$lib/db.js';
   import type { RequestHandler } from './$types';

   export const POST: RequestHandler = async ({ cookies }) => {
   	const sessionCookie = cookies.get('session');
   	const payload = verifySessionToken(sessionCookie);

   	if (!payload) {
   		return json({ success: false, error: 'Not authenticated' }, { status: 401 });
   	}

   	const activeSession = getActiveSession();
   	if (!activeSession || activeSession.nonce !== payload.nonce) {
   		return json({ success: false, error: 'Invalid session' }, { status: 401 });
   	}

   	clearActiveSession();
   	cookies.delete('session', { path: '/' });
   	return json({ success: true });
   };
   ```

**Guardrails:**
- Return 401 status for unauthenticated requests (not 403).
- Still clear the cookie even after clearing the session.
- Keep the same success response format.

---

### Step 3: Add Date Parameter Validation to Entry Lookup

**Problem:** The `/api/entries/[date]` endpoint uses the date parameter directly without validating its format. Malformed dates could cause unexpected behavior.

**Files:**
- `morning-clarity-journal/src/routes/api/entries/[date]/+server.ts`

**What to change:**

1. Add a date validation function at the top of the file (after imports):
   ```typescript
   function isValidDateFormat(dateStr: string): boolean {
   	// Must match YYYY-MM-DD format
   	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
   		return false;
   	}

   	// Must be a valid date
   	const [year, month, day] = dateStr.split('-').map(Number);
   	const date = new Date(year, month - 1, day);
   	return date.getFullYear() === year &&
   		date.getMonth() === month - 1 &&
   		date.getDate() === day;
   }
   ```

2. At the very beginning of the GET handler, add validation. Find:
   ```typescript
   export const GET: RequestHandler = async ({ params }) => {
   	const entry = getEntryByDate(params.date);
   ```

   Change it to:
   ```typescript
   export const GET: RequestHandler = async ({ params }) => {
   	if (!isValidDateFormat(params.date)) {
   		return new Response('Invalid date format', { status: 400, headers: noStoreHeaders() });
   	}

   	const entry = getEntryByDate(params.date);
   ```

**Guardrails:**
- Only accept YYYY-MM-DD format.
- Return 400 Bad Request for invalid dates.
- Do not change the entry lookup logic.

---

### Step 4: Add Input Length Limits to All API Endpoints

**Problem:** Most API endpoints don't enforce input size limits, allowing potential DoS attacks via large payloads.

**Files:**
- `morning-clarity-journal/src/routes/api/entries/+server.ts`
- `morning-clarity-journal/src/routes/api/locations/+server.ts`
- `morning-clarity-journal/src/routes/api/template/+server.ts`

**What to change:**

1. In `src/routes/api/entries/+server.ts`, find the POST handler's parseJsonBody call:
   ```typescript
   const body = await parseJsonBody<EntryPayload>(request);
   ```

   Change it to (100KB limit for journal entries):
   ```typescript
   const body = await parseJsonBody<EntryPayload>(request, 102400);
   ```

2. In `src/routes/api/locations/+server.ts`, find the POST handler's parseJsonBody call:
   ```typescript
   const body = await parseJsonBody<{ name: string; lat: number; lng: number; address?: string | null }>(request);
   ```

   Change it to (4KB limit for location data):
   ```typescript
   const body = await parseJsonBody<{ name: string; lat: number; lng: number; address?: string | null }>(request, 4096);
   ```

3. In `src/routes/api/template/+server.ts`, find the POST handler's parseJsonBody call:
   ```typescript
   const body = await parseJsonBody<TemplatePayload>(request);
   ```

   Change it to (32KB limit for templates):
   ```typescript
   const body = await parseJsonBody<TemplatePayload>(request, 32768);
   ```

**Guardrails:**
- Use reasonable limits that won't break normal usage.
- Keep the same error response format from parseJsonBody.
- Do not change the validation logic after parsing.

---

### Step 5: Add Content Security Policy in Development Mode

**Problem:** CSP and other security headers are only set in production mode, leaving development vulnerable.

**Files:**
- `morning-clarity-journal/src/hooks.server.ts`

**What to change:**

1. Find the section that sets security headers only in production:
   ```typescript
   if (process.env.NODE_ENV === 'production') {
   	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
   	response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
   }
   ```

2. Change it to set CSP in all environments, but HSTS only in production:
   ```typescript
   // CSP in all environments
   response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");

   // HSTS only in production (requires HTTPS)
   if (process.env.NODE_ENV === 'production') {
   	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
   }
   ```

**Guardrails:**
- Keep HSTS only in production (it requires HTTPS).
- Use the same CSP policy for both environments.
- Do not change the other security headers.

---

### Step 6: Sanitize HTML Output in Template Editor Highlight

**Problem:** The template editor uses `{@html highlightedTemplate}` which could be vulnerable to XSS if the escaping has edge cases.

**Files:**
- `morning-clarity-journal/src/lib/components/SettingsModal.svelte`

**What to change:**

1. Find the `escapeHtml` function:
   ```typescript
   function escapeHtml(value: string): string {
   	return value
   		.replace(/&/g, '&amp;')
   		.replace(/</g, '&lt;')
   		.replace(/>/g, '&gt;')
   		.replace(/"/g, '&quot;');
   }
   ```

2. Add single quote escaping for completeness:
   ```typescript
   function escapeHtml(value: string): string {
   	return value
   		.replace(/&/g, '&amp;')
   		.replace(/</g, '&lt;')
   		.replace(/>/g, '&gt;')
   		.replace(/"/g, '&quot;')
   		.replace(/'/g, '&#39;');
   }
   ```

3. Find the `highlightTemplate` function and add input validation at the start:
   ```typescript
   function highlightTemplate(source: string): string {
   	if (typeof source !== 'string') {
   		return '';
   	}

   	// Limit input length to prevent DoS
   	const truncated = source.length > 50000 ? source.slice(0, 50000) : source;

   	const escaped = escapeHtml(truncated);
   ```

4. Update the regex replacements to be more strict. Find:
   ```typescript
   const withHp = escaped.replace(/&lt;\/?hp\b[^&]*?&gt;/gi, (match) => {
   ```

   Change to (more restrictive pattern):
   ```typescript
   const withHp = escaped.replace(/&lt;\/?hp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi, (match) => {
   ```

5. Similarly for mp tags, find:
   ```typescript
   const withMp = withHp.replace(/&lt;\/?mp\b[^&]*?&gt;/gi, (match) => {
   ```

   Change to:
   ```typescript
   const withMp = withHp.replace(/&lt;\/?mp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi, (match) => {
   ```

**Guardrails:**
- Keep the same visual output for valid templates.
- Do not change the textarea or editor behavior.
- The highlighting is purely cosmetic, so being strict is safe.

---

### Step 7: Add Validation to Location Name Length

**Problem:** Location names have no length limit, allowing potential DoS or storage abuse.

**Files:**
- `morning-clarity-journal/src/lib/validation.ts`
- `morning-clarity-journal/src/routes/api/locations/+server.ts`

**What to change:**

1. In `src/lib/validation.ts`, find the `validateLocationName` function:
   ```typescript
   export function validateLocationName(name: unknown): { valid: boolean; error?: string } {
   	if (!name || typeof name !== 'string' || name.trim().length === 0) {
   		return { valid: false, error: 'Invalid location name' };
   	}
   	return { valid: true };
   }
   ```

2. Add length validation:
   ```typescript
   export function validateLocationName(name: unknown): { valid: boolean; error?: string } {
   	if (!name || typeof name !== 'string' || name.trim().length === 0) {
   		return { valid: false, error: 'Invalid location name' };
   	}
   	if (name.trim().length > 100) {
   		return { valid: false, error: 'Location name too long (max 100 characters)' };
   	}
   	return { valid: true };
   }
   ```

3. In `src/routes/api/locations/+server.ts`, add address validation in the POST handler. After the `coordValidation` check, add:
   ```typescript
   // Validate address length if provided
   if (address && typeof address === 'string' && address.length > 500) {
   	return errorResponse('Address too long (max 500 characters)');
   }
   ```

**Guardrails:**
- Use reasonable limits (100 chars for name, 500 for address).
- Return descriptive error messages.
- Do not change existing valid location handling.

---

### Step 8: Uniform Error Messages for Authentication Failures

**Problem:** Different error messages for missing passphrase vs. invalid passphrase could allow attackers to enumerate valid states.

**Files:**
- `morning-clarity-journal/src/routes/api/auth/+server.ts`

**What to change:**

1. Find the passphrase validation section:
   ```typescript
   if (!passphrase || typeof passphrase !== 'string') {
   	recordAuthFailure(ip);
   	return json({ success: false, error: 'Passphrase is required' }, { status: 400 });
   }

   const isValid = verifyPassphrase(passphrase);
   if (!isValid) {
   	recordAuthFailure(ip);
   	return json({ success: false, error: 'Invalid passphrase' }, { status: 401 });
   }
   ```

2. Change both error responses to use the same message and status:
   ```typescript
   if (!passphrase || typeof passphrase !== 'string') {
   	recordAuthFailure(ip);
   	return json({ success: false, error: 'Authentication failed' }, { status: 401 });
   }

   const isValid = verifyPassphrase(passphrase);
   if (!isValid) {
   	recordAuthFailure(ip);
   	return json({ success: false, error: 'Authentication failed' }, { status: 401 });
   }
   ```

**Guardrails:**
- Use 401 Unauthorized for all auth failures.
- Keep the same error structure `{ success: false, error: string }`.
- Do not change rate limiting or logging behavior.

---

### Step 9: Add Request Origin Validation for API Endpoints

**Problem:** While SameSite cookies provide some CSRF protection, additional origin validation adds defense in depth.

**Files:**
- `morning-clarity-journal/src/hooks.server.ts`

**What to change:**

1. Add an origin validation check for state-changing requests. Find the API authentication section and add origin checking before it. After the HTTPS redirect block, add:
   ```typescript
   // Origin validation for state-changing requests (CSRF protection)
   if (event.url.pathname.startsWith('/api/') && event.request.method !== 'GET') {
   	const origin = event.request.headers.get('origin');
   	const host = event.request.headers.get('host');

   	// In production, require origin header and validate it matches host
   	if (process.env.NODE_ENV === 'production') {
   		if (!origin) {
   			return json({ success: false, error: 'Missing origin header' }, { status: 403 });
   		}

   		try {
   			const originUrl = new URL(origin);
   			const expectedHost = host?.split(':')[0];
   			if (originUrl.host.split(':')[0] !== expectedHost) {
   				return json({ success: false, error: 'Invalid origin' }, { status: 403 });
   			}
   		} catch {
   			return json({ success: false, error: 'Invalid origin header' }, { status: 403 });
   		}
   	}
   }
   ```

**Guardrails:**
- Only enforce strict origin checking in production.
- Allow GET requests without origin (they should be safe).
- Do not block requests in development mode.

---

### Step 10: Final Verification and Testing

Run after each step: `npx svelte-check --threshold error`.

After all steps:
1. `npm run build`
2. `npm run dev`

Manual checks:
- Login still works with correct passphrase.
- Login fails with same error message for missing or wrong passphrase.
- Logout requires authentication (returns 401 if not logged in).
- Backup download rejects filenames with path traversal attempts (e.g., `../../../etc/passwd`).
- Entry lookup rejects invalid date formats (e.g., `2024-13-45`, `not-a-date`).
- Location creation rejects names longer than 100 characters.
- Template editor still highlights syntax correctly.
- All API endpoints return proper error for oversized payloads.
- CSP header is present in development mode responses.

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)

Step 1: Added backup filename validation, enforced backup path containment, and guarded invalid download requests in `morning-clarity-journal/src/routes/api/backup/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 2: Replaced the logout handler to verify the session token and active session before clearing state in `morning-clarity-journal/src/routes/api/auth/logout/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 3: Added YYYY-MM-DD format validation for entry lookup dates in `morning-clarity-journal/src/routes/api/entries/[date]/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 4: Added request body size limits to entries, locations, and template POST handlers in `morning-clarity-journal/src/routes/api/entries/+server.ts`, `morning-clarity-journal/src/routes/api/locations/+server.ts`, and `morning-clarity-journal/src/routes/api/template/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 5: Set CSP on all responses and kept HSTS restricted to production in `morning-clarity-journal/src/hooks.server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 6: Hardened template highlighting by escaping single quotes, validating input type, truncating oversized input, and tightening tag matching in `morning-clarity-journal/src/lib/components/SettingsModal.svelte`. `npx svelte-check --threshold error` reported 0 errors.

Step 7: Added location name length validation and enforced a max address length during location creation in `morning-clarity-journal/src/lib/validation.ts` and `morning-clarity-journal/src/routes/api/locations/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 8: Standardized auth failures to a uniform 401 response in `morning-clarity-journal/src/routes/api/auth/+server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 9: Added origin checks for non-GET API requests in production to `morning-clarity-journal/src/hooks.server.ts`. `npx svelte-check --threshold error` reported 0 errors.

Step 10: Ran `npm run build` successfully and started `npm run dev` (terminated after 5s timeout once the server reported ready) in `morning-clarity-journal/`. `npx svelte-check --threshold error` reported 0 errors.
