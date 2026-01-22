# Morning Clarity Journal - Refactoring Implementation Guide

**Objective:** Clean up codebase following AGENTS.md principles without ANY visual, functional, or behavioral changes. Every pixel, animation, and interaction must remain identical.

**Codebase:** SvelteKit 2.49 + Svelte 5 + TypeScript + SQLite personal journaling app

---

## AGENTS.md Principles (Reference)

```
- feature-first: group by feature, not type
- dry: no duplicate logic/literals/structures
- single source of truth: never duplicate/derive state; compute it
- no magic literals: extract repeated values to constants
- lean pages: +page.svelte handles routing/composition only; logic in hooks/services
- one responsibility per file: split ui into components/subcomponents
- keep SvelteKit views dumb: UI should never know your business logic
- no cross-pollution: don't put big computations or business rules inside .svelte files
```

**Mandatory file headers for every Svelte file:**
```svelte
<!-- purpose: <one-sentence summary> -->
<!-- context: <feature/module and how it fits> -->
<!-- location: <full internal path> -->
```

---

## PHASE 1: File Headers (Zero Risk)

Add headers to the top of each file (before any code).

### Svelte Files

**`src/routes/+page.svelte`** - Add at line 1:
```svelte
<!-- purpose: Password authentication gate for the journal application -->
<!-- context: Entry point; validates password before granting access to journal -->
<!-- location: src/routes/+page.svelte -->
```

**`src/routes/+layout.svelte`** - Add at line 1:
```svelte
<!-- purpose: Root layout providing theme toggle and app shell -->
<!-- context: Wraps all pages; manages dark/light theme state -->
<!-- location: src/routes/+layout.svelte -->
```

**`src/routes/journal/+page.svelte`** - Add at line 1:
```svelte
<!-- purpose: Main journaling interface with form, sidebar, and settings -->
<!-- context: Core feature; handles daily journal entry creation -->
<!-- location: src/routes/journal/+page.svelte -->
```

**`src/routes/entry/[date]/+page.svelte`** - Add at line 1:
```svelte
<!-- purpose: Read-only view of a journal entry by date -->
<!-- context: Entry viewing; displays decrypted journal content -->
<!-- location: src/routes/entry/[date]/+page.svelte -->
```

### API Server Files

Use JSDoc-style comments for TypeScript files:

**`src/routes/api/auth/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Password validation and session creation endpoint
 * @context Authentication; POST validates password, creates session cookie
 * @location src/routes/api/auth/+server.ts
 */
```

**`src/routes/api/entries/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Journal entries CRUD - list all and create new
 * @context Entries API; GET returns entries list, POST creates encrypted entry
 * @location src/routes/api/entries/+server.ts
 */
```

**`src/routes/api/entries/[date]/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Retrieve single journal entry by date
 * @context Entries API; GET returns decrypted entry data
 * @location src/routes/api/entries/[date]/+server.ts
 */
```

**`src/routes/api/locations/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Location presets CRUD - list and create
 * @context Locations API; GET returns presets, POST adds new location
 * @location src/routes/api/locations/+server.ts
 */
```

**`src/routes/api/locations/[id]/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Delete location preset by ID
 * @context Locations API; DELETE removes a location preset
 * @location src/routes/api/locations/[id]/+server.ts
 */
```

**`src/routes/api/backup/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Database backup operations - list and create
 * @context Backup API; GET lists/downloads backups, POST creates backup
 * @location src/routes/api/backup/+server.ts
 */
```

**`src/routes/api/seed-test/+server.ts`** - Add at line 1:
```typescript
/**
 * @purpose Create test entry for development
 * @context Development only; POST creates sample journal entry
 * @location src/routes/api/seed-test/+server.ts
 */
```

---

## PHASE 2: Constants Extraction

### Step 2.1: Create new file `src/lib/constants.ts`

```typescript
/**
 * @purpose Centralized application constants
 * @context Shared across all modules for consistent values
 * @location src/lib/constants.ts
 */

// Authentication
export const PASSWORD = 'ismathrelatedtoscience';

// Session
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Time
export const CUTOFF_HOUR = 14; // 2pm cutoff for morning journaling

// Geolocation
export const GPS_MATCH_TOLERANCE_METERS = 15;
export const GPS_TIMEOUT_MS = 10000;
export const EARTH_RADIUS_METERS = 6371000;

// Coordinate validation bounds
export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LNG_MIN = -180;
export const LNG_MAX = 180;
```

