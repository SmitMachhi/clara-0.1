## Performance Optimization Plan – Time Complexity and Efficiency Improvements

Goal: Optimize the `morning-clarity-journal` codebase for maximum performance by fixing O(n²) algorithms, adding strategic caching, reducing redundant computations, and improving database query efficiency. This plan addresses critical hot-path inefficiencies found during a comprehensive time complexity audit.

## IMPORTANT: Rules for the implementing agent

1. **Follow `morning-clarity-journal/AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and functions correctly.
5. **Do NOT skip steps or combine steps.** Each step should keep the app fully functional.
6. **Test the specific functionality** mentioned in each step after implementation to ensure it still works correctly.

Performance optimization guardrails (apply to all steps below):
- Preserve all existing functionality exactly. The app must work identically before and after.
- Caches must have proper invalidation strategies. Stale data is worse than slow data.
- Do not introduce memory leaks. Caches should have TTL or size limits.
- Measure before and after when possible. Document improvements in the Implementation Log.
- Prefer simple optimizations over complex ones. Readable code > micro-optimizations.
- When adding caching, ensure thread safety for concurrent requests.

---

## Optimization Targets (Priority Order)

| Area | Files | Current Complexity | Target | Priority |
|------|-------|-------------------|--------|----------|
| Location caching | `src/lib/db/locations.ts` | O(n*m) per call | O(1) with cache | 🔴 Critical |
| Parsed quotes caching | `src/lib/db/quotes.ts` | O(n) regex per call | O(1) with cache | 🔴 Critical |
| Year dates memoization | `src/lib/utils.ts` | O(365) per page load | O(1) with memo | 🔴 Critical |
| Rate limit single query | `src/lib/rate-limit.ts` | 3 queries per request | 1 query | 🟠 High |
| Audit log batch cleanup | `src/lib/audit.ts` | O(n) on every write | O(1) amortized | 🟠 High |
| Location name check | `src/lib/db/locations.ts` | O(n²) | O(n) with cache | 🟠 High |
| Regex module constants | `src/lib/template/parser.ts` | Recompile per call | Compile once | 🟡 Medium |
| Time update optimization | `src/routes/journal/+page.svelte` | Every 30s expensive | Minute boundary | 🟡 Medium |
| Completed fields tracking | `src/routes/journal/+page.svelte` | O(n) per keystroke | O(1) incremental | 🟡 Medium |
| Date formatting cache | `src/lib/utils.ts` | Expensive per call | Cached | 🟢 Low |

---

### Step 1: Add Location Cache with TTL

**Problem:** `getLocations()` is called on EVERY page load, EVERY location operation, and EVERY GPS capture. Each call fetches ALL locations from the database and decrypts 4 fields per location. This is O(n*m) where n=locations and m=decrypt operations. With 50 locations, that's 200 decrypt operations per page load.

**Files to update:**
- `morning-clarity-journal/src/lib/db/locations.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/db/locations.ts` and add a cache module at the top of the file, after the imports:

```typescript
/**
 * Location cache with TTL for performance optimization.
 * Locations rarely change, so caching for 5 minutes is safe.
 */
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface LocationCache {
	data: Location[] | null;
	timestamp: number;
}

const locationCache: LocationCache = {
	data: null,
	timestamp: 0
};

/**
 * Invalidate the location cache. Call this after any location mutation
 * (create, update, delete).
 */
export function invalidateLocationCache(): void {
	locationCache.data = null;
	locationCache.timestamp = 0;
}

/**
 * Check if the cache is valid (not null and not expired).
 */
