## Mobile Optimization Plan – Full App Responsive Pass

Goal: Make the entire app mobile-optimized across key breakpoints (<= 1024, <= 860, <= 600, <= 480), with safe-area handling, touch-friendly targets, and layouts that do not overflow on small screens. Preserve all existing behavior and visual language while improving usability on phones.

## IMPORTANT: Rules for the implementing agent

1. **Follow `morning-clarity-journal/AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.

Mobile optimization guardrails (apply to all steps below):
- Preserve existing functionality and data flow.
- Keep layout changes additive and reversible (prefer CSS over markup changes unless needed).
- Avoid introducing new fonts, colors, or themes.
- Maintain existing animation timing and transitions unless required for mobile usability.
- Ensure touch targets are at least 40px in the smallest breakpoint.
- Use safe-area insets for fixed-position UI on devices with notches.

---

## Mobile Optimization Targets (Priority Order)

| Area | Files | Primary Issues | Priority |
|------|-------|----------------|----------|
| Global layout + fixed UI | `src/app.css` | Missing safe-area handling, fixed elements overlap on small screens | 🔴 Critical |
| Journal header/actions | `src/lib/components/JournalForm.svelte`, `src/app.css` | Action row can overflow; dropdown/GPS controls cramped | 🔴 Critical |
| Sidebar behavior | `src/lib/components/JournalSidebar.svelte`, `src/app.css` | No mobile overlay close, hover-only edge trigger | 🔴 Critical |
| Modals + Settings UI | `src/lib/components/Modal.svelte`, `src/app.css`, settings components | Modal height/width on small screens, dense rows | 🟡 High |
| Login + session warning | `src/routes/+page.svelte`, `src/lib/components/ExistingSessionWarning.svelte` | Fixed brand mark overlaps safe areas, stacked actions | 🟡 High |
| Entry view + navigation | `src/routes/entry/[date]/+page.svelte`, `src/app.css` | Back button safe-area, header wrap | 🟡 High |
| Dropdown behavior | `src/lib/components/Dropdown.svelte` | Menu sizing and scrolling on narrow widths | 🟢 Medium |

---

### Step 1: Add Mobile Safe-Area Tokens and Base Layout Fixes

**Problem:** Fixed elements and full-height layouts do not account for mobile safe areas; 100vh can be unstable on mobile.

**Files to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**
1. Add safe-area CSS variables in `:root`:
   - `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` using `env(safe-area-inset-*)` with 0 fallback.
2. Update base layout rules for mobile viewport stability:
   - Add `min-height: 100dvh;` to `body`, `.notion-page`, and `.main-area` with `min-height: 100vh;` as fallback.
   - Ensure `.content` uses `padding-bottom` for safe area when scrolling (use `calc(var(--safe-bottom) + 0px)` so it is additive later).
3. Add a small global rule for reduced horizontal overflow on mobile:
   - `body { overflow-x: hidden; }`

**Guardrails:**
- Do not alter existing color tokens or typography.
- Keep layout changes limited to global CSS.

---

### Step 2: Safe-Area Positioning for Fixed Controls

**Problem:** Fixed controls (theme button, progress pill, back button, sidebar toggle) can overlap notches or the browser UI.

**Files to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**
1. Update `.theme-btn`, `.nav-btn.back`, `.progress-pill`, `.sidebar-toggle` positions to use safe-area insets:
   - Example: `bottom: calc(12px + var(--safe-bottom)); left: calc(12px + var(--safe-left));` (use right/top where appropriate).
2. Add a small-screen adjustment block for <= 480px:
   - Reduce `width/height` only if needed, but keep tap target >= 40px.
3. Ensure `.sidebar` uses `height: 100dvh` and `padding-bottom` based on safe area.

**Guardrails:**
- Keep z-index values unchanged unless overlap issues are found.

---

### Step 3: Journal Header and Action Row Reflow

**Problem:** The header action row can overflow on phones, especially with dropdown + GPS controls.

**Files to update:**
- `morning-clarity-journal/src/lib/components/JournalForm.svelte`
- `morning-clarity-journal/src/app.css`

**What to change:**
1. Add a wrapper class in `JournalForm.svelte` around the location controls to allow layout changes (e.g., `page-actions` already exists, add a `page-actions-group` div around dropdown + GPS button).
2. In `app.css`, add mobile rules for `.page-actions` and `.page-actions-group`:
   - <= 600px: set `flex-direction: column; align-items: stretch; width: 100%`.
   - Ensure dropdown + GPS button align on a single row if there is space, otherwise stack.
3. Add a global rule for dropdowns in the journal header:
   - `.page-actions .dropdown` should stretch to full width on mobile.

**Guardrails:**
- Do not change any data binding or event handlers.

---

### Step 4: Mobile Sidebar Overlay and Touch Behavior

**Problem:** Sidebar is hard to dismiss on touch devices and hover-only edge trigger is not usable.

**Files to update:**
- `morning-clarity-journal/src/lib/components/JournalSidebar.svelte`
- `morning-clarity-journal/src/app.css`

**What to change:**
1. In `JournalSidebar.svelte`, add a `div` overlay element that appears when `sidebarOpen` is true and calls `onCloseSidebar` on click.
2. Style the overlay in `app.css`:
   - Fixed, full-screen, semi-transparent background.
   - Display only on touch or small widths (e.g., `@media (max-width: 860px)` or `@media (hover: none)`).
3. Disable `.edge-trigger` on touch devices:
   - Add `@media (hover: none)` to set `.edge-trigger { display: none; }`.
4. Adjust `.sidebar` width for mobile:
   - <= 860px: `width: min(100%, 360px);`
   - <= 480px: `width: 100%; max-width: 100%;`

**Guardrails:**
- Keep desktop behavior unchanged (hover open/close should still work on non-touch devices).

---

### Step 5: Modal and Settings Layout for Mobile

**Problem:** Modal layouts feel cramped and can overflow vertically on small screens; settings rows have tight spacing.

**Files to update:**
- `morning-clarity-journal/src/lib/components/Modal.svelte`
- `morning-clarity-journal/src/app.css`

**What to change:**
1. Add a mobile breakpoint in `Modal.svelte` styles:
   - <= 600px: `.modal` uses `max-width: 100%`, `height: 100dvh`, `max-height: 100dvh`, `border-radius: 0`.
   - Reduce overlay padding to `12px` or `0` depending on fit.
2. Update `.settings-modal-extended` in `app.css` for mobile:
   - Match the modal full-screen rules when <= 600px.
   - Add safe-area padding to `.modal-header` and `.modal-content`.
3. Improve settings layouts for small screens:
   - `.sg-input-row`, `.sg-preset-row`, `.sg-confirm-row`, `.sg-action-row`, `.sg-preset-actions` should wrap or stack vertically on <= 480px.
   - `.sg-manual-grid` should switch to single-column on <= 480px.
   - Increase `.sr-row` min-height to 44px on <= 480px.

**Guardrails:**
- Preserve the Apple grouped-list look; do not alter colors or typography.

---

### Step 6: Dropdown Component Mobile Behavior

**Problem:** Dropdown menu can overflow viewport and lacks max-height on small screens.

**Files to update:**
- `morning-clarity-journal/src/lib/components/Dropdown.svelte`

**What to change:**
1. Add a mobile media query in the component `<style>`:
   - <= 600px: `.dropdown-trigger { width: 100%; justify-content: space-between; }`
   - `.dropdown-menu { left: 0; right: 0; width: 100%; max-width: none; max-height: 60vh; overflow-y: auto; }`
2. Keep desktop styles unchanged.

**Guardrails:**
- Do not change the open/close logic or event handling.

---

### Step 7: Login and Existing Session Warning Mobile Adjustments

**Problem:** Login screen brand mark and warning modal do not account for safe areas and can feel cramped.

**Files to update:**
- `morning-clarity-journal/src/routes/+page.svelte`
- `morning-clarity-journal/src/lib/components/ExistingSessionWarning.svelte`

**What to change:**
1. In `+page.svelte` styles:
   - Update `.brand-mark` to use safe-area offsets for `right` and `bottom`.
   - Add a small-screen media query to reduce font size and avoid overlap.
2. In `ExistingSessionWarning.svelte` styles:
   - <= 480px: set `.terminal-warning { max-width: 100%; }` and add `width: 100%`.
   - Stack `.terminal-actions` vertically with full-width buttons.

**Guardrails:**
- Keep the terminal visual style intact.

---

### Step 8: Entry View and Message Layout Tweaks

**Problem:** Entry header and back button can crowd on phones; meta text can wrap poorly.

**Files to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**
1. Add mobile rules for `.page-meta` and `.page-location`:
   - Allow wrapping with `flex-wrap: wrap; row-gap: 4px;` and `max-width: 100%`.
   - Add `word-break: break-word;` to `.page-location`.
2. Ensure `.nav-btn.back` uses safe-area offsets (if not already from Step 2).
3. Consider reducing `.page-header` top padding on <= 480px only if needed.

**Guardrails:**
- Do not change entry content structure or toggle logic.

---

### Step 9: Verification and Mobile QA Checklist

**Commands:**
- After each step: `npx svelte-check --threshold error`
- After all steps: `npm run build` then `npm run dev`

**Manual checks (mobile widths 375px and 428px):**
- Login screen input and brand mark fit; no overlap with safe area.
- Journal header actions wrap cleanly; dropdown and GPS button are reachable.
- Sidebar opens and closes via overlay tap; edge trigger does not block touch.
- Settings modal fits on screen; rows and buttons remain tappable.
- Dropdown menus scroll within viewport.
- Entry view back button is reachable and not hidden by browser UI.
- No horizontal scrolling on any page.

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)

Step 1: Added safe-area CSS variables, stable `100dvh` min-heights for core layout containers, safe-area padding on `.content`, and hid horizontal overflow on `body` in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 2: Updated fixed control positioning to use safe-area variables, set `.sidebar` to `100dvh` with safe-area padding, and ensured small-screen button sizing meets 40px targets in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 3: Wrapped location controls in a `.page-actions-group` in `morning-clarity-journal/src/lib/components/JournalForm.svelte` and added mobile layout rules for `.page-actions`/`.page-actions-group` plus full-width dropdown behavior in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 4: Added a clickable sidebar overlay in `morning-clarity-journal/src/lib/components/JournalSidebar.svelte`, styled it for touch/small screens, disabled the edge trigger on touch, and adjusted sidebar widths for mobile breakpoints in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 5: Added full-screen mobile modal styles in `morning-clarity-journal/src/lib/components/Modal.svelte` and adjusted settings modal, safe-area padding, and small-screen settings layout in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 6: Added mobile dropdown trigger and menu sizing rules in `morning-clarity-journal/src/lib/components/Dropdown.svelte` to prevent overflow and enable scrolling; ran `npx svelte-check --threshold error` (0 errors, 3 warnings).
Step 7: Adjusted login brand mark positioning to respect safe-area insets and reduced its size on small screens in `morning-clarity-journal/src/routes/+page.svelte`, plus stacked and widened session warning actions on mobile in `morning-clarity-journal/src/lib/components/ExistingSessionWarning.svelte`; ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 8: Allowed `.page-meta` to wrap and ensured `.page-location` can break on small screens in `morning-clarity-journal/src/app.css`; ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 9: Ran `npm run build` (success) and started `npm run dev` to verify it launches; dev server reported ready at `http://localhost:5173/` before the command timed out in this session.