### Step 2.2: Update `src/lib/db.ts`

**Remove line 80:**
```typescript
// DELETE THIS LINE:
const PASSWORD = 'ismathrelatedtoscience';
```

**Add import at top (after line 4):**
```typescript
import { PASSWORD } from './constants.js';
```

### Step 2.3: Update `src/lib/auth.ts`

**Remove lines 6 and 57:**
```typescript
// DELETE LINE 6:
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// DELETE LINE 57:
const EXPECTED_PASSWORD = 'ismathrelatedtoscience';
```

**Add import at top (after line 1):**
```typescript
import { PASSWORD, SESSION_DURATION_MS } from './constants.js';
```

**Update line 63 (verifyPassword function):**
```typescript
export function verifyPassword(input: string): boolean {
	return input === PASSWORD;  // Changed from EXPECTED_PASSWORD
}
```

### Step 2.4: Update `src/lib/utils.ts`

**Add import at top:**
```typescript
import { CUTOFF_HOUR } from './constants.js';
```

**Update line 43 (isPastCutoff function):**
```typescript
// BEFORE:
export function isPastCutoff(date: Date = new Date()): boolean {
	return date.getHours() >= 14;
}

// AFTER:
export function isPastCutoff(date: Date = new Date()): boolean {
	return date.getHours() >= CUTOFF_HOUR;
}
```

---

## PHASE 3: Remove Duplicate Code

### Step 3.1: Remove duplicate `verifyPassword` from db.ts

**Delete lines 107-112 from `src/lib/db.ts`:**
```typescript
// DELETE THESE LINES:
/**
 * Verify password
 */
export function verifyPassword(input: string): boolean {
	return input === PASSWORD;
}
```

Note: This function is not used anywhere in db.ts. The only place `PASSWORD` is used in db.ts is in `getEncryptionKey()` for key derivation.

### Step 3.2: Remove unused `hashPassword` from auth.ts

**Delete lines 49-54 from `src/lib/auth.ts`:**
```typescript
// DELETE THESE LINES:
/**
 * Hash password for comparison (simple comparison for single user)
 */
export function hashPassword(password: string): string {
	return createHash('sha256').update(password).digest('hex');
}
```

**Also remove `createHash` from the import on line 1:**
```typescript
// BEFORE:
import { randomBytes, createHash } from 'crypto';

// AFTER:
import { randomBytes } from 'crypto';
```

### Step 3.3: Add coordinate validators to `src/lib/utils.ts`

**Add at the end of the file:**
```typescript
/**
 * Validate latitude value
 */
export function isValidLatitude(lat: number): boolean {
	return typeof lat === 'number' && !isNaN(lat) && lat >= LAT_MIN && lat <= LAT_MAX;
}

/**
 * Validate longitude value
 */
export function isValidLongitude(lng: number): boolean {
	return typeof lng === 'number' && !isNaN(lng) && lng >= LNG_MIN && lng <= LNG_MAX;
}

/**
 * Validate coordinate pair
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
	return isValidLatitude(lat) && isValidLongitude(lng);
}
```

**Update the import to include coordinate constants:**
```typescript
import { CUTOFF_HOUR, LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX } from './constants.js';
```

### Step 3.4: Add helper function to db.ts

**Add after line 4 (imports section):**
```typescript
/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dir: string): void {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}
```

**Update `getDb()` function (lines 16-19):**
```typescript
// BEFORE:
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

// AFTER:
ensureDirectoryExists(DATA_DIR);
```

**Update `createBackup()` function (lines 332-335):**
```typescript
// BEFORE:
const backupDir = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(backupDir)) {
	fs.mkdirSync(backupDir, { recursive: true });
}

// AFTER:
const backupDir = path.join(DATA_DIR, 'backups');
ensureDirectoryExists(backupDir);
```

### Step 3.5: Consolidate time formatting in utils.ts