function isCacheValid(): boolean {
	return (
		locationCache.data !== null &&
		Date.now() - locationCache.timestamp < LOCATION_CACHE_TTL_MS
	);
}
```

2. Modify the existing `getLocations()` function to use the cache. Find the function (around lines 17-38) and wrap it:

```typescript
export function getLocations(): Location[] {
	// Return cached data if valid
	if (isCacheValid()) {
		return locationCache.data!;
	}

	// Fetch and decrypt from database
	const db = getDb();
	const rows = db.prepare('SELECT * FROM locations ORDER BY id').all() as LocationRow[];

	const locations = rows.map((row) => ({
		id: row.id,
		name: decryptOptionalString(row.name_encrypted) ?? '',
		lat: decryptOptionalNumber(row.lat_encrypted) ?? 0,
		lng: decryptOptionalNumber(row.lng_encrypted) ?? 0
	}));

	// Sort by name (case-insensitive)
	locations.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

	// Update cache
	locationCache.data = locations;
	locationCache.timestamp = Date.now();

	return locations;
}
```

3. Find ALL functions that mutate locations and add cache invalidation. Search for:
   - `createLocation` or any INSERT into locations table
   - `updateLocation` or any UPDATE on locations table
   - `deleteLocation` or any DELETE from locations table

4. Add `invalidateLocationCache()` call at the END of each mutation function, AFTER the database operation succeeds. Example:

```typescript
export function createLocation(name: string, lat: number, lng: number): Location {
	// ... existing creation logic ...

	invalidateLocationCache(); // Add this line at the end
	return newLocation;
}
```

5. Ensure `invalidateLocationCache` is exported so it can be called from API routes if needed.

**Expected result:** `getLocations()` returns cached data for 5 minutes. First call after cache expiry or invalidation fetches fresh data. Subsequent calls within TTL are O(1).

**Guardrails:**
- The cache is module-level, so it persists across requests in the same server process.
- Cache invalidation is critical - every mutation MUST invalidate.
- If you find any location mutation that doesn't go through the functions in this file, add invalidation there too.

---

### Step 2: Add Parsed Quotes Cache

**Problem:** `getParsedQuotes()` is called every time a daily quote is needed (every entry submission). It fetches the quote source from the database and parses it with regex O(n). The quote source rarely changes but is re-parsed on every call.

**Files to update:**
- `morning-clarity-journal/src/lib/db/quotes.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/db/quotes.ts` and add a cache near the top of the file, after imports:

```typescript
/**
 * Parsed quotes cache. Quote source rarely changes, so we cache
 * the parsed result and invalidate on source updates.
 */
interface ParsedQuotesCache {
	quotes: Quote[] | null;
	sourceHash: string | null;
}

const parsedQuotesCache: ParsedQuotesCache = {
	quotes: null,
	sourceHash: null
};

/**
 * Invalidate the parsed quotes cache. Call this after quote source is updated.
 */
export function invalidateParsedQuotesCache(): void {
	parsedQuotesCache.quotes = null;
	parsedQuotesCache.sourceHash = null;
}
```

2. Find the `getParsedQuotes()` function (around lines 106-112). It likely looks like:

```typescript
export function getParsedQuotes(): ParseResult {
	const source = getQuoteSource();
	return parseQuoteSource(source);
}
```

3. Modify it to use caching with source hash validation:

```typescript
export function getParsedQuotes(): ParseResult {
	const source = getQuoteSource();

	// Simple hash for cache validation (first 100 chars + length)
	const sourceHash = `${source.substring(0, 100)}_${source.length}`;

	// Return cached if source hasn't changed
	if (parsedQuotesCache.quotes !== null && parsedQuotesCache.sourceHash === sourceHash) {
		return { quotes: parsedQuotesCache.quotes, errors: [] };
	}

	// Parse and cache
	const result = parseQuoteSource(source);

	if (result.errors.length === 0) {
		parsedQuotesCache.quotes = result.quotes;
		parsedQuotesCache.sourceHash = sourceHash;
	}

	return result;
}
```

4. Find the function that updates the quote source (likely `updateQuoteSource()` or `setQuoteSource()` or similar). Add cache invalidation:

```typescript
export function updateQuoteSource(newSource: string): void {
	// ... existing update logic ...

	invalidateParsedQuotesCache(); // Add this line
}
```

5. Search the file for any other place where quote source might be modified and add invalidation.

**Expected result:** Quote source is parsed once and cached until source changes. Subsequent calls return cached result in O(1).

**Guardrails:**
- Using source hash instead of timestamp because source content is what matters.
- Only cache successful parses (no errors) to avoid caching bad data.
- Invalidation is critical when source updates.

---

### Step 3: Memoize `getYearDates()` Function

**Problem:** `getYearDates(year)` generates an array of 365 date strings by calling `formatDateISO()` 365 times. This function is called on EVERY journal page load. The result for a given year never changes.

**Files to update:**
- `morning-clarity-journal/src/lib/utils.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/utils.ts` and find the `getYearDates()` function. It should be around lines 75-87 and looks like:

```typescript
export function getYearDates(year: number): string[] {
	const dates: string[] = [];
	const startDate = new Date(year, 0, 1);
	const endDate = new Date(year, 11, 31);

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		dates.push(formatDateISO(d));
	}

	return dates;
}
```

2. Add a memoization cache above the function:

```typescript
/**
 * Memoization cache for year dates.
 * Key: year number, Value: array of date strings for that year.
 * Limited to 3 years to prevent unbounded memory growth.
 */
