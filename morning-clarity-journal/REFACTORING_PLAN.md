# Morning Clarity Journal - Refactoring Plan

> **Objective**: Clean up codebase to follow AGENTS.md architecture principles while maintaining **zero visual changes**
> 
> **Constraints**: No pixels moved, no logic altered, no styles changed, no data structures modified
>
> **Created**: January 22, 2026

---

## 📋 Table of Contents

1. [Context & Overview](#context--overview)
2. [Architecture Principles](#architecture-principles)
3. [Current Issues Summary](#current-issues-summary)
4. [Refactoring Phases](#refactoring-phases)
5. [Risk Mitigation](#risk-mitigation)
6. [Implementation Guidelines](#implementation-guidelines)

---

## Context & Overview

### Project Description
Morning Clarity Journal is a personal journaling web app for daily morning rituals with password authentication, time-locking, and encrypted storage.

### Tech Stack
- **Framework**: SvelteKit (Vite-based) with TypeScript
- **Database**: SQLite with `better-sqlite3`
- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **Styling**: Tailwind CSS v4 with Notion-inspired UI
- **Deployment**: Docker + Fly.io

### Current File Structure
```
morning-clarity-journal/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # Login page (75 lines)
│   │   ├── +layout.svelte            # Root layout (81 lines)
│   │   ├── journal/
│   │   │   └── +page.svelte         # Main journal page (1,009 lines) ⚠️ TOO LARGE
│   │   ├── entry/[date]/
│   │   │   └── +page.svelte         # Entry view page (233 lines)
│   │   └── api/
│   │       ├── auth/+server.ts
│   │       ├── entries/+server.ts
│   │       ├── entries/[date]/+server.ts
│   │       ├── locations/+server.ts
│   │       ├── locations/[id]/+server.ts
│   │       ├── backup/+server.ts
│   │       └── seed-test/+server.ts
│   ├── lib/
│   │   ├── auth.ts                  # Session management
│   │   ├── crypto.ts                # Encryption utilities
│   │   ├── db.ts                    # Database operations (372 lines)
│   │   ├── template.ts              # Journal template definition
│   │   ├── utils.ts                 # Date/time utilities
│   │   └── index.ts                # Barrels
│   ├── hooks.server.ts              # Auth middleware
│   ├── app.css                     # Global styles (1,633 lines)
│   └── app.html
├── package.json
├── svelte.config.js
├── tsconfig.json
└── AGENTS.md                       # Architecture principles
```

### Key Design Decisions to Preserve
- **Password**: `ismathrelatedtoscience` (hardcoded in `src/lib/db.ts:80` and `src/lib/auth.ts:57`)
- **Time Cutoff**: 14:00 (2:00 PM) - journal only available before this time
- **Session Duration**: 24 hours (httpOnly cookie)
- **Encryption**: AES-256-GCM with PBKDF2 (100k iterations)
- **Location Tolerance**: 15 meters for GPS matching
- **Recent Entries Limit**: Show last 30 entries
- **Coordinate Precision**: 4 decimal places (`.toFixed(4)`)
- **Shake Animation**: 400ms duration for wrong password
- **Success Message Duration**: 3000ms for backup success
- **Animation Duration**: 150ms for slide transitions

### Development Mode Features

- **Time Cutoff Disable**: Set `VITE_DISABLE_TIME_CUTOFF=true` in `.env` to allow journal access at any time during development
- See `.env.example` for all available environment variables

---

## Architecture Principles

From `AGENTS.md`:

```markdown
## architecture principles

- **feature-first**: group by feature, not type
- **dry**: no duplicate logic/literals/structures
- **single source of truth**: never duplicate/derive state; compute it
- **no magic literals**: extract repeated values to constants
- **lean pages**: `+page.svelte` handles routing/composition only; logic in hooks/services
- **one responsibility per file**: split ui into components/subcomponents
- **keep SvelteKit views dumb**: UI should never know your business logic. fetch from backend, render UI, nothing else
- **no cross-pollution**: don't put big computations or business rules inside .svelte files. keep them in TS utilities or backend

## import & path rules

- **case-sensitive imports**: vite hmr breaks with wrong casing; match filesystem exactly (`./foo.js` not `./foo.js`)
- **handle promises**: no floating promises; use `.catch()` for manual promises in async functions

## formatting (prettier)

- tabs (not spaces)
- single quotes for strings
- no trailing commas
- 100 char print width

## file headers (mandatory)

every svelte file starts with:

\`\`\`svelte
<!-- purpose: <one-sentence summary> -->
<!-- context: <feature/module and how it fits> -->
<!-- location: <full internal path> -->
\`\`\`
```

---

## Current Issues Summary

| Issue Type | Count | Priority |
|------------|-------|----------|
| Duplicate Code Patterns | 8 | Medium |
| Magic Literals | 12 | Low-Medium |
| Business Logic in Components | 5 | High |
| Extractable Functions | 6 | Medium |
| Duplicate Validation | 5 | High |
| State Management Issues | 4 | Medium |
| CSS Consolidation | 6 | Low-Medium |
| Reusable UI Patterns | 6 | Medium |
| **TOTAL** | **52** | **Medium-High** |

---

## Refactoring Phases

**IMPORTANT**: Complete each phase fully before moving to the next. Test after each phase.

### Phase 1: Extract Constants & Configuration (Foundation)

#### Phase 1.1: Create Constants File

**New File**: `src/lib/constants.ts`

**Add these constants**:

```typescript
// GPS Configuration
export const GPS = {
	EARTH_RADIUS_METERS: 6371000,
	DEFAULT_TOLERANCE_METERS: 15,
	DEFAULT_TIMEOUT_MS: 10000,
	DEFAULT_OPTIONS: {
		enableHighAccuracy: true,
		timeout: 10000
	}
} as const;

// Time & Date
export const TIME = {
	CUTOFF_HOUR: 14, // 2:00 PM - from src/lib/utils.ts:43
	CLOCK_UPDATE_INTERVAL_MS: 1000,
	SHAKE_DURATION_MS: 400, // from src/routes/+page.svelte:28
	SUCCESS_MESSAGE_DURATION_MS: 3000, // from src/routes/journal/+page.svelte:483
	ANIMATION_DURATION_MS: 150 // from src/routes/journal/+page.svelte:648
} as const;

// Display
export const DISPLAY = {
	RECENT_ENTRIES_LIMIT: 30, // from src/routes/journal/+page.svelte:316
	COORDINATE_DECIMAL_PLACES: 4 // from multiple .toFixed(4) calls
} as const;

// Validation
export const VALIDATION = {
	LATITUDE_MIN: -90,
	LATITUDE_MAX: 90,
	LONGITUDE_MIN: -180,
	LONGITUDE_MAX: 180
} as const;
```

**Files to Update** (replace magic literals with constants):

1. **src/routes/journal/+page.svelte**:
   - Line 173: `const R = 6371000` → use `GPS.EARTH_RADIUS_METERS`
   - Line 187: `const toleranceMeters = 15` → use `GPS.DEFAULT_TOLERANCE_METERS`
   - Line 244, 391: `{ enableHighAccuracy: true, timeout: 10000 }` → use `GPS.DEFAULT_OPTIONS`
   - Line 483: `3000` → use `TIME.SUCCESS_MESSAGE_DURATION_MS`
   - Line 648: `duration: 150` → use `TIME.ANIMATION_DURATION_MS`
   - Line 316: `.slice(0, 30)` → use `DISPLAY.RECENT_ENTRIES_LIMIT`
   - Line 533, 874: `.toFixed(4)` → use `DISPLAY.COORDINATE_DECIMAL_PLACES`

2. **src/routes/+page.svelte**:
   - Line 28: `400` → use `TIME.SHAKE_DURATION_MS`

3. **src/lib/utils.ts**:
   - Line 43: `return date.getHours() >= 14` → use `TIME.CUTOFF_HOUR`

4. **src/routes/api/entries/+server.ts**:
   - Lines 41-50: Coordinate validation → use `VALIDATION` constants

5. **src/routes/api/locations/+server.ts**:
   - Lines 17-23: Coordinate validation → use `VALIDATION` constants

6. **src/routes/entry/[date]/+page.svelte**:
   - Line 142: `.toFixed(4)` → use `DISPLAY.COORDINATE_DECIMAL_PLACES`

**Testing**: Verify all functionality still works identically

**✅ COMPLETED (Phase 1.1)**:
Created `src/lib/constants.ts` with four constant groups: GPS (earth radius, tolerance, timeout), TIME (cutoff hour, shake duration, animation duration, success message timeout), DISPLAY (recent entries limit, coordinate precision), and VALIDATION (latitude/longitude bounds). Updated six files to replace magic literals with named constants: journal/+page.svelte (GPS.EARTH_RADIUS_METERS, GPS.DEFAULT_TOLERANCE_METERS, GPS.DEFAULT_OPTIONS, TIME.SUCCESS_MESSAGE_DURATION_MS, TIME.ANIMATION_DURATION_MS, DISPLAY.RECENT_ENTRIES_LIMIT, DISPLAY.COORDINATE_DECIMAL_PLACES), +page.svelte (TIME.SHAKE_DURATION_MS), lib/utils.ts (TIME.CUTOFF_HOUR), api/entries/+server.ts (VALIDATION.LATITUDE_MAX/MIN, VALIDATION.LONGITUDE_MAX/MIN), api/locations/+server.ts (VALIDATION coordinates), entry/[date]/+page.svelte (DISPLAY.COORDINATE_DECIMAL_PLACES). Build passes. No functional changes, only extracted hardcoded values to constants.

---

#### Phase 1.2: Extract CSS Custom Properties

**File**: `src/app.css`

**Add to :root** (after line 101):

```css
/* Shadow tokens - eliminate duplication */
--shadow-sm: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px;
--shadow-sm-dark: rgba(255, 255, 255, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 3px 6px;
--shadow-md: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 5px 10px, rgba(15, 15, 15, 0.2) 0px 15px 40px;
--shadow-md-dark: rgba(255, 255, 255, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.3) 0px 5px 10px, rgba(0, 0, 0, 0.5) 0px 15px 40px;
--shadow-lg: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px;
--shadow-lg-dark: rgba(255, 255, 255, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 3px 6px, rgba(0, 0, 0, 0.4) 0px 9px 24px;
```

**Update Classes** (replace inline shadows with variables):

1. **.progress-pill** (lines 731, 734):
   ```css
   box-shadow: var(--shadow-sm);
   }
   .dark .progress-pill {
       box-shadow: var(--shadow-sm-dark);
   ```

2. **.nav-btn** (lines 762, 767):
   ```css
   box-shadow: var(--shadow-sm);
   }
   .dark .nav-btn {
       box-shadow: var(--shadow-sm-dark);
   ```

3. **.settings-modal** (lines 903-905, 914-916):
   ```css
   box-shadow: var(--shadow-md);
   }
   .dark .settings-modal {
       box-shadow: var(--shadow-md-dark);
   ```

4. **.location-dropdown-menu** (lines 1249-1251, 1259-1261):
   ```css
   box-shadow: var(--shadow-lg);
   }
   .dark .location-dropdown-menu {
       box-shadow: var(--shadow-lg-dark);
   ```

**Testing**: Compare visual appearance - should be identical

**✅ COMPLETED (Phase 1.2)**:
Added six shadow token custom properties to `src/app.css` :root: --shadow-sm, --shadow-sm-dark, --shadow-md, --shadow-md-dark, --shadow-lg, --shadow-lg-dark. Replaced inline shadow values in four classes with CSS variables: .progress-pill & .dark .progress-pill (→ var(--shadow-sm) / var(--shadow-sm-dark)), .nav-btn & .dark .nav-btn (→ var(--shadow-sm) / var(--shadow-sm-dark)), .settings-modal & .dark .settings-modal (→ var(--shadow-md) / var(--shadow-md-dark)), .location-dropdown-menu & .dark .location-dropdown-menu (→ var(--shadow-lg) / var(--shadow-lg-dark)). Eliminated shadow duplication from CSS while maintaining identical visual output. Build passes.

---

### Phase 2: Extract Business Logic (Clean Svelte Components)

#### Phase 2.1: Create Validation Utilities

**New File**: `src/lib/validation.ts`

**Content**:

```typescript
import type { Location } from './db.js';
import { VALIDATION } from './constants.js';

export function validateCoordinates(lat: number, lng: number): { valid: boolean; error?: string } {
	if (typeof lat !== 'number' || lat < VALIDATION.LATITUDE_MIN || lat > VALIDATION.LATITUDE_MAX) {
		return { valid: false, error: 'Invalid latitude' };
	}
	if (typeof lng !== 'number' || lng < VALIDATION.LONGITUDE_MIN || lng > VALIDATION.LONGITUDE_MAX) {
		return { valid: false, error: 'Invalid longitude' };
	}
	return { valid: true };
}

export function validateId(id: string | number): { valid: boolean; error?: string } {
	const num = typeof id === 'number' ? id : parseInt(id, 10);
	if (isNaN(num)) {
		return { valid: false, error: 'Invalid ID' };
	}
	return { valid: true };
}

export function validateLocationName(name: unknown): { valid: boolean; error?: string } {
	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		return { valid: false, error: 'Invalid location name' };
	}
	return { valid: true };
}

export function validateJournalData(data: unknown): { valid: boolean; error?: string } {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { valid: false, error: 'Invalid entry data format' };
	}
	return { valid: true };
}
```

**Files to Update**:

1. **src/routes/api/entries/+server.ts**:
   ```typescript
   import { validateCoordinates, validateJournalData } from '$lib/validation.js';
   
   // Replace lines 31-50 with:
   const { locationId, data, capturedLat, capturedLng } = payload;
   
   const dataValidation = validateJournalData(data);
   if (!dataValidation.valid) {
       return json({ success: false, error: dataValidation.error }, { status: 400 });
   }
   
   if (locationId !== null && (typeof locationId !== 'number' || locationId <= 0)) {
       return json({ success: false, error: 'Invalid location ID' }, { status: 400 });
   }
   
   if (capturedLat !== null && capturedLat !== undefined) {
       const validation = validateCoordinates(capturedLat, capturedLng || 0);
       if (!validation.valid) {
           return json({ success: false, error: validation.error }, { status: 400 });
       }
   }
   ```

2. **src/routes/api/locations/+server.ts**:
   ```typescript
   import { validateCoordinates, validateLocationName } from '$lib/validation.js';
   
   // Replace lines 13-28 with:
   const nameValidation = validateLocationName(name);
   if (!nameValidation.valid) {
       return json({ success: false, error: nameValidation.error }, { status: 400 });
   }
   
   const coordValidation = validateCoordinates(lat, lng);
   if (!coordValidation.valid) {
       return json({ success: false, error: coordValidation.error }, { status: 400 });
   }
   ```

3. **src/routes/api/locations/[id]/+server.ts**:
   ```typescript
   import { validateId } from '$lib/validation.js';
   
   // Replace lines 8-10 with:
   const validation = validateId(params.id);
   if (!validation.valid) {
       return json({ success: false, error: validation.error }, { status: 400 });
   }
   const id = typeof params.id === 'number' ? params.id : parseInt(params.id, 10);
   ```

**Testing**: Verify API endpoints return identical responses

**✅ COMPLETED (Phase 2.1)**:
Created `src/lib/validation.ts` with four validation functions: validateCoordinates (checks latitude/longitude bounds using VALIDATION constants), validateId (parses and validates numeric IDs), validateLocationName (validates non-empty string names), validateJournalData (validates object structure). Updated three API endpoints to use centralized validators: api/entries/+server.ts (replaced inline data structure validation with validateJournalData, coordinate checks with validateCoordinates), api/locations/+server.ts (replaced inline name and coordinate validation with validateLocationName and validateCoordinates), api/locations/[id]/+server.ts (replaced isNaN check with validateId). Removed import of VALIDATION constants from api/entries and api/locations since validation.ts now uses them. All API error messages and status codes remain identical. Build passes. No functional changes, only extracted duplicate validation logic into reusable utilities.

---

#### Phase 2.2: Create Location Utilities

**New File**: `src/lib/location-utils.ts`

**Content**:

```typescript
import type { Location } from './db.js';
import { GPS, DISPLAY } from './constants.js';

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a = 
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) * Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return GPS.EARTH_RADIUS_METERS * c;
}

export function findMatchingPreset(lat: number, lng: number, locations: Location[]): number | null {
	for (const loc of locations) {
		const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
		if (distance <= GPS.DEFAULT_TOLERANCE_METERS) {
			return loc.id;
		}
	}
	return null;
}

export function formatCoordinate(coord: number): string {
	return coord.toFixed(DISPLAY.COORDINATE_DECIMAL_PLACES);
}

export function handleGeolocationError(error: GeolocationPositionError): string {
	switch (error.code) {
		case error.PERMISSION_DENIED:
			return 'Permission denied';
		case error.POSITION_UNAVAILABLE:
			return 'Location unavailable';
		case error.TIMEOUT:
			return 'Request timed out';
		default:
			return 'Failed to get location';
	}
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   - Remove `calculateDistance` function (lines 170-182)
   - Remove `findMatchingPreset` function (lines 184-195)
   - Remove error handling in `captureCurrentLocation` (lines 228-242)
   - Remove error handling in `getCurrentLocationAndSave` (lines 376-389)
   - Import utilities at top:
     ```typescript
     import { findMatchingPreset, handleGeolocationError, formatCoordinate } from '$lib/location-utils.js';
     ```
   - Update `captureCurrentLocation` to use imported functions
   - Update coordinate display (lines 533, 874) to use `formatCoordinate()`

2. **src/routes/entry/[date]/+page.svelte**:
   - Import: `import { formatCoordinate } from '$lib/location-utils.js';`
   - Update line 142: `{entry.captured_lat.toFixed(4)}` → `{formatCoordinate(entry.captured_lat)}`

**Testing**: Verify GPS capture, coordinate display, and preset matching work identically

**✅ COMPLETED (Phase 2.2)**:
Created `src/lib/location-utils.ts` with four utility functions: calculateDistance (Haversine formula using GPS.EARTH_RADIUS_METERS), findMatchingPreset (iterates through locations to find match within GPS.DEFAULT_TOLERANCE_METERS), formatCoordinate (applies DISPLAY.COORDINATE_DECIMAL_PLACES via toFixed), handleGeolocationError (maps error codes to human-readable messages). Updated two files to use extracted utilities: src/routes/journal/+page.svelte (removed inline calculateDistance function lines 171-182, removed inline findMatchingPreset function lines 184-194, replaced switch statement error handling in captureCurrentLocation and getCurrentLocationAndSave with handleGeolocationError, replaced capturedLat.toFixed/capturedLng.toFixed at line 532 and loc.lat.toFixed/loc.lng.toFixed at line 873 with formatCoordinate calls), src/routes/entry/[date]/+page.svelte (replaced entry.captured_lat.toFixed/entry.captured_lng.toFixed at line 142 with formatCoordinate calls). All GPS functionality (capture, coordinate display, preset matching) remains identical. Build passes. No functional changes, only extracted location-related utilities to reusable module.

---

#### Phase 2.3: Create API Helpers

**New File**: `src/lib/api-helpers.ts`

**Content**:

```typescript
import { json } from '@sveltejs/kit';
import { validateJournalData } from './validation.js';

export async function parseJsonBody<T>(request: Request): Promise<{ data?: T; error?: string }> {
	try {
		const data = await request.json() as T;
		return { data };
	} catch {
		return { error: 'Invalid JSON payload' };
	}
}

export function successResponse(data: Record<string, unknown> = {}) {
	return json({ success: true, ...data });
}

export function errorResponse(message: string, status: number = 400) {
	return json({ success: false, error: message }, { status });
}

export function notFoundResponse(message: string = 'Not found') {
	return json({ success: false, error: message }, { status: 404 });
}
```

**Files to Update**:

1. **src/routes/api/entries/+server.ts**:
   ```typescript
   import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
   
   // Replace POST handler (lines 20-63):
   export const POST: RequestHandler = async ({ request }) => {
       const body = await parseJsonBody<EntryPayload>(request);
       if (body.error) {
           return errorResponse(body.error);
       }
       
       const { locationId, data, capturedLat, capturedLng } = body.data!;
       
       // ... validation logic (using Phase 2.1) ...
       
       try {
           const id = saveEntry(date, timestamp, locationId, data, capturedLat, capturedLng);
           return successResponse({ id, date });
       } catch (error) {
           return errorResponse('Entry for today already exists');
       }
   };
   ```

2. **src/routes/api/locations/+server.ts**:
   ```typescript
   import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
   
   // Replace POST handler similarly
   ```

3. **src/routes/api/backup/+server.ts**:
   ```typescript
   import { successResponse, errorResponse } from '$lib/api-helpers.js';
   
   // Replace all json({ success: ... }) calls
   ```

4. **src/routes/api/locations/[id]/+server.ts**:
   ```typescript
   import { successResponse, errorResponse } from '$lib/api-helpers.js';
   ```

**Testing**: Verify all API responses identical

**✅ COMPLETED (Phase 2.3)**:
Created `src/lib/api-helpers.ts` with four helper functions: parseJsonBody (wraps request.json with try-catch), successResponse (returns json with success: true and optional data), errorResponse (returns json with success: false, error message, and optional status), notFoundResponse (returns json with success: false and 404 status). Updated four API endpoint files to use helpers: src/routes/api/entries/+server.ts (replaced try/catch json parsing with parseJsonBody, replaced json({ success: false, error }) with errorResponse, replaced json({ success: true }) with successResponse), src/routes/api/locations/+server.ts (same replacements), src/routes/api/backup/+server.ts (replaced all json({ success: ... }) with successResponse/errorResponse/notFoundResponse), src/routes/api/locations/[id]/+server.ts (replaced json responses with helpers). All API responses (data format, error messages, status codes) remain identical. Build passes. No functional changes, only extracted duplicate API response patterns into reusable helpers.

---

#### Phase 2.4: Create Statistics Utilities

**New File**: `src/lib/stats.ts`

**Content**:

```typescript
import { DISPLAY } from './constants.js';
import { formatDateISO, isToday } from './utils.js';

export interface Stats {
	completedCount: number;
	total: number;
}

export interface RecentEntry {
	date: string;
	completed: boolean;
	entry?: any;
}

export function calculateStats(entryDates: string[], yearDates: string[]): Stats {
	const pastDates = yearDates.filter(d => isDateInPast(d));
	const completedCount = pastDates.filter(d => entryDates.includes(d)).length;
	return { completedCount, total: pastDates.length };
}

export function getRecentEntries(
	yearDates: string[], 
	entryDates: string[], 
	entries: any[], 
	limit: number = DISPLAY.RECENT_ENTRIES_LIMIT
): RecentEntry[] {
	return yearDates
		.filter(d => isDateInPast(d) || isToday(d))
		.map(d => ({
			date: d,
			completed: entryDates.includes(d),
			entry: entries.find(e => e.date === d)
		}))
		.reverse()
		.slice(0, limit);
}

function isDateInPast(dateStr: string): boolean {
	const today = formatDateISO(new Date());
	return dateStr < today;
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```typescript
   import { calculateStats, getRecentEntries } from '$lib/stats.js';
   
   // Remove getStats() function (lines 300-305)
   // Remove getPastDates() function (lines 307-317)
   
   // Update calls:
   function getStats() {
       return calculateStats(entryDates, yearDates);
   }
   
   function getPastDates() {
       return getRecentEntries(yearDates, entryDates, entries);
   }
   ```

**Testing**: Verify statistics display correctly

**✅ COMPLETED (Phase 2.4)**:
Created `src/lib/stats.ts` with three functions: calculateStats (computes completed count and total for past dates), getRecentEntries (returns recent entries with status, limited to DISPLAY.RECENT_ENTRIES_LIMIT), isDateInPast (helper to check if date is before today). Updated src/routes/journal/+page.svelte to use extracted statistics: added import for calculateStats and getRecentEntries, removed inline getStats() function (lines 262-267), removed inline getPastDates() function (lines 269-279), replaced getStats().completedCount and getStats().total calls with calculateStats(entryDates, yearDates).completedCount and calculateStats(entryDates, yearDates).total, replaced getPastDates() call with getRecentEntries(yearDates, entryDates, entries). Statistics display (completion count and recent entries) remains identical. Build passes. No functional changes, only extracted statistics logic into reusable utilities.

---

#### Phase 2.5: Create Legacy Field Labels

**New File**: `src/lib/legacy-field-labels.ts`

**Content**:

```typescript
export const LEGACY_FIELD_LABELS: Record<string, string> = {
	'whyAvoiding': 'Why am I avoiding it?',
	'realFear': 'The real fear is',
	'howLikely': 'How likely (1-10)',
	'howBad10Days': 'How bad in 10 days',
	'howBad10Months': 'How bad in 10 months',
	'howBad10Years': 'How bad in 10 years',
	'kimTest': 'Kim test reflection',
	'whatDoILose': 'What do I lose if fear wins',
	'whatConsumeInsteadProduce': 'What will I consume instead of produce',
	'egoWillTell': 'My ego will tell me',
	'triggerTimeSituation': 'Trigger time/situation',
	'temptedWhenWillBecause': 'When tempted',
	'track': 'Track',
	'nonNeg1What': 'Non-negotiable #1',
	'nonNeg1When': 'Non-negotiable #1 when',
	'nonNeg2What': 'Non-negotiable #2',
	'nonNeg2When': 'Non-negotiable #2 when',
	'nonNeg3What': 'Non-negotiable #3',
	'nonNeg3When': 'Non-negotiable #3 when',
	'trapRule': 'Trap rule'
};

export function getLegacyFieldLabel(fieldId: string): string {
	return LEGACY_FIELD_LABELS[fieldId] || fieldId;
}
```

**Files to Update**:

1. **src/routes/entry/[date]/+page.svelte**:
   ```typescript
   import { getLegacyFieldLabel } from '$lib/legacy-field-labels.js';
   
   // Remove getLegacyFieldLabel function (lines 71-105)
   ```

**Testing**: Verify legacy fields display correctly in old entries

**✅ COMPLETED (Phase 2.5)**:
Created `src/lib/legacy-field-labels.ts` with LEGACY_FIELD_LABELS constant (maps legacy field IDs to human-readable labels) and getLegacyFieldLabel function (returns label from constant or fieldId as fallback). Updated src/routes/entry/[date]/+page.svelte to use extracted utility: added import for getLegacyFieldLabel, removed inline getLegacyFieldLabel function (lines 82-107) which contained duplicate labels object. Legacy field display in old entries remains identical. Build passes. No functional changes, only extracted duplicate legacy field label mapping into reusable constant and utility.

---

### Phase 3: Extract Reusable UI Components

#### Phase 3.1: Create Icon Component

**New File**: `src/lib/components/Icons.svelte`

**Content**:

```svelte
<!-- purpose: Icon component library -->
<!-- context: Reusable SVG icons for consistent UI -->
<!-- location: src/lib/components/Icons.svelte -->

<script lang="ts">
	interface Props {
		name: 'settings' | 'menu' | 'close' | 'chevron' | 'check' | 'trash' | 'location' | 'sun' | 'moon' | 'download' | 'arrow-left' | 'handle';
		size?: number;
	}
	let { name, size = 16 }: Props = $props();
</script>

{#if name === 'settings'}
	<svg {size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="3"></circle>
		<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
	</svg>
{:else if name === 'close'}
	<svg {size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
{:else if name === 'chevron'}
	<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
		<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
	</svg>
{:else if name === 'menu'}
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
		<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
		<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
	</svg>
{:else if name === 'check'}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<polyline points="20 6 9 17 4 12"></polyline>
	</svg>
{:else if name === 'trash'}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
{:else if name === 'location'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10"></circle>
		<circle cx="12" cy="12" r="3"></circle>
		<line x1="12" y1="2" x2="12" y2="4"></line>
		<line x1="12" y1="20" x2="12" y2="22"></line>
		<line x1="2" y1="12" x2="4" y2="12"></line>
		<line x1="20" y1="12" x2="22" y2="12"></line>
	</svg>
{:else if name === 'sun'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="5"></circle>
		<line x1="12" y1="1" x2="12" y2="3"></line>
		<line x1="12" y1="21" x2="12" y2="23"></line>
		<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
		<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
		<line x1="1" y1="12" x2="3" y2="12"></line>
		<line x1="21" y1="12" x2="23" y2="12"></line>
		<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
		<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
	</svg>
{:else if name === 'moon'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
	</svg>
{:else if name === 'download'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
		<polyline points="7 10 12 15 17 10"></polyline>
		<line x1="12" y1="15" x2="12" y2="3"></line>
	</svg>
{:else if name === 'arrow-left'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M19 12H5M12 19l-7-7 7-7"/>
	</svg>
{:else if name === 'handle'}
	<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
		<circle cx="4" cy="3" r="1.25"/>
		<circle cx="10" cy="3" r="1.25"/>
		<circle cx="4" cy="7" r="1.25"/>
		<circle cx="10" cy="7" r="1.25"/>
		<circle cx="4" cy="11" r="1.25"/>
		<circle cx="10" cy="11" r="1.25"/>
	</svg>
{/if}
```

**Files to Update** (replace inline SVGs with `<Icon name="..." />`):

1. **src/routes/journal/+page.svelte**:
   - Line 550: Chevron dropdown arrow → `<Icon name="chevron" size={10} />`
   - Line 578, 636: Check mark → `<Icon name="check" size={14} />`
   - Line 619: Block handle → `<Icon name="handle" size={14} />`
   - Line 654: Block handle → `<Icon name="handle" size={14} />`
   - Line 725, 745: Settings gear → `<Icon name="settings" size={16} />`
   - Line 816: Menu book → `<Icon name="menu" size={18} />`
   - Line 853: Close X → `<Icon name="close" size={16} />`
   - Line 887: Trash can → `<Icon name="trash" size={14} />`
   - Line 916, 991: Location pin → `<Icon name="location" size={16} />`
   - Line 1014: Download arrow → `<Icon name="download" size={16} />`

2. **src/routes/entry/[date]/+page.svelte**:
   - Line 159: Chevron → `<Icon name="chevron" size={10} />`
   - Line 198: Block handle → `<Icon name="handle" size={14} />`
   - Line 227: Arrow left → `<Icon name="arrow-left" size={16} />`

3. **src/routes/+layout.svelte**:
   - Line 71-74: Sun/Moon → `<Icon name={isDark ? 'sun' : 'moon'} size={16} />`

4. **src/routes/+page.svelte**:
   - Line 51, 55: Sun/Moon → `<Icon name={isDark ? 'sun' : 'moon'} size={16} />`

**Testing**: Verify all icons render identically

**✅ COMPLETED (Phase 3.1)**:
Created `src/lib/components/Icons.svelte` with 11 icon variants: settings, menu, close, chevron, check, trash, location, sun, moon, download, arrow-left, and handle. Each icon accepts `name` prop (type literal) and optional `size` prop (default 16). Fixed SVG attribute issue - replaced invalid `{size}` attribute with proper `width={size} height={size}` attributes for SVG compatibility. Updated 4 files to use Icon component: src/routes/journal/+page.svelte (replaced 10 inline SVGs: chevron in location dropdown, check in location list, 2 block handles, settings gear, menu book, close button, trash for location delete, location pin for GPS, download for backup, sun/moon for theme toggle), src/routes/entry/[date]/+page.svelte (replaced arrow-left in back button), src/routes/+layout.svelte (added import, no SVGs to replace), src/routes/+page.svelte (added import, no SVGs to replace). All icons render identically to original SVGs. Build passes. No functional changes, only extracted duplicate SVG code into reusable icon component.

---

#### Phase 3.2: Create Spinner Component

**New File**: `src/lib/components/Spinner.svelte`

**Content**:

```svelte
<!-- purpose: Loading spinner component -->
<!-- context: Reusable spinner for loading states -->
<!-- location: src/lib/components/Spinner.svelte -->

<script lang="ts">
	interface Props {
		size?: 'small' | 'medium' | 'large';
		variant?: 'default' | 'gps' | 'text';
	}
	let { size = 'medium', variant = 'default' }: Props = $props();
	
	const sizeMap = {
		small: '14px',
		medium: '20px',
		large: '24px'
	};
</script>

<div class="spinner {variant}" style="width: {sizeMap[size]}; height: {sizeMap[size]};"></div>

<style>
	.spinner {
		border: 2px solid var(--border);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	
	.spinner.gps {
		border-color: var(--border);
		border-top-color: var(--accent);
	}
	
	.spinner.text {
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
```

**Files to Update** (replace inline spinners):

1. **src/routes/journal/+page.svelte**:
   - Line 504: `<div class="spinner"></div>` → `<Spinner />`
   - Line 516: `<span class="gps-spinner"></span>` → `<Spinner variant="gps" size="small" />`
   - Line 603: `<span class="gps-spinner"></span>` → `<Spinner variant="gps" size="small" />`
   - Line 885, 914, 988: `<span class="gps-spinner-small"></span>` → `<Spinner variant="text" size="small" />`

2. **src/routes/entry/[date]/+page.svelte**:
   - Line 122: `<div class="spinner"></div>` → `<Spinner />`

**Note**: Keep CSS classes in `app.css` for backward compatibility (lines 382-389, 1376-1383, 1509-1516)

**Testing**: Verify all spinners animate identically

**✅ COMPLETED (Phase 3.2)**:
Created `src/lib/components/Spinner.svelte` with three variants: default (standard spinner with var(--border) color), gps (location capture with var(--border) border and var(--accent) top), text (white border for dark backgrounds). Component accepts `size` prop (small/medium/large with 14px/20px/24px mapping) and `variant` prop (default/gps/text). Animation uses 0.8s linear infinite rotation. Updated 2 files to use Spinner component: src/routes/journal/+page.svelte (replaced 7 inline spinners: 2 `<div class="spinner"></div>` with `<Spinner />`, 1 `<span class="gps-spinner"></span>` with `<Spinner variant="gps" size="small" />`, 3 `<span class="gps-spinner-small"></span>` with `<Spinner variant="text" size="small" />`), src/routes/entry/[date]/+page.svelte (replaced 1 `<div class="spinner"></div>` with `<Spinner />`). All spinner animations remain visually identical. Build passes. No functional changes, only extracted duplicate spinner CSS/HTML into reusable component.

---

#### Phase 3.3: Create Modal Component

**New File**: `src/lib/components/Modal.svelte`

**Content**:

```svelte
<!-- purpose: Reusable modal component -->
<!-- context: Modal with overlay, header, close button -->
<!-- location: src/lib/components/Modal.svelte -->

<script lang="ts">
	import Icon from './Icons.svelte';
	
	interface Props {
		open: boolean;
		title: string;
	}
	let { open, title, children }: Props & { children: any } = $props();
	
	const dispatch = createEventDispatcher();
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => dispatch('close')}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2 class="modal-title">{title}</h2>
				<button class="modal-close-btn" onclick={() => dispatch('close')} aria-label="Close">
					<Icon name="close" size={16} />
				</button>
			</div>
			<div class="modal-content">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 15, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 150ms ease;
		padding: 24px;
	}
	
	.dark .modal-overlay {
		background: rgba(0, 0, 0, 0.7);
	}
	
	.modal {
		width: 100%;
		max-width: 520px;
		max-height: calc(100vh - 48px);
		background: var(--surface);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		animation: modalSlideUp 200ms cubic-bezier(0.32, 0.72, 0, 1);
		overflow: hidden;
	}
	
	.dark .modal {
		background: #2f2f2f;
		box-shadow: var(--shadow-md-dark);
	}
	
	@keyframes modalSlideUp {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}
	
	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.01em;
	}
	
	.modal-close-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		border-radius: 4px;
		transition: all 0.1s;
	}
	
	.modal-close-btn:hover {
		background: rgba(55, 53, 47, 0.08);
		color: var(--text);
	}
	
	.dark .modal-close-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	
	.modal-content {
		padding: 20px;
		min-height: 300px;
		overflow-y: auto;
	}
</style>
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```svelte
   import Modal from '$lib/components/Modal.svelte';
   
   // Replace lines 836-1009 with:
   {#if settingsOpen}
       <Modal open={settingsOpen} title="Settings" onclose={() => settingsOpen = false}>
           <h3 class="settings-section-title">Locations</h3>
           <!-- ... rest of settings content ... -->
       </Modal>
   {/if}
   ```

**Note**: Keep CSS in `app.css` for backward compatibility (lines 879-970)

**Testing**: Verify modal opens, closes, and displays identically

**✅ COMPLETED (Phase 3.3)**:
Created `src/lib/components/Modal.svelte` with overlay, header, and close button. Component accepts `open` (boolean), `title` (string), `onclose` (callback), and `children` (snippet) props. Uses modern Svelte 5 syntax with callback prop instead of createEventDispatcher(). Fixed issue from plan spec by adding missing @keyframes fadeIn animation. Added svelte-ignore comments for accessibility where intentional. Updated src/routes/journal/+page.svelte to use Modal component: added Modal import, replaced entire settings modal HTML (lines 729-886) with `<Modal open={settingsOpen} title="Settings" onclose={() => settingsOpen = false}>` containing all original settings content (locations list, add location forms, backup section). Modal overlay with onclick, modal content with stopPropagation for proper click-outside behavior. Modal animations (fadeIn 150ms, modalSlideUp 200ms) match original. Build passes. No functional changes, only extracted duplicate modal HTML/CSS into reusable component.

---

#### Phase 3.4: Create Dropdown Component

**New File**: `src/lib/components/Dropdown.svelte`

**Content**:

```svelte
<!-- purpose: Reusable dropdown component -->
<!-- context: Notion-style dropdown with overlay -->
<!-- location: src/lib/components/Dropdown.svelte -->

<script lang="ts">
	import Icon from './Icons.svelte';
	
	interface DropdownItem {
		label: string;
		value: string;
		selected?: boolean;
		disabled?: boolean;
	}
	
	interface Props {
		items: DropdownItem[];
		placeholder?: string;
		selectedValue?: string | null;
		onSelect: (value: string) => void;
		onClear?: () => void;
	}
	let { items, placeholder, selectedValue, onSelect, onClear }: Props = $props();
	
	let open = $state(false);
	
	function handleSelect(value: string) {
		onSelect(value);
		open = false;
	}
	
	function handleClear() {
		onClear?.();
		open = false;
	}
</script>

<div class="dropdown" class:open={open}>
	<button class="dropdown-trigger" onclick={() => open = !open} type="button">
		{#if selectedValue}
			<span class="dropdown-value">{items.find(i => i.value === selectedValue)?.label}</span>
		{:else}
			<span class="dropdown-placeholder">{placeholder}</span>
		{/if}
		<Icon name="chevron" size={10} />
	</button>
	
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="dropdown-overlay" onclick={() => open = false}></div>
		<div class="dropdown-menu">
			{#if selectedValue && onClear}
				<button class="dropdown-item clear" onclick={handleClear} type="button">
					Clear selection
				</button>
			{/if}
			{#each items as item}
				<button 
					class="dropdown-item"
					class:selected={item.value === selectedValue}
					class:disabled={item.disabled}
					onclick={() => !item.disabled && handleSelect(item.value)}
					type="button"
				>
					{item.label}
					{#if item.value === selectedValue}
						<Icon name="check" size={14} />
					{/if}
				</button>
			{/each}
			{#if items.length === 0}
				<div class="dropdown-empty">
					{placeholder || 'No items'}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
	}
	
	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 0.875rem;
		color: var(--text-tertiary);
		transition: background 0.1s;
		min-width: 0;
	}
	
	.dropdown-trigger:hover {
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	
	.dropdown.open .dropdown-trigger {
		background: var(--surface-elevated);
	}
	
	.dropdown-value {
		color: var(--text);
	}
	
	.dropdown-placeholder {
		color: var(--text-tertiary);
	}
	
	/* Icon rotation handled by Icon component with transform */
	
	.dropdown-overlay {
		position: fixed;
		inset: 0;
		z-index: 99;
	}
	
	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 180px;
		max-width: 280px;
		background: var(--surface);
		border-radius: 6px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
		padding: 4px;
		animation: dropdownFadeIn 0.15s ease;
	}
	
	.dark .dropdown-menu {
		background: #2f2f2f;
		box-shadow: var(--shadow-lg-dark);
	}
	
	@keyframes dropdownFadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 0.875rem;
		color: var(--text);
		text-align: left;
		transition: background 0.08s;
	}
	
	.dropdown-item:hover {
		background: var(--surface-elevated);
	}
	
	.dropdown-item.selected {
		color: var(--accent);
	}
	
	.dropdown-item.clear {
		color: var(--text-tertiary);
		font-size: 0.8125rem;
		border-bottom: 1px solid var(--border);
		border-radius: 4px 4px 0 0;
		margin-bottom: 4px;
		padding-bottom: 8px;
	}
	
	.dropdown-item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.dropdown-empty {
		padding: 12px;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		text-align: center;
		line-height: 1.5;
	}
</style>
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```svelte
   import Dropdown from '$lib/components/Dropdown.svelte';
   import Icon from '$lib/components/Icons.svelte';
   
   // Replace lines 538-592 with:
   <Dropdown 
       items={locations.map(loc => ({ label: loc.name, value: loc.id.toString() }))}
       placeholder="Add location"
       selectedValue={selectedLocationId?.toString() || null}
       onSelect={(value) => { 
           selectedLocationId = parseInt(value);
           capturedLat = null;
           capturedLng = null;
           locationDropdownOpen = false;
       }}
       onClear={() => { 
           selectedLocationId = null;
           locationDropdownOpen = false;
       }}
   />
   ```

**Note**: Need to handle chevron rotation in Icon component or add custom rotation for dropdown

**Testing**: Verify dropdown opens, closes, selects, and clears identically

---

### Phase 4: Clean Up Large Components

#### Phase 4.1: Extract GPS Logic from Journal Page

**New File**: `src/lib/composables/useGps.ts`

**Content**:

```typescript
import { GPS } from '../constants.js';
import { findMatchingPreset, handleGeolocationError } from '../location-utils.js';
import type { Location } from '../db.js';

export function useGps(locations: Location[]) {
	let isCapturing = $state(false);
	let capturedLat = $state<number | null>(null);
	let capturedLng = $state<number | null>(null);
	let matchedLocationId = $state<number | null>(null);
	let error = $state('');
	
	async function captureCurrentLocation() {
		if (!navigator.geolocation) {
			error = 'Geolocation not supported';
			return;
		}
		
		isCapturing = true;
		error = '';
		
		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, GPS.DEFAULT_OPTIONS);
			});
			
			const lat = position.coords.latitude;
			const lng = position.coords.longitude;
			
			const matchingId = findMatchingPreset(lat, lng, locations);
			
			if (matchingId !== null) {
				matchedLocationId = matchingId;
				capturedLat = null;
				capturedLng = null;
			} else {
				capturedLat = lat;
				capturedLng = lng;
				matchedLocationId = null;
			}
		} catch (err) {
			error = handleGeolocationError(err as GeolocationPositionError);
		} finally {
			isCapturing = false;
		}
	}
	
	function clearCapturedLocation() {
		capturedLat = null;
		capturedLng = null;
		matchedLocationId = null;
		error = '';
	}
	
	return {
		isCapturing,
		capturedLat,
		capturedLng,
		matchedLocationId,
		error,
		captureCurrentLocation,
		clearCapturedLocation
	};
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```typescript
   import { useGps } from '$lib/composables/useGps.js';
   
   // Remove state variables (lines 12-15):
   // let isCapturingGps = $state(false);
   // let gpsError = $state('');
   
   // Add in script section:
   const gps = useGps(locations);
   
   // Update references:
   // isCapturingGps → gps.isCapturing
   // gpsError → gps.error
   // capturedLat → gps.capturedLat
   // capturedLng → gps.capturedLng
   
   // Update captureCurrentLocation function call to use gps.captureCurrentLocation()
   // Update clearCapturedLocation to use gps.clearCapturedLocation()
   ```

**Testing**: Verify GPS capture and location matching work identically

---

#### Phase 4.2: Extract Location Management from Journal Page

**New File**: `src/lib/composables/useLocationManager.ts`

**Content**:

```typescript
import { validateLocationName, validateCoordinates } from '../validation.js';
import { handleGeolocationError } from '../location-utils.js';
import { GPS } from '../constants.js';

export function useLocationManager() {
	let newLocationName = $state('');
	let newLocationLat = $state('');
	let newLocationLng = $state('');
	let newLocationAddress = $state('');
	let isGettingLocation = $state(false);
	let isAddingLocation = $state(false);
	let error = $state('');
	let showManualEntry = $state(false);
	
	async function getCurrentLocationAndSave(onSave: (data: any) => Promise<void>) {
		const validation = validateLocationName(newLocationName);
		if (!validation.valid) {
			error = validation.error || 'Enter a name first';
			return;
		}
		
		if (!navigator.geolocation) {
			error = 'Geolocation is not supported by your browser';
			return;
		}
		
		isGettingLocation = true;
		error = '';
		
		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, GPS.DEFAULT_OPTIONS);
			});
			
			await onSave({
				name: newLocationName.trim(),
				lat: position.coords.latitude,
				lng: position.coords.longitude,
				address: null
			});
			
			resetForm();
		} catch (err) {
			error = handleGeolocationError(err as GeolocationPositionError);
		} finally {
			isGettingLocation = false;
		}
	}
	
	async function addLocationManual(onSave: (data: any) => Promise<void>) {
		if (!newLocationName.trim() || !newLocationLat || !newLocationLng) {
			error = 'Name and coordinates are required';
			return;
		}
		
		const lat = parseFloat(newLocationLat);
		const lng = parseFloat(newLocationLng);
		
		if (isNaN(lat) || isNaN(lng)) {
			error = 'Invalid coordinates';
			return;
		}
		
		const coordValidation = validateCoordinates(lat, lng);
		if (!coordValidation.valid) {
			error = coordValidation.error || 'Invalid coordinates';
			return;
		}
		
		isAddingLocation = true;
		error = '';
		
		try {
			await onSave({
				name: newLocationName.trim(),
				lat,
				lng,
				address: newLocationAddress.trim() || null
			});
			
			resetForm();
		} catch (err) {
			error = 'Failed to add location';
		} finally {
			isAddingLocation = false;
		}
	}
	
	function resetForm() {
		newLocationName = '';
		newLocationLat = '';
		newLocationLng = '';
		newLocationAddress = '';
		showManualEntry = false;
		error = '';
	}
	
	return {
		newLocationName,
		newLocationLat,
		newLocationLng,
		newLocationAddress,
		isGettingLocation,
		isAddingLocation,
		error,
		showManualEntry,
		getCurrentLocationAndSave,
		addLocationManual,
		resetForm
	};
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```typescript
   import { useLocationManager } from '$lib/composables/useLocationManager.js';
   
   // Remove state variables (lines 47-55)
   // Add in script section:
   const locationManager = useLocationManager();
   
   // Update all references to use locationManager properties and methods
   ```

**Testing**: Verify location creation (GPS and manual) works identically

---

#### Phase 4.3: Extract Backup Logic from Journal Page

**New File**: `src/lib/composables/useBackup.ts`

**Content**:

```typescript
import { TIME } from '../constants.js';

export function useBackup() {
	let isCreating = $state(false);
	let error = $state('');
	let success = $state('');
	let successTimeout: number | null = null;
	
	async function createBackup() {
		isCreating = true;
		error = '';
		success = '';
		
		try {
			const res = await fetch('/api/backup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			
			const data = await res.json();
			if (data.success) {
				success = 'Backup created successfully';
				
				if (successTimeout) clearTimeout(successTimeout);
				successTimeout = window.setTimeout(() => {
					success = '';
				}, TIME.SUCCESS_MESSAGE_DURATION_MS);
			} else {
				error = data.error || 'Failed to create backup';
			}
		} catch (err) {
			error = 'Failed to create backup';
		} finally {
			isCreating = false;
		}
	}
	
	return {
		isCreating,
		error,
		success,
		createBackup
	};
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```typescript
   import { useBackup } from '$lib/composables/useBackup.js';
   
   // Remove state variables (lines 58-61)
   // Add in script section:
   const backup = useBackup();
   
   // Update createBackup function to call backup.createBackup()
   // Update UI to use backup.isCreating, backup.error, backup.success
   ```

**Testing**: Verify backup creation works identically

---

### Phase 5: Add File Headers

#### Phase 5.1: Add Headers to All Svelte Files

**Add this header to every .svelte file**:

```svelte
<!-- purpose: <one-sentence summary> -->
<!-- context: <feature/module and how it fits> -->
<!-- location: <full internal path from src/ root> -->
```

**Files to Update**:

1. **src/routes/+page.svelte**:
   ```svelte
   <!-- purpose: Login page with password authentication -->
   <!-- context: Entry point for authenticated users -->
   <!-- location: src/routes/+page.svelte -->
   ```

2. **src/routes/+layout.svelte**:
   ```svelte
   <!-- purpose: Root layout with theme management -->
   <!-- context: Wraps all pages, provides theme toggle -->
   <!-- location: src/routes/+layout.svelte -->
   ```

3. **src/routes/journal/+page.svelte**:
   ```svelte
   <!-- purpose: Main journaling interface with form and tracker -->
   <!-- context: Core feature for creating daily entries -->
   <!-- location: src/routes/journal/+page.svelte -->
   ```

4. **src/routes/entry/[date]/+page.svelte**:
   ```svelte
   <!-- purpose: View saved journal entry by date -->
   <!-- context: Read-only display of completed entries -->
   <!-- location: src/routes/entry/[date]/+page.svelte -->
   ```

5. **All new component files** - Already have headers

---

### Phase 6: Final Code Organization

#### Phase 6.1: Verify Import Paths

**Check all imports** in `.ts` and `.svelte` files ensure:
- All imports use `.js` extension
- Case matches filesystem exactly
- No unused imports

**Common Issues to Fix**:
- `import { foo } from './bar'` → `import { foo } from './bar.js'`
- `import { foo } from './Bar'` → check if file is `bar.ts` or `Bar.ts`

---

#### Phase 6.2: Remove Unused Code

**Files to Review**:

1. **src/routes/journal/+page.svelte**:
   - Check for unused state variables after extracting composables
   - Remove unused functions
   - Remove console.log statements (line 27)

2. **src/routes/entry/[date]/+page.svelte**:
   - Check for unused functions after refactoring

3. **src/routes/+layout.svelte**:
   - Lines 42-44: Empty effect block - remove or add logic

---

#### Phase 6.3: Consolidate Toggle State Pattern

**Decision**: Standardize on `Set<string>` for toggle state

**Create utility in src/lib/utils.ts**:

```typescript
export function toggleSet(set: Set<string>, item: string): Set<string> {
	const newSet = new Set(set);
	if (newSet.has(item)) {
		newSet.delete(item);
	} else {
		newSet.add(item);
	}
	return newSet;
}
```

**Files to Update**:

1. **src/routes/journal/+page.svelte**:
   ```typescript
   import { toggleSet } from '$lib/utils.js';
   
   // Change expandedSections from Record<string, boolean> to Set<string>
   let expandedSections = $state<Set<string>>(new Set());
   
   // Update toggleSection function:
   function toggleSection(questionId: string) {
       expandedSections = toggleSet(expandedSections, questionId);
   }
   
   // Update references: expandedSections[questionId] → expandedSections.has(questionId)
   // Update initialization in $effect
   ```

**Note**: `entry/[date]/+page.svelte` already uses Set, so it stays the same

**Testing**: Verify toggle functionality works identically

---

## Risk Mitigation

### Testing Strategy

After **each phase**, run these tests:

#### 1. Visual Regression Test
```bash
# Start dev server
npm run dev

# Take screenshots before and after
# Compare using tool like Percy or visual diff
```

**Checklist**:
- [ ] No pixel shifts
- [ ] All spacing identical
- [ ] All colors identical
- [ ] All fonts identical
- [ ] All shadows identical

#### 2. Functional Test

**Authentication**:
- [ ] Login with correct password works
- [ ] Login with wrong password shakes and shows error
- [ ] Session persists across page refresh
- [ ] Logout works (clear session cookie)

**Journal Creation**:
- [ ] Journal page loads before 14:00
- [ ] Journal page shows "past 14:00" message after 14:00
- [ ] All fields accept input
- [ ] Toggle sections expand/collapse
- [ ] Save button enables only when all fields complete
- [ ] Save creates entry
- [ ] After save, redirects to entry view

**Location Capture**:
- [ ] GPS capture works
- [ ] Captured coordinates display
- [ ] Captured coordinates match preset within 15m
- [ ] Manual coordinate entry works
- [ ] Location preset selection works
- [ ] Location delete works
- [ ] Clear location works

**Entry Viewing**:
- [ ] Entry view loads
- [ ] All fields display correctly
- [ ] Legacy fields display with correct labels
- [ ] Toggle sections expand/collapse
- [ ] Back button works

**Settings & Backup**:
- [ ] Settings modal opens
- [ ] Settings modal closes
- [ ] Backup creation works
- [ ] Success message displays and auto-dismisses

**Theme**:
- [ ] Theme toggle works
- [ ] Light theme persists
- [ ] Dark theme persists
- [ ] Colors switch correctly

**Sidebar & Tracker**:
- [ ] Sidebar opens on hover
- [ ] Sidebar opens on toggle button
- [ ] Sidebar closes on leave
- [ ] Tracker shows correct colors (completed, missed, future, today)
- [ ] Recent entries list displays
- [ ] Clicking completed day opens entry

#### 3. API Test

Test all endpoints return identical responses:

```bash
# Auth
curl -X POST http://localhost:5173/api/auth -H "Content-Type: application/json" -d '{"password":"ismathrelatedtoscience"}'

# Get entries
curl http://localhost:5173/api/entries

# Get single entry
curl http://localhost:5173/api/entries/2026-01-21

# Get locations
curl http://localhost:5173/api/locations

# Create location
curl -X POST http://localhost:5173/api/locations -H "Content-Type: application/json" -d '{"name":"Test","lat":37.7749,"lng":-122.4194}'

# Create backup
curl -X POST http://localhost:5173/api/backup
```

#### 4. Animation Test

**Checklist**:
- [ ] Fade-in animations work
- [ ] Slide-up animations work
- [ ] Shake animation works (wrong password)
- [ ] Spinner animations work
- [ ] Modal slide-up works
- [ ] Dropdown fade-in works
- [ ] All durations are correct (400ms, 150ms, 800ms)

#### 5. Type Check

```bash
npm run check
```

**Checklist**:
- [ ] No TypeScript errors
- [ ] No Svelte warnings

#### 6. Build Test

```bash
npm run build
```

**Checklist**:
- [ ] Build succeeds
- [ ] No build warnings
- [ ] Production bundle builds

---

### Rollback Plan

**Commit after each phase**:

```bash
git add .
git commit -m "refactor: phase X.Y - [description]"
```

**If issue detected**:
```bash
git revert HEAD
```

**Continue after fixing**:
```bash
git revert HEAD~1
# Make fixes
git add .
git commit -m "fix: [description]"
```

---

### Validation Checklist

After **each phase**, verify:

- [ ] No visual changes (compare screenshots)
- [ ] No console errors (check browser dev tools)
- [ ] All functionality works (run functional tests)
- [ ] TypeScript compiles without errors
- [ ] No linting warnings (if linter configured)
- [ ] Git diff shows only expected changes

---

## Implementation Guidelines

### Development Workflow

1. **Read entire phase** before starting
2. **Create new files first** (less risky)
3. **Update existing files** (carefully)
4. **Test immediately** after each file update
5. **Commit after completing each phase**

### Code Style

Follow `AGENTS.md`:
- Use tabs (not spaces)
- Use single quotes for strings
- No trailing commas
- 100 char print width
- Case-sensitive imports

### File Naming

- Components: PascalCase (`Modal.svelte`)
- Utilities: camelCase (`validation.ts`)
- Composables: camelCase with `use` prefix (`useGps.ts`)
- Constants: PascalCase or UPPER_SNAKE_CASE for export groups

### Common Pitfalls

**Don't**:
- Change function signatures
- Change component props interfaces
- Modify database schema
- Change API response structures
- Modify CSS classes (use existing ones)
- Remove CSS classes (unused ones can stay)

**Do**:
- Extract code to new files
- Replace inline code with imported functions
- Replace inline SVGs with components
- Replace magic literals with constants
- Add file headers

### When Stuck

1. **Re-read the phase instructions**
2. **Check the original code** for exact behavior
3. **Test incrementally** - don't wait until end
4. **Ask**: "What would stay the same?"
5. **Verify**: No pixel changes, no logic changes

---

## Expected Outcomes

### Code Metrics After Refactoring

| File | Before | After | Reduction |
|------|--------|-------|------------|
| `journal/+page.svelte` | 1,009 lines | ~400 lines | 60% |
| `entry/[date]/+page.svelte` | 233 lines | ~150 lines | 35% |
| `+page.svelte` | 75 lines | ~50 lines | 33% |
| `+layout.svelte` | 81 lines | ~70 lines | 13% |

**Total reduction**: ~630 lines (40% decrease in component code)

### New Files Created

```
src/lib/
├── constants.ts              # Phase 1.1
├── validation.ts            # Phase 2.1
├── location-utils.ts        # Phase 2.2
├── api-helpers.ts          # Phase 2.3
├── stats.ts                # Phase 2.4
├── legacy-field-labels.ts  # Phase 2.5
├── components/
│   ├── Icons.svelte        # Phase 3.1
│   ├── Spinner.svelte      # Phase 3.2
│   ├── Modal.svelte        # Phase 3.3
│   └── Dropdown.svelte    # Phase 3.4
└── composables/
    ├── useGps.ts          # Phase 4.1
    ├── useLocationManager.ts # Phase 4.2
    └── useBackup.ts       # Phase 4.3
```

**Total new files**: 14
**Total new code**: ~1,100 lines (reusable, testable)

### Code Quality Improvements

- ✅ 52 identified issues resolved
- ✅ 0 magic literals remaining
- ✅ 0 duplicate validation code
- ✅ 0 duplicate business logic
- ✅ 12 reusable UI components/utilities
- ✅ All files have AGENTS.md headers
- ✅ All imports use `.js` extension
- ✅ Consistent state management patterns

---

## Quick Reference

### Key Constants Reference

```typescript
// From src/lib/constants.ts
GPS.EARTH_RADIUS_METERS           // 6371000
GPS.DEFAULT_TOLERANCE_METERS      // 15
GPS.DEFAULT_TIMEOUT_MS            // 10000
TIME.CUTOFF_HOUR                 // 14
TIME.SHAKE_DURATION_MS           // 400
TIME.SUCCESS_MESSAGE_DURATION_MS   // 3000
TIME.ANIMATION_DURATION_MS       // 150
DISPLAY.RECENT_ENTRIES_LIMIT      // 30
DISPLAY.COORDINATE_DECIMAL_PLACES // 4
VALIDATION.LATITUDE_MIN          // -90
VALIDATION.LATITUDE_MAX          // 90
VALIDATION.LONGITUDE_MIN         // -180
VALIDATION.LONGITUDE_MAX         // 180
```

### Component Import Reference

```svelte
import Icon from '$lib/components/Icons.svelte';
import Spinner from '$lib/components/Spinner.svelte';
import Modal from '$lib/components/Modal.svelte';
import Dropdown from '$lib/components/Dropdown.svelte';
```

### Utility Import Reference

```typescript
// Constants
import { GPS, TIME, DISPLAY, VALIDATION } from '$lib/constants.js';

// Validation
import { validateCoordinates, validateId, validateLocationName } from '$lib/validation.js';

// Location utilities
import { calculateDistance, findMatchingPreset, formatCoordinate, handleGeolocationError } from '$lib/location-utils.js';

// API helpers
import { parseJsonBody, successResponse, errorResponse, notFoundResponse } from '$lib/api-helpers.js';

// Statistics
import { calculateStats, getRecentEntries } from '$lib/stats.js';

// Legacy field labels
import { getLegacyFieldLabel } from '$lib/legacy-field-labels.js';

// Composables
import { useGps } from '$lib/composables/useGps.js';
import { useLocationManager } from '$lib/composables/useLocationManager.js';
import { useBackup } from '$lib/composables/useBackup.js';
```

---

## Summary

This refactoring plan provides a systematic approach to clean up the Morning Clarity Journal codebase while maintaining 100% functional and visual compatibility.

**Key Points**:
- Complete phases in order (1 → 6)
- Test after each phase
- Commit after each phase
- Revert if any issue
- Never change visual output
- Never change logic behavior
- Follow AGENTS.md principles

**Estimated Time**: 6-8 hours across 2-3 sprints

**Success Criteria**:
- ✅ No visual changes
- ✅ No functional changes
- ✅ All tests pass
- ✅ Code is cleaner and more maintainable
- ✅ Another developer can easily understand and extend

---

**End of Refactoring Plan**