**Add helper function near the top of `src/lib/utils.ts` (after imports):**
```typescript
/**
 * Pad a number to 2 digits with leading zero
 */
function padTwo(n: number): string {
	return n.toString().padStart(2, '0');
}
```

**Update `formatDateTime()` function (around line 5):**
```typescript
// BEFORE:
const hours = date.getHours().toString().padStart(2, '0');
const minutes = date.getMinutes().toString().padStart(2, '0');
const seconds = date.getSeconds().toString().padStart(2, '0');

// AFTER:
const hours = padTwo(date.getHours());
const minutes = padTwo(date.getMinutes());
const seconds = padTwo(date.getSeconds());
```

**Update `getDateTimeParts()` function (around line 122):**
```typescript
// BEFORE:
const hours = date.getHours().toString().padStart(2, '0');
const minutes = date.getMinutes().toString().padStart(2, '0');
const seconds = date.getSeconds().toString().padStart(2, '0');

// AFTER:
const hours = padTwo(date.getHours());
const minutes = padTwo(date.getMinutes());
const seconds = padTwo(date.getSeconds());
```

---

## PHASE 4: Extract Services

### Step 4.1: Create `src/lib/services/location.service.ts`

```typescript
/**
 * @purpose Location-related business logic including distance calculations
 * @context Used by journal page for GPS matching and location management
 * @location src/lib/services/location.service.ts
 */

import { EARTH_RADIUS_METERS, GPS_MATCH_TOLERANCE_METERS } from '$lib/constants.js';
import type { Location } from '$lib/db.js';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_METERS * c;
}

/**
 * Find a preset location that matches the given coordinates within tolerance
 * @returns Location ID if match found, null otherwise
 */
export function findMatchingPresetLocation(
	lat: number,
	lng: number,
	locations: Location[]
): number | null {
	for (const loc of locations) {
		const distance = calculateDistanceMeters(lat, lng, loc.lat, loc.lng);
		if (distance <= GPS_MATCH_TOLERANCE_METERS) {
			return loc.id;
		}
	}
	return null;
}
```

### Step 4.2: Create `src/lib/services/stats.service.ts`

```typescript
/**
 * @purpose Statistics and date tracking computations
 * @context Used for displaying completion statistics in sidebar
 * @location src/lib/services/stats.service.ts
 */

import { isDateInPast, isToday } from '$lib/utils.js';
import type { Entry } from '$lib/db.js';

/**
 * Calculate year completion statistics
 */
export function calculateYearStats(
	yearDates: string[],
	entryDates: string[]
): { completedCount: number; total: number } {
	const pastDates = yearDates.filter((d) => isDateInPast(d));
	const completedCount = pastDates.filter((d) => entryDates.includes(d)).length;
	return { completedCount, total: pastDates.length };
}

/**
 * Get recent entries for sidebar display
 */
export function getRecentEntries(
	yearDates: string[],
	entryDates: string[],
	entries: Entry[],
	limit: number = 30
): Array<{ date: string; completed: boolean; entry?: Entry }> {
	return yearDates
		.filter((d) => isDateInPast(d) || isToday(d))
		.map((d) => ({
			date: d,
			completed: entryDates.includes(d),
			entry: entries.find((e) => e.date === d)
		}))
		.reverse()
		.slice(0, limit);
}
```

### Step 4.3: Create `src/lib/services/index.ts`

```typescript
export * from './location.service.js';
export * from './stats.service.js';
```

### Step 4.4: Update `src/routes/journal/+page.svelte`

**Add import (after existing imports around line 7):**
```typescript
import { calculateDistanceMeters, findMatchingPresetLocation } from '$lib/services/location.service.js';
import { calculateYearStats, getRecentEntries } from '$lib/services/stats.service.js';
```

**Remove the local `calculateDistance` function (lines 170-182):**
```typescript
// DELETE THESE LINES (the function definition)
// Helper function to calculate distance between two coordinates using Haversine formula
// Returns distance in meters
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000; // Earth's radius in meters
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) * Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}
```