const yearDatesCache = new Map<number, string[]>();
const MAX_YEAR_CACHE_SIZE = 3;
```

3. Modify the function to use memoization:

```typescript
export function getYearDates(year: number): string[] {
	// Return cached if available
	if (yearDatesCache.has(year)) {
		return yearDatesCache.get(year)!;
	}

	// Generate dates for the year
	const dates: string[] = [];
	const startDate = new Date(year, 0, 1);
	const endDate = new Date(year, 11, 31);

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		dates.push(formatDateISO(d));
	}

	// Cache with size limit (evict oldest if needed)
	if (yearDatesCache.size >= MAX_YEAR_CACHE_SIZE) {
		const oldestKey = yearDatesCache.keys().next().value;
		yearDatesCache.delete(oldestKey);
	}
	yearDatesCache.set(year, dates);

	return dates;
}
```

4. The cache is limited to 3 years because users typically only view current year, maybe previous year. This prevents unbounded memory growth.

**Expected result:** First call for a year generates 365 dates. Subsequent calls for same year return cached array in O(1).

**Guardrails:**
- The returned array should not be mutated by callers. If mutation is possible, return a copy: `return [...yearDatesCache.get(year)!]`
- Cache size limit prevents memory leaks for edge cases.

---

### Step 4: Optimize Rate Limit to Single Query

**Problem:** `checkRateLimit()` is called on EVERY API request. Currently it makes 3 separate database queries: (1) DELETE old entries, (2) COUNT requests in window, (3) find MIN timestamp. Each query scans the rate_limit table.

**Files to update:**
- `morning-clarity-journal/src/lib/rate-limit.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/rate-limit.ts` and find the `checkRateLimit()` function (around lines 18-48).

2. The current implementation likely has separate queries like:
```typescript
// Delete old entries
db.prepare('DELETE FROM rate_limit WHERE timestamp < ?').run(windowStart);

// Count requests
const count = db.prepare('SELECT COUNT(*) as count FROM rate_limit WHERE ip = ? AND timestamp >= ?').get(ip, windowStart);

