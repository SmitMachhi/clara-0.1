# Component Extraction Plan: journal/+page.svelte

## Goal

Split `src/routes/journal/+page.svelte` (currently ~725 lines) into components so the page file stays under 200 lines. The page should only handle routing, shared state, and composition — all UI blocks live in their own component files.

## Rules (from AGENTS.md)

- every svelte file needs a 3-line header: `<!-- purpose: ... -->`, `<!-- context: ... -->`, `<!-- location: ... -->`
- tabs, single quotes, no trailing commas
- no magic literals (use constants from `$lib/constants.js`)
- no floating promises (use `.catch()`)
- case-sensitive imports with `.js` extension
- no business logic in `.svelte` — fetch/API logic lives in `$lib/journal-actions.ts`

## Current File Structure

```
src/routes/journal/+page.svelte   (725 lines - THE FILE TO SPLIT)
src/lib/journal-actions.ts        (service layer - already exists, do not modify)
src/lib/components/               (existing shared components: Icons, Spinner, Modal, Dropdown)
```

## Components To Create

All new components go in `src/lib/components/`.

---

### 1. `src/lib/components/JournalForm.svelte` (~185 lines)

**Purpose**: The question/answer form with collapsible sections, contenteditable fields, and save button.

**Props** (passed in from page):
```ts
interface Props {
  formData: Record<string, string>
  locations: Location[]
  selectedLocationId: number | null
  capturedLat: number | null
  capturedLng: number | null
  isCapturingGps: boolean
  gpsError: string
  isSaving: boolean
  saveError: string
  dateParts: { time: string; dayOfWeekShort: string; monthShort: string; day: string }
  currentYear: number
  isComplete: boolean
  completedFields: number
  totalFields: number
  onSubmit: () => void
  onCaptureLocation: () => void
  onClearLocation: () => void
  onSelectLocation: (id: number) => void
  onClearSelectedLocation: () => void
}
```

**Internal state** (lives inside this component):
```ts
let expandedSections = $state<Set<string>>(new Set())
```

**Internal functions** (move from page into this component):
```ts
function toggleSection(questionId: string) { ... }
function handleInput(event: Event, fieldId: string) { ... }
function handlePaste(event: ClipboardEvent) { ... }
async function handleFieldFocus(questionId: string) { ... }
```

**Internal imports needed**:
```ts
import { tick } from 'svelte'
import { slide } from 'svelte/transition'
import { journalTemplate } from '$lib/template.js'
import { toggleSet } from '$lib/utils.js'
import { TIME } from '$lib/constants.js'
import { formatCoordinate } from '$lib/location-utils.js'
import Icon from '$lib/components/Icons.svelte'
import Spinner from '$lib/components/Spinner.svelte'
import Dropdown from '$lib/components/Dropdown.svelte'
```

**Template** — takes lines 352-485 from the current page (the `<div class="page-container">...</div>` block including page-header, page-content loop, and save-section). Also includes the `$effect` that initializes the first section as expanded.

---

### 2. `src/lib/components/JournalSidebar.svelte` (~100 lines)

**Purpose**: Year tracker grid, stats, recent entries list, edge trigger, and sidebar toggle button.

**Props**:
```ts
interface Props {
  entries: Entry[]
  entryDates: string[]
  yearDates: string[]
  currentYear: number
  sidebarOpen: boolean
  settingsOpen: boolean
  onToggleSidebar: () => void
  onCloseSidebar: () => void
  onOpenSidebar: () => void
  onOpenSettings: () => void
  onViewEntry: (date: string) => void
}
```

**Internal functions** (move from page into this component):
```ts
function getDayStatus(dateStr: string): 'completed' | 'missed' | 'future' | 'today' { ... }
```

**Internal imports needed**:
```ts
import { isToday, isDateInPast, extractTimeFromTimestamp } from '$lib/utils.js'
import { calculateStats, getRecentEntries } from '$lib/stats.js'
import Icon from '$lib/components/Icons.svelte'
```

**Template** — takes these pieces from the current page:
- The sidebar toggle button (lines 494-501)
- The `<aside class="sidebar">` block (lines 504-565)
- The edge trigger (lines 567-576)

---

### 3. `src/lib/components/SettingsModal.svelte` (~150 lines)

**Purpose**: Settings modal with location management (list, add via GPS, add manually) and database backup.

**Props**:
```ts
interface Props {
  open: boolean
  locations: Location[]
  onclose: () => void
  onLocationsChanged: () => void  // called after add/delete so page reloads locations
}
```

**Internal state** (move from page into this component):
```ts
let newLocationName = $state('')
let newLocationLat = $state('')
let newLocationLng = $state('')
let newLocationAddress = $state('')
let isGettingLocation = $state(false)
let locationError = $state('')
let isAddingLocation = $state(false)
let isDeletingLocation = $state<number | null>(null)
let showManualEntry = $state(false)
let isCreatingBackup = $state(false)
let backupError = $state('')
let backupSuccess = $state('')
```

**Internal functions** (move from page into this component):
```ts
function getCurrentLocationAndSave() { ... }
async function addLocationPreset() { ... }
async function deleteLocationPreset(id: number) { ... }
async function createBackup() { ... }
```

These functions already call `$lib/journal-actions.ts` service functions (`captureAndSaveLocation`, `addLocation`, `deleteLocation`, `requestBackup`). Move them as-is but replace `await loadLocations()` calls with `onLocationsChanged()` callback.