**Remove the local `findMatchingPreset` function (lines 184-195):**
```typescript
// DELETE THESE LINES (the function definition)
// Helper function to check if coordinates match a preset location
// Tolerance: 15 meters (reasonable for GPS accuracy)
function findMatchingPreset(lat: number, lng: number): number | null {
	const toleranceMeters = 15; // 15 meters tolerance
	for (const loc of locations) {
		const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
		if (distance <= toleranceMeters) {
			return loc.id;
		}
	}
	return null;
}
```

**Update usages of removed functions:**

In `captureCurrentLocation()` (around line 213), change:
```typescript
// BEFORE:
const matchingPresetId = findMatchingPreset(lat, lng);

// AFTER:
const matchingPresetId = findMatchingPresetLocation(lat, lng, locations);
```

**Update `getStats` function (around line 300):**
```typescript
// BEFORE:
function getStats() {
	const pastDates = yearDates.filter(d => isDateInPast(d));
	const completedCount = pastDates.filter(d => entryDates.includes(d)).length;
	const total = pastDates.length;
	return { completedCount, total };
}

// AFTER:
function getStats() {
	return calculateYearStats(yearDates, entryDates);
}
```

**Update `getPastDates` function (around line 307):**
```typescript
// BEFORE:
function getPastDates(): { date: string; completed: boolean; entry?: Entry }[] {
	return yearDates
		.filter(d => isDateInPast(d) || isToday(d))
		.map(d => ({
			date: d,
			completed: entryDates.includes(d),
			entry: entries.find(e => e.date === d)
		}))
		.reverse()
		.slice(0, 30);
}

// AFTER:
function getPastDates() {
	return getRecentEntries(yearDates, entryDates, entries, 30);
}
```

### Step 4.5: Move `getTimestampParts` to utils.ts

**Add to `src/lib/utils.ts` (at end of file):**
```typescript
/**
 * Parse timestamp string into time and date parts for display
 */
export function parseTimestampParts(timestamp: string): { time: string; rest: string } {
	const parts = timestamp.split(' ');
	const time = parts[0]?.split(':').slice(0, 2).join(':') || '';
	const rest = parts.slice(1).join(' ');
	return { time, rest };
}
```

**Update `src/routes/entry/[date]/+page.svelte`:**

Add to imports:
```typescript
import { parseTimestampParts } from '$lib/utils.js';
```

Remove local function (lines 107-114):
```typescript
// DELETE THESE LINES:
// Parse timestamp parts for display
function getTimestampParts(timestamp: string) {
	// Format: "HH:MM:SS day month, year" or similar
	const parts = timestamp.split(' ');
	const time = parts[0]?.split(':').slice(0, 2).join(':') || '';
	const rest = parts.slice(1).join(' ');
	return { time, rest };
}
```

Update usage (find all `getTimestampParts` calls and change to `parseTimestampParts`).

### Step 4.6: Move legacy field functions to template.ts

**Add to `src/lib/template.ts` (at end of file):**
```typescript
/**
 * Legacy field labels for backward compatibility with old entries
 */
const legacyFieldLabels: Record<string, string> = {
	whyAvoiding: 'Why am I avoiding it?',
	realFear: 'The real fear is',
	howLikely: 'How likely is this fear to happen?',
	howBad10Days: 'How bad would it be in 10 days?',
	howBad10Months: 'How bad would it be in 10 months?',
	howBad10Years: 'How bad would it be in 10 years?',
	evidenceFearNotTrue: 'Evidence the fear is not true',
	kimTest: 'Kim Test - Would Kim be proud?',
	whatDoILose: 'What do I lose by not acting?',
	upsideIfAct: 'What is the upside if I act?',
	whatConsumeInsteadProduce: 'What will I consume instead of produce?',
	egoWillTell: 'What will ego tell me?',
	exactDistraction: 'The exact distraction',
	triggerTimeSituation: 'Trigger time/situation',
	temptedWhenWillBecause: 'I will be tempted when/will/because',
	wasteToday: 'What would make today a waste?',
	track: 'What should I track?',
	trapRule: 'My trap rule'
};

/**
 * Check if entry has legacy fields not in current template
 */
export function hasLegacyContent(entryData: Record<string, string>): boolean {
	const currentFieldIds = new Set(getCurrentFieldIds());
	return Object.entries(entryData).some(
		([key, value]) => value && !currentFieldIds.has(key)
	);
}

/**
 * Get display label for a legacy field
 */
export function getLegacyFieldLabel(fieldId: string): string {
	return legacyFieldLabels[fieldId] || fieldId;
}
```