// Get oldest timestamp for retry-after calculation
const oldest = db.prepare('SELECT MIN(timestamp) as min_ts FROM rate_limit WHERE ip = ? AND timestamp >= ?').get(ip, windowStart);
```

3. Combine into a single query that returns all needed data:

```typescript
export function checkRateLimit(ip: string): RateLimitResult {
	const db = getDb();
	const now = Date.now();
	const windowStart = now - RATE_LIMIT_WINDOW_MS;

	// Single query: delete old entries and get count + min timestamp in one transaction
	// Use a transaction for atomicity
	const result = db.transaction(() => {
		// Clean up old entries (this is still necessary but batched)
		db.prepare('DELETE FROM rate_limit WHERE timestamp < ?').run(windowStart);

		// Get count and min timestamp in single query
		const stats = db.prepare(`
			SELECT
				COUNT(*) as count,
				MIN(timestamp) as min_timestamp
			FROM rate_limit
			WHERE ip = ? AND timestamp >= ?
		`).get(ip, windowStart) as { count: number; min_timestamp: number | null };

		return stats;
	})();

	const requestCount = result.count;

	if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
		const retryAfter = result.min_timestamp
			? Math.ceil((result.min_timestamp + RATE_LIMIT_WINDOW_MS - now) / 1000)
			: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

		return {
			allowed: false,
			remaining: 0,
			retryAfter: Math.max(1, retryAfter)
		};
	}

	// Record this request
	db.prepare('INSERT INTO rate_limit (ip, timestamp) VALUES (?, ?)').run(ip, now);

	return {
		allowed: true,
		remaining: RATE_LIMIT_MAX_REQUESTS - requestCount - 1,
		retryAfter: 0
	};
}
```

4. If the file doesn't use transactions, you may need to import or access the transaction method from better-sqlite3. Check how other files in the codebase use transactions.

5. Ensure the `RateLimitResult` interface exists with `allowed`, `remaining`, and `retryAfter` fields. If not, add it:

```typescript
interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfter: number;
}
```

**Expected result:** Rate limiting uses 1-2 queries instead of 3 queries per request. The DELETE and SELECT are in a transaction for consistency.

**Guardrails:**
- The DELETE is still necessary to prevent unbounded table growth.
- Transaction ensures atomic read-then-write.
- If the codebase doesn't use transactions elsewhere, use sequential queries but ensure they're in the right order.

---

### Step 5: Batch Audit Log Cleanup

**Problem:** `logAuditEvent()` is called on every auth attempt, backup, export, etc. When the log count approaches the limit, EVERY write triggers a COUNT(*) of all entries and then DELETE of old entries. This is O(n) on every write near the threshold.

**Files to update:**
- `morning-clarity-journal/src/lib/audit.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/audit.ts` and find the cleanup logic (around lines 25-49).

2. The current implementation likely checks count and deletes on every write:
```typescript
// On every logAuditEvent call:
const count = db.prepare('SELECT COUNT(*) FROM audit_log').get();
if (count.count > MAX_AUDIT_ENTRIES) {
	// Delete old entries
}
```

3. Change to probabilistic/batched cleanup - only check/clean every Nth write:

```typescript
/**
 * Cleanup counter. Only run cleanup every CLEANUP_FREQUENCY writes
 * to amortize the O(n) cost across many operations.
 */
let auditWriteCounter = 0;
const CLEANUP_FREQUENCY = 50; // Check every 50 writes
const MAX_AUDIT_ENTRIES = 10000; // Or whatever the current limit is
const CLEANUP_BATCH_SIZE = 500; // Delete this many at a time

export function logAuditEvent(
	eventType: string,
	details: Record<string, unknown> = {}
): void {
	const db = getDb();
	const timestamp = Date.now();
	const sanitizedDetails = sanitizeDetails(details);

	// Insert the new audit entry
	db.prepare(`
		INSERT INTO audit_log (event_type, details, timestamp)
		VALUES (?, ?, ?)
	`).run(eventType, JSON.stringify(sanitizedDetails), timestamp);

	// Increment counter and check if cleanup is due
	auditWriteCounter++;

	if (auditWriteCounter >= CLEANUP_FREQUENCY) {
		auditWriteCounter = 0;
		performAuditCleanupIfNeeded(db);
	}
}

/**
 * Check if cleanup is needed and perform it.
 * Only runs every CLEANUP_FREQUENCY writes.
 */