**Internal imports needed**:
```ts
import { TIME } from '$lib/constants.js'
import { formatCoordinate } from '$lib/location-utils.js'
import { captureAndSaveLocation, addLocation, deleteLocation, requestBackup } from '$lib/journal-actions.js'
import type { Location } from '$lib/db.js'
import Icon from '$lib/components/Icons.svelte'
import Spinner from '$lib/components/Spinner.svelte'
import Modal from '$lib/components/Modal.svelte'
```

**Template** — takes lines 588-724 from the current page (the settings modal block). Wrap it so the component renders the `<Modal>` itself.

---

## Final `+page.svelte` (~120-150 lines)

After extraction, the page file should contain:

**Imports**:
```ts
import { onMount } from 'svelte'
import { goto } from '$app/navigation'
import { getEmptyJournalData } from '$lib/template.js'
import { formatDateISO, isPastCutoff, getYearDates, getDateTimeParts } from '$lib/utils.js'
import type { Location, Entry } from '$lib/db.js'
import { TIME } from '$lib/constants.js'
import { fetchLocations, fetchEntries, submitEntry, captureGps } from '$lib/journal-actions.js'
import Spinner from '$lib/components/Spinner.svelte'
import JournalForm from '$lib/components/JournalForm.svelte'
import JournalSidebar from '$lib/components/JournalSidebar.svelte'
import SettingsModal from '$lib/components/SettingsModal.svelte'
```

**State** (only what's shared across components):
```ts
let formData = $state(getEmptyJournalData())
let locations = $state<Location[]>([])
let selectedLocationId = $state<number | null>(null)
let capturedLat = $state<number | null>(null)
let capturedLng = $state<number | null>(null)
let isCapturingGps = $state(false)
let gpsError = $state('')
let entries = $state<Entry[]>([])
let entryDates = $state<string[]>([])
let isSaving = $state(false)
let saveError = $state('')
let isPastTime = $state(false)
let hasEntryToday = $state(false)
let dateParts = $state(getDateTimeParts(new Date()))
let sidebarOpen = $state(false)
let settingsOpen = $state(false)
let isDarkMode = $state(false)
let isLoadingData = $state(true)
```

**Constants**:
```ts
const today = formatDateISO(new Date())
const currentYear = new Date().getFullYear()
const yearDates = getYearDates(currentYear)
```

**Derived**:
```ts
let completedFields = $derived(...)
let totalFields = $derived(...)
let isComplete = $derived(...)
```

**Functions remaining in page**:
```ts
onMount(...)            // timer + loadAllData
loadLocations()         // thin wrapper around fetchLocations
loadEntries()           // thin wrapper around fetchEntries
loadAllData()           // calls both
handleSubmit()          // calls submitEntry, then goto
captureCurrentLocation() // calls captureGps, sets state
clearCapturedLocation()  // resets lat/lng/error
toggleTheme()           // DOM class toggle
```

**Template** (composition only):
```svelte
<div class="notion-page">
  <div class="main-area">
    <main class="content">
      {#if isLoadingData}
        <Spinner />
      {:else if isPastTime && !hasEntryToday}
        <!-- past time message -->
      {:else if hasEntryToday}
        <Spinner />
      {:else}
        <JournalForm
          {formData} {locations} {selectedLocationId}
          {capturedLat} {capturedLng} {isCapturingGps} {gpsError}
          {isSaving} {saveError} {dateParts} {currentYear}
          isComplete={isComplete()} completedFields={completedFields()} totalFields={totalFields()}
          onSubmit={handleSubmit}
          onCaptureLocation={captureCurrentLocation}
          onClearLocation={clearCapturedLocation}
          onSelectLocation={(id) => { selectedLocationId = id; capturedLat = null; capturedLng = null; }}
          onClearSelectedLocation={() => { selectedLocationId = null; }}
        />
      {/if}
    </main>

    <!-- Progress pill -->
    <div class="progress-pill">...</div>
  </div>

  <JournalSidebar
    {entries} {entryDates} {yearDates} {currentYear}
    {sidebarOpen} {settingsOpen}
    onToggleSidebar={() => sidebarOpen = !sidebarOpen}
    onCloseSidebar={() => sidebarOpen = false}
    onOpenSidebar={() => sidebarOpen = true}
    onOpenSettings={() => settingsOpen = !settingsOpen}
    onViewEntry={(date) => goto(`/entry/${date}`)}
  />

  <!-- Theme toggle -->
  <button class="theme-btn" onclick={toggleTheme}>...</button>
</div>

<SettingsModal
  open={settingsOpen}
  {locations}
  onclose={() => settingsOpen = false}
  onLocationsChanged={loadLocations}
/>
```

---

## Step-by-step Execution Order

1. Create `src/lib/components/JournalForm.svelte` with its header, script, and template
2. Create `src/lib/components/JournalSidebar.svelte` with its header, script, and template
3. Create `src/lib/components/SettingsModal.svelte` with its header, script, and template
4. Rewrite `src/routes/journal/+page.svelte` to import and compose the three components
5. Remove any now-unused imports from the page
6. Run `npx vite build` — must pass with zero errors
7. Verify final page is under 200 lines

## Important Notes

- Do NOT modify `src/lib/journal-actions.ts` — it already has all the service functions
- Do NOT modify any existing components in `src/lib/components/` (Icons, Spinner, Modal, Dropdown)
- Do NOT modify any API routes
- The app uses Svelte 5 runes (`$state`, `$effect`, `$derived`, `$props`) — do NOT use Svelte 4 syntax
- Props in Svelte 5 use `let { prop1, prop2 }: Props = $props()` pattern
- CSS classes used in templates are defined in `src/app.css` (global) — do not duplicate or create component-scoped styles unless the class is only used in that component
- The `slide` transition import comes from `svelte/transition`
- All `type` imports must use the `type` keyword: `import type { Location } from '$lib/db.js'`