**Update `src/routes/entry/[date]/+page.svelte`:**

Add to imports:
```typescript
import { hasLegacyContent, getLegacyFieldLabel, getCurrentFieldIds } from '$lib/template.js';
```

Remove local functions (lines 71-105):
```typescript
// DELETE the local hasLegacyContent function
// DELETE the local getLegacyFieldLabel function
// DELETE the local legacyFieldLabels object
```

---

## PHASE 5: Component Extraction

**CRITICAL:** When extracting components, ensure all styles remain working. The styles are in `src/app.css` and use class names - do NOT modify any class names or style rules.

### Step 5.1: Create `src/routes/journal/components/LocationDropdown.svelte`

Extract from `journal/+page.svelte` lines 538-592. This is the custom Notion-style dropdown.

```svelte
<!-- purpose: Custom location selection dropdown -->
<!-- context: Journal form; allows selecting preset location or showing GPS coords -->
<!-- location: src/routes/journal/components/LocationDropdown.svelte -->
<script lang="ts">
	import type { Location } from '$lib/db.js';

	interface Props {
		locations: Location[];
		selectedLocationId: number | null;
		capturedLat: number | null;
		capturedLng: number | null;
		isOpen: boolean;
		onSelect: (id: number | null) => void;
		onToggle: () => void;
		onClose: () => void;
	}

	let { locations, selectedLocationId, capturedLat, capturedLng, isOpen, onSelect, onToggle, onClose }: Props = $props();

	function getSelectedLocationName(): string {
		if (selectedLocationId) {
			const loc = locations.find((l) => l.id === selectedLocationId);
			return loc?.name || 'Select location';
		}
		if (capturedLat !== null && capturedLng !== null) {
			return `📍 ${capturedLat.toFixed(6)}, ${capturedLng.toFixed(6)}`;
		}
		return 'Select location';
	}

	function handleSelect(id: number | null) {
		onSelect(id);
		onClose();
	}
</script>

<!-- Copy the exact HTML from lines 538-592 of journal/+page.svelte -->
<!-- Preserve all class names exactly as they are -->
```

### Step 5.2: Create `src/routes/journal/components/EntrySidebar.svelte`

Extract from `journal/+page.svelte` lines 732-808. This is the sidebar with year tracker.

```svelte
<!-- purpose: Sidebar with year tracker and recent entries -->
<!-- context: Journal page; shows completion status and entry history -->
<!-- location: src/routes/journal/components/EntrySidebar.svelte -->
<script lang="ts">
	import type { Entry } from '$lib/db.js';
	import { formatDateForSidebar, extractTimeFromTimestamp } from '$lib/utils.js';
	import { calculateYearStats, getRecentEntries } from '$lib/services/stats.service.js';

	interface Props {
		isOpen: boolean;
		settingsOpen: boolean;
		year: number;
		yearDates: string[];
		entryDates: string[];
		entries: Entry[];
		onOpenSettings: () => void;
		onClose: () => void;
	}

	let { isOpen, settingsOpen, year, yearDates, entryDates, entries, onOpenSettings, onClose }: Props = $props();

	function getStats() {
		return calculateYearStats(yearDates, entryDates);
	}

	function getPastDates() {
		return getRecentEntries(yearDates, entryDates, entries, 30);
	}

	// ... rest of helper functions used in the sidebar
</script>

<!-- Copy the exact HTML from lines 732-808 of journal/+page.svelte -->
<!-- Preserve all class names exactly as they are -->
```

### Step 5.3: Create `src/routes/journal/components/SettingsModal.svelte`

Extract from `journal/+page.svelte` lines 835-1009. This is the settings modal.