function performAuditCleanupIfNeeded(db: Database): void {
	const countResult = db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number };

	if (countResult.count > MAX_AUDIT_ENTRIES) {
		// Delete oldest entries to get back under limit
		const deleteCount = countResult.count - MAX_AUDIT_ENTRIES + CLEANUP_BATCH_SIZE;

		db.prepare(`
			DELETE FROM audit_log
			WHERE id IN (
				SELECT id FROM audit_log
				ORDER BY timestamp ASC
				LIMIT ?
			)
		`).run(deleteCount);
	}
}
```

4. Adjust `CLEANUP_FREQUENCY` and `CLEANUP_BATCH_SIZE` based on expected usage:
   - Higher frequency = more responsive cleanup but more overhead
   - Lower frequency = less overhead but log can grow larger between cleanups
   - 50 is a reasonable default

5. Ensure the `Database` type is imported if using TypeScript type annotations.

**Expected result:** Audit cleanup runs every 50th write instead of every write. O(n) cost is amortized across 50 operations, making average cost O(n/50) ≈ O(1).

**Guardrails:**
- The counter resets on server restart, but this is fine - worst case is one extra cleanup.
- If the app has very bursty writes, adjust CLEANUP_FREQUENCY accordingly.
- The DELETE uses a subquery to delete by ID which is indexed.

---

### Step 6: Optimize `locationNameExists()` Using Cache

**Problem:** `locationNameExists()` fetches ALL locations, decrypts each one, normalizes the name, then does a linear search with `.some()`. This is O(n*m) for n locations with m decrypt ops each, called on every location creation.

**Files to update:**
- `morning-clarity-journal/src/lib/db/locations.ts`

**What to change:**

1. Since Step 1 added location caching, `locationNameExists()` should now use the cached `getLocations()`. Find the function (around lines 102-113).

2. The current implementation might look like:
```typescript
export function locationNameExists(name: string): boolean {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM locations').all();
	// ... decrypt and check each one
}
```

3. Update to use the cached `getLocations()`:

```typescript
/**
 * Check if a location with the given name already exists.
 * Uses cached locations for O(n) string comparison instead of O(n*m) decryption.
 *
 * @param name - The location name to check
 * @param excludeId - Optional ID to exclude (for updates)
 * @returns true if a location with this name exists
 */
export function locationNameExists(name: string, excludeId?: number): boolean {
	const locations = getLocations(); // Uses cache from Step 1
	const normalizedName = name.trim().toLowerCase();

	return locations.some(
		(loc) => loc.name.trim().toLowerCase() === normalizedName && loc.id !== excludeId
	);
}
```

4. The key improvement: `getLocations()` is now cached (from Step 1), so this becomes O(n) string comparisons instead of O(n*m) decryptions.

5. Add the optional `excludeId` parameter to support update operations that need to check for duplicates excluding the current record.

**Expected result:** With Step 1's cache, this function goes from O(n*m) decrypt operations to O(n) string comparisons (much faster).

**Guardrails:**
- This optimization depends on Step 1 being completed first.
- The normalized comparison (trim + lowercase) should match what's used elsewhere for consistency.

---

### Step 7: Move Template Parser Regex to Module Level

**Problem:** In `parseTemplateSource()`, regex patterns are created on every function call. Regex compilation has overhead, and these patterns never change.

**Files to update:**
- `morning-clarity-journal/src/lib/template/parser.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/template/parser.ts` and find where regex patterns are defined inside the parsing function. They should look like:

```typescript
const hpRegex = /<hp([^>]*)>([\s\S]*?)<\/hp>/gi;
const mpRegex = /<mp([^>]*)>([\s\S]*?)<\/mp>/gi;
```

2. Move these to module level (top of file, after imports):

```typescript
/**
 * Template parsing regex patterns.
 * Defined at module level to avoid recompilation on every parse call.
 *
 * IMPORTANT: These use the /g flag which maintains lastIndex state.
 * Always reset lastIndex to 0 before using, or use String.match() instead of exec().
 */