```svelte
<!-- purpose: Settings modal with location management and backup -->
<!-- context: Journal page; manages location presets and database backups -->
<!-- location: src/routes/journal/components/SettingsModal.svelte -->
<script lang="ts">
	import type { Location } from '$lib/db.js';

	interface Props {
		isOpen: boolean;
		locations: Location[];
		onClose: () => void;
		onAddLocation: (name: string, lat: number, lng: number, address?: string) => Promise<boolean>;
		onDeleteLocation: (id: number) => Promise<boolean>;
		onCreateBackup: () => Promise<boolean>;
		onGetCurrentLocation: () => Promise<{ lat: number; lng: number } | null>;
	}

	let { isOpen, locations, onClose, onAddLocation, onDeleteLocation, onCreateBackup, onGetCurrentLocation }: Props = $props();

	// Local state for form
	let newLocationName = $state('');
	let newLocationLat = $state('');
	let newLocationLng = $state('');
	let newLocationAddress = $state('');
	let isGettingLocation = $state(false);
	let locationError = $state('');
	let isAddingLocation = $state(false);
	let isDeletingLocation = $state<number | null>(null);
	let showManualEntry = $state(false);
	let isCreatingBackup = $state(false);
	let backupError = $state('');
	let backupSuccess = $state('');

	// ... implement the form handlers, calling the prop functions
</script>

<!-- Copy the exact HTML from lines 835-1009 of journal/+page.svelte -->
<!-- Preserve all class names exactly as they are -->
```

### Step 5.4: Update `src/routes/journal/+page.svelte`

After creating the components, update the main page to use them:

```svelte
<script lang="ts">
	// ... existing imports ...
	import LocationDropdown from './components/LocationDropdown.svelte';
	import EntrySidebar from './components/EntrySidebar.svelte';
	import SettingsModal from './components/SettingsModal.svelte';
	// ... rest of script ...
</script>

<!-- Replace the inline markup with component usage -->
<!-- Example for LocationDropdown: -->
<LocationDropdown
	{locations}
	{selectedLocationId}
	{capturedLat}
	{capturedLng}
	isOpen={locationDropdownOpen}
	onSelect={(id) => { selectedLocationId = id; capturedLat = null; capturedLng = null; }}
	onToggle={() => locationDropdownOpen = !locationDropdownOpen}
	onClose={() => locationDropdownOpen = false}
/>
```

---

## PHASE 6: API Response Standardization

### Step 6.1: Create `src/lib/api/responses.ts`

```typescript
/**
 * @purpose Standardized API response helpers
 * @context Used by all API routes for consistent response format
 * @location src/lib/api/responses.ts
 */

import { json } from '@sveltejs/kit';

export function successResponse<T extends Record<string, unknown>>(data?: T, status = 200) {
	return json({ success: true, ...data }, { status });
}

export function errorResponse(error: string, status = 400) {
	return json({ success: false, error }, { status });
}

export function notFoundResponse(message = 'Not found') {
	return json({ success: false, error: message }, { status: 404 });
}

export function unauthorizedResponse(message = 'Unauthorized') {
	return json({ success: false, error: message }, { status: 401 });
}

export function serverErrorResponse(message = 'Internal server error') {
	return json({ success: false, error: message }, { status: 500 });
}

export function parseIdParam(idString: string): number | null {
	const id = parseInt(idString, 10);
	return isNaN(id) ? null : id;
}
```

### Step 6.2: Update `src/routes/api/entries/[date]/+server.ts`

**Current (line 8-10):**
```typescript
if (!entry) {
	throw error(404, 'Entry not found');
}
```

**Change to:**
```typescript
import { notFoundResponse } from '$lib/api/responses.js';

// ...

if (!entry) {
	return notFoundResponse('Entry not found');
}
```

### Step 6.3: Add try-catch to JSON parsing

**In `src/routes/api/locations/+server.ts`**, wrap the JSON parsing:

```typescript
// BEFORE:
const { name, lat, lng, address } = await request.json();

// AFTER:
let payload;
try {
	payload = await request.json();
} catch {
	return errorResponse('Invalid JSON payload');
}
const { name, lat, lng, address } = payload;
```

---

## PHASE 7: Theme Consolidation

### Current Problem
- `+layout.svelte` uses `isDark` state and toggles `light` class
- `journal/+page.svelte` uses separate `isDarkMode` state and toggles `dark` class
- These are inconsistent implementations

### Step 7.1: Create `src/lib/services/theme.service.ts`

```typescript
/**
 * @purpose Centralized theme management
 * @context Used across application for consistent theme handling
 * @location src/lib/services/theme.service.ts
 */

export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
	if (typeof localStorage === 'undefined') return 'dark';
	const stored = localStorage.getItem('theme');
	return stored === 'light' ? 'light' : 'dark';
}

export function setStoredTheme(theme: Theme): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem('theme', theme);
}

export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	if (theme === 'light') {
		document.documentElement.classList.add('light');
		document.documentElement.classList.remove('dark');
	} else {
		document.documentElement.classList.remove('light');
		document.documentElement.classList.add('dark');
	}
}

export function toggleTheme(): Theme {
	const current = getStoredTheme();
	const next: Theme = current === 'light' ? 'dark' : 'light';
	setStoredTheme(next);
	applyTheme(next);
	return next;
}

export function initializeTheme(): Theme {
	const theme = getStoredTheme();
	applyTheme(theme);
	return theme;
}
```

### Step 7.2: Update `src/lib/services/index.ts`

```typescript
export * from './location.service.js';
export * from './stats.service.js';
export * from './theme.service.js';
```

### Step 7.3: Update `src/routes/+layout.svelte`

Replace theme logic with service calls. Keep the toggle button in the same position.

### Step 7.4: Update `src/routes/journal/+page.svelte`

Remove the duplicate theme logic (around line 64 `isDarkMode` and the `toggleTheme` function). Keep only the `ritual` class application in `onMount`.

---

## Verification Checklist

Run after EACH phase:
- [ ] `npm run build` passes
- [ ] `npm run dev` starts without errors
- [ ] No console errors in browser

Final verification:
- [ ] Login with password `ismathrelatedtoscience` works
- [ ] Wrong password shows error with shake animation
- [ ] Journal page loads (before 2pm shows form, after shows cutoff message)
- [ ] All 6 question sections expand/collapse correctly
- [ ] Text input works in all contenteditable fields
- [ ] Progress pill shows correct count (e.g., "3/18")
- [ ] GPS capture button works and shows coordinates
- [ ] GPS within 15m of preset auto-selects that preset
- [ ] Location dropdown opens/closes and selects correctly
- [ ] Sidebar opens on hover, closes on mouse leave
- [ ] Year tracker grid shows correct colors (green/red/gray)
- [ ] Stats show correct completed/total count
- [ ] Recent entries list shows last 30 days
- [ ] Clicking recent entry navigates to `/entry/{date}`
- [ ] Settings modal opens from sidebar
- [ ] Add location via "Use Current Location" works
- [ ] Add location manually works
- [ ] Delete location works
- [ ] Create backup works
- [ ] Theme toggle switches between light/dark
- [ ] Theme persists after page refresh
- [ ] Entry view page displays all content correctly
- [ ] Entry view handles legacy fields (shows them in separate section)
- [ ] Back button navigates correctly

---

## File Change Summary

### New Files (9)
1. `src/lib/constants.ts`
2. `src/lib/services/index.ts`
3. `src/lib/services/location.service.ts`
4. `src/lib/services/stats.service.ts`
5. `src/lib/services/theme.service.ts`
6. `src/lib/api/responses.ts`
7. `src/routes/journal/components/LocationDropdown.svelte`
8. `src/routes/journal/components/EntrySidebar.svelte`
9. `src/routes/journal/components/SettingsModal.svelte`

### Modified Files (15)
1. `src/lib/db.ts`
2. `src/lib/auth.ts`
3. `src/lib/utils.ts`
4. `src/lib/template.ts`
5. `src/routes/+page.svelte`
6. `src/routes/+layout.svelte`
7. `src/routes/journal/+page.svelte`
8. `src/routes/entry/[date]/+page.svelte`
9. `src/routes/api/auth/+server.ts`
10. `src/routes/api/entries/+server.ts`
11. `src/routes/api/entries/[date]/+server.ts`
12. `src/routes/api/locations/+server.ts`
13. `src/routes/api/locations/[id]/+server.ts`
14. `src/routes/api/backup/+server.ts`
15. `src/routes/api/seed-test/+server.ts`