/** Matches header prompt blocks: <hp id="..." ...>content</hp> */
const HP_REGEX = /<hp([^>]*)>([\s\S]*?)<\/hp>/gi;

/** Matches multi-prompt blocks: <mp id="..." ...>content</mp> */
const MP_REGEX = /<mp([^>]*)>([\s\S]*?)<\/mp>/gi;

/** Matches id attribute in tags: id="value" or id='value' */
const ID_ATTR_REGEX = /id=["']([^"']+)["']/i;

/** Matches label attribute in tags */
const LABEL_ATTR_REGEX = /label=["']([^"']+)["']/i;
```

3. Find all usages of these regexes in the parsing function. If they use `.exec()` in a loop, the `/g` flag state needs handling. There are two approaches:

   **Option A: Reset lastIndex before use**
   ```typescript
   HP_REGEX.lastIndex = 0;
   let match;
   while ((match = HP_REGEX.exec(sourceText)) !== null) {
   	// process match
   }
   ```

   **Option B: Use String.matchAll() which handles state automatically**
   ```typescript
   const matches = sourceText.matchAll(HP_REGEX);
   for (const match of matches) {
   	// process match
   }
   ```

4. Update all usages in the function. Replace local `hpRegex` with `HP_REGEX`, etc.

5. If there are other regex patterns defined locally in the function (like for parsing attributes), consider moving those to module level too.

**Expected result:** Regex patterns compiled once at module load, not on every function call. Faster parsing especially for repeated operations.

**Guardrails:**
- The `/g` flag is tricky. Test with:
  - Template with 0 hp/mp tags
  - Template with 1 hp/mp tag
  - Template with multiple hp/mp tags
- If issues arise, prefer `matchAll()` which handles state correctly.

---

### Step 8: Optimize Journal Page Time Update Loop

**Problem:** The journal page has a `setInterval` that runs every 30 seconds calling `getDateTimeParts()` which uses expensive `toLocaleDateString()` multiple times. This runs continuously while the page is open.

**Files to update:**
- `morning-clarity-journal/src/routes/journal/+page.svelte`

**What to change:**

1. Open `morning-clarity-journal/src/routes/journal/+page.svelte` and find the time update logic in `onMount()`. It should be around lines 67-76 and looks like:

```typescript
onMount(() => {
	const interval = setInterval(() => {
		const newTimeParts = getDateTimeParts();
		if (newTimeParts.time !== timeParts.time) {
			timeParts = newTimeParts;
		}
	}, CLOCK_UPDATE_INTERVAL_MS); // 30000ms = 30 seconds

	return () => clearInterval(interval);
});
```

2. Optimize to only update on minute boundaries and reduce expensive operations:

```typescript
onMount(() => {
	let lastMinute = new Date().getMinutes();

	const interval = setInterval(() => {
		const now = new Date();
		const currentMinute = now.getMinutes();

		// Only update if minute changed (not every 30 seconds)
		if (currentMinute !== lastMinute) {
			lastMinute = currentMinute;
			timeParts = getDateTimeParts();
		}
	}, CLOCK_UPDATE_INTERVAL_MS);

	return () => clearInterval(interval);
});
```

3. Optionally, if only the time display needs updating (not the date), create a lighter-weight function:

```typescript
/**
 * Get just the time string, avoiding expensive date formatting.
 */
function getCurrentTimeString(): string {
	const now = new Date();
	return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

4. Consider reducing the interval to 60 seconds if minute-precision is acceptable:

```typescript
const CLOCK_UPDATE_INTERVAL_MS = 60_000; // Check every minute
```

5. If the page displays seconds, keep 30 second interval but still use the minute-change check to avoid full `getDateTimeParts()` on every tick.

**Expected result:** Expensive date formatting operations reduced from every 30 seconds to only when minute actually changes (roughly every 60 seconds on average).

**Guardrails:**
- The visual update should still feel responsive. Users won't notice minute vs 30-second updates.
- If the design shows seconds, adjust accordingly.
- Clear the interval on component destroy to prevent memory leaks (already done with return statement).

---

### Step 9: Optimize completedFields Reactive Tracking

**Problem:** The `completedFields` derived value filters through all HP fields on every form data change (potentially every keystroke). This is O(n) where n is the number of HP fields.

**Files to update:**
- `morning-clarity-journal/src/routes/journal/+page.svelte`

**What to change:**

1. Open `morning-clarity-journal/src/routes/journal/+page.svelte` and find the `completedFields` derived (around lines 59-61):

```typescript
const completedFields = $derived(
	hpFieldIds.filter((id) => formData[id]?.trim())
);
const isComplete = $derived(completedFields.length === hpFieldIds.length);
```

2. This recalculates on every `formData` change. For incremental tracking, use a Set-based approach:

```typescript
/**
 * Track completed field count incrementally instead of filtering on every change.
 * When a field changes, we only check that one field, not all fields.
 */
let completedFieldsCount = $state(0);

// Initialize count on mount or when template changes
$effect(() => {
	// Recalculate when hpFieldIds changes (template change)
	completedFieldsCount = hpFieldIds.filter((id) => formData[id]?.trim()).length;
});

// Derive isComplete from count (O(1))
const isComplete = $derived(completedFieldsCount === hpFieldIds.length);
```

3. Alternative approach using a helper to update count incrementally:

```typescript
/**
 * Update completed count when a specific field changes.
 * Call this from the field's onInput handler.
 */
function updateFieldCompletion(fieldId: string, newValue: string): void {
	const wasCompleted = !!formData[fieldId]?.trim();
	const isCompleted = !!newValue.trim();

	if (!wasCompleted && isCompleted) {
		completedFieldsCount++;
	} else if (wasCompleted && !isCompleted) {
		completedFieldsCount--;
	}

	formData[fieldId] = newValue;
}
```

4. The trade-off: More complex code vs O(1) updates. For a form with 10-20 fields, the original O(n) might be acceptable. Implement incremental tracking only if profiling shows it's a bottleneck.

5. A simpler optimization that keeps the same pattern but reduces recalculation:

```typescript
// Debounce the completedFields calculation
import { debounce } from './utils.js'; // or implement inline

const completedFields = $derived.by(() => {
	// This still runs on every change, but the actual filtering is debounced
	return hpFieldIds.filter((id) => formData[id]?.trim());
});
```

**Expected result:** Reduced computation on keystroke events. Either incremental O(1) updates or debounced O(n) calculations.

**Guardrails:**
- The UI must still reflect completion state accurately.
- Test rapid typing to ensure no race conditions.
- If debouncing, use a short delay (50-100ms) to maintain responsiveness.

---

### Step 10: Add Date Formatting Cache

**Problem:** `toLocaleDateString()` is an expensive locale-aware operation called multiple times for each date display. The sidebar might show 30+ entries, each calling this function.

**Files to update:**
- `morning-clarity-journal/src/lib/utils.ts`

**What to change:**

1. Open `morning-clarity-journal/src/lib/utils.ts` and find the date formatting functions. There should be `formatDateTime()`, `formatDateForSidebar()`, or similar functions.

2. Add a date format cache at the module level:

```typescript
/**
 * Cache for formatted date strings.
 * Key: "dateISO|formatType", Value: formatted string
 * Limited size to prevent memory growth.
 */
const dateFormatCache = new Map<string, string>();
const MAX_DATE_CACHE_SIZE = 200;

/**
 * Get or compute a cached formatted date string.
 */
function getCachedFormat(
	dateISO: string,
	formatType: string,
	formatter: () => string
): string {
	const cacheKey = `${dateISO}|${formatType}`;

	if (dateFormatCache.has(cacheKey)) {
		return dateFormatCache.get(cacheKey)!;
	}

	const formatted = formatter();

	// Evict oldest if at capacity
	if (dateFormatCache.size >= MAX_DATE_CACHE_SIZE) {
		const firstKey = dateFormatCache.keys().next().value;
		dateFormatCache.delete(firstKey);
	}

	dateFormatCache.set(cacheKey, formatted);
	return formatted;
}
```

3. Update `formatDateForSidebar()` to use the cache:

```typescript
export function formatDateForSidebar(dateISO: string): string {
	return getCachedFormat(dateISO, 'sidebar', () => {
		const date = new Date(dateISO + 'T00:00:00');
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	});
}
```

4. Update other formatting functions similarly:

```typescript
export function formatDateTime(timestamp: number): string {
	const dateISO = new Date(timestamp).toISOString().split('T')[0];
	return getCachedFormat(dateISO, 'datetime', () => {
		const date = new Date(timestamp);
		return date.toLocaleDateString(undefined, {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	});
}
```

5. The cache size of 200 is enough for 6+ months of daily entries with multiple format types.

**Expected result:** Each unique date+format combination is computed once. Subsequent calls return cached string in O(1).

**Guardrails:**
- Cache key includes format type to handle different formatting options.
- Size limit prevents unbounded memory growth.
- Locale-specific formatting is still respected (just cached).

---

### Step 11: Verification and Performance Testing

**Commands:**
- After each step: `npx svelte-check --threshold error`
- After all steps: `npm run build` then `npm run dev`

**Verification checks:**

1. **Location operations:**
   - Create a new location - should be fast
   - View locations list - should be fast
   - GPS capture should match existing location

2. **Quote operations:**
   - Create a new journal entry - daily quote should appear
   - Edit quote source in settings - new quotes should be used

3. **Journal page:**
   - Page load should feel snappy
   - Typing in form fields should be responsive
   - Time display should update correctly

4. **Rate limiting:**
   - Rapid API requests should be rate limited correctly
   - No database errors under load

5. **Audit logging:**
   - Login attempts should be logged
   - Old logs should eventually be cleaned up

**Performance measurement (optional but recommended):**

Before implementing each step, you can measure baseline performance:

```typescript
// Add to a test file or temporarily in the code
const start = performance.now();
// ... operation to measure ...
const end = performance.now();
console.log(`Operation took ${end - start}ms`);
```

Document any measurements in the Implementation Log.

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)

Step 1: Added a 5-minute TTL cache for locations with explicit invalidation on create/delete, and updated getLocations to reuse cached decrypt/sort results when valid. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 2: Added a parsed quotes cache keyed by source hash, invalidated on quote source updates, and reused cached quotes when unchanged. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 3: Memoized getYearDates with a small LRU-style cache (size 3) and returned copies to avoid mutation, reducing repeated date generation. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 4: Consolidated rate-limit cleanup/count/min timestamp into a transactional delete + single stats query, reducing per-request queries while preserving retry-after logic. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 5: Batched audit log cleanup to every 50 writes and delete in batches, reducing per-write count/delete overhead. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 6: Updated locationNameExists to use cached getLocations with normalized string comparison and optional excludeId. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 7: Ensured module-level template regex state is reset before parsing by resetting HP regex lastIndex on each parse run. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 8: Updated journal time refresh to recompute date parts only on minute change, reducing expensive formatting calls. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 9: Replaced per-keystroke hp field filtering with incremental completion tracking via field-change callbacks and periodic resync on template/draft updates. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 10: Added a bounded date format cache and wrapped formatDateForSidebar to reuse cached formatted strings. `npx svelte-check --threshold error` found 0 errors and 0 warnings.
Step 11: Ran `npm run build` successfully. Ran `npm run dev`, server reported ready at `http://localhost:5174/` (command timed out due to long-running dev server).
