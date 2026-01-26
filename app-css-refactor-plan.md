## CSS Refactoring Plan – `app.css` Cleanup and DRY Optimization

Goal: Refactor `morning-clarity-journal/src/app.css` to comply with `AGENTS.md` rules by eliminating duplicate code, consolidating redundant theme definitions, replacing magic literals with CSS variables, and organizing the file into logical sections. The file currently has 2,598 lines (13x over the 200-line soft limit) with significant duplication. This plan focuses on in-file cleanup without splitting into multiple files.

## IMPORTANT: Rules for the implementing agent

1. **Follow `morning-clarity-journal/AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run `npx svelte-check --threshold error` inside the `morning-clarity-journal` directory and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and all styles render correctly.
5. **Do NOT skip steps or combine steps.** Each step should keep the app visually identical.

CSS refactoring guardrails (apply to all steps below):
- Preserve all existing visual behavior exactly. The app should look identical before and after.
- Do not change any class names that are referenced in Svelte components.
- Do not introduce new CSS features or syntax that would require additional tooling.
- Test each change visually if possible; CSS changes can have subtle cascading effects.
- When removing duplicate code, always keep the version that appears first or is more complete.
- Add comments to mark major sections for maintainability.

---

## Refactoring Targets (Priority Order)

| Area | Lines Affected | Issue | Priority |
|------|----------------|-------|----------|
| Duplicate theme: `.ritual` = `:root` | Lines 142-183 (~40 lines) | Ritual theme is identical to base light/dark themes | 🔴 Critical |
| Duplicate spacing systems | Lines 12-21 + 64-71 (~18 lines) | Two naming conventions for same values | 🔴 Critical |
| Missing CSS variables for colors | ~15 occurrences | Hardcoded `rgb(35, 131, 226)` blue appears 5+ times | 🟡 High |
| Magic pixel literals | ~50 occurrences | Hardcoded padding/margin values not using variables | 🟡 High |
| Duplicate shadow values | Lines 104-109 vs 1244, 1250 | Shadow variables exist but inline values used | 🟡 High |
| Section organization | Entire file | Missing clear section markers, interleaved concerns | 🟢 Medium |
| Dead/redundant selectors | Various | Some rules may be overridden or unused | 🟢 Medium |

---

### Step 1: Remove Duplicate `.ritual` Theme Definitions

**Problem:** The `.ritual` theme (lines 142-161) is byte-for-byte identical to the base `:root` theme (lines 46-117), and `.ritual.dark` (lines 164-183) is identical to `:root.dark` (lines 120-139). This wastes ~40 lines and violates DRY.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Locate the `:root.ritual` block that starts around line 141-142 with the comment `/* Ritual theme (light mode default) - for journal writing */`. This block contains CSS custom property definitions like `--bg`, `--surface`, `--text`, etc.

2. Compare every property in `:root.ritual` with the corresponding property in the base `:root` block (starting around line 46). You will find they are identical:
   - `--bg: #FFFFFF;` appears in both
   - `--surface: #FFFFFF;` appears in both
   - `--text: rgb(55, 53, 47);` appears in both
   - `--accent: #e04545;` appears in both
   - All other properties match exactly

3. Delete the entire `:root.ritual` block (approximately lines 141-161), including its comment header. Keep only if there are ANY differences; based on analysis, there are none.

4. Locate the `:root.ritual.dark` block that starts around line 163-164 with the comment `/* Ritual dark mode */`. This block contains dark theme overrides.

5. Compare every property in `:root.ritual.dark` with the corresponding property in `:root.dark` (starting around line 119-120). You will find they are identical:
   - `--bg: #191919;` appears in both
   - `--surface: #202020;` appears in both
   - `--text: rgba(255, 255, 255, 0.9);` appears in both
   - All other properties match exactly

6. Delete the entire `:root.ritual.dark` block (approximately lines 163-183), including its comment header.

7. Add a comment above the `:root` block explaining that the `.ritual` class is handled by the base theme:
   ```css
   /* Light theme (default) - also used when .ritual class is present */
   ```

8. Add a similar comment above `:root.dark`:
   ```css
   /* Dark mode - also used when .ritual.dark classes are present */
   ```

**Expected result:** The file should be approximately 40 lines shorter. The app should look exactly the same because the `.ritual` class inherits from `:root` naturally via CSS cascade.

**Guardrails:**
- Before deleting, verify line-by-line that every property in `.ritual` matches `:root` exactly.
- If you find ANY property that differs, do NOT delete that block; instead document the difference in the Implementation Log.

---

### Step 2: Consolidate Duplicate Spacing Systems

**Problem:** Two separate spacing variable systems exist with the same values but different names. The `@theme` block (lines 11-21) defines `--spacing-1`, `--spacing-2`, etc. The `:root` block (lines 64-71) defines `--space-xs`, `--space-sm`, etc. These are the same values, violating DRY.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Locate the `@theme` block at the top of the file (starts around line 11). Find the spacing section that looks like:
   ```css
   /* Spacing scale (8px base unit) */
   --spacing-1: 0.25rem;  /* 4px */
   --spacing-2: 0.5rem;   /* 8px */
   --spacing-3: 0.75rem;  /* 12px */
   --spacing-4: 1rem;     /* 16px */
   --spacing-6: 1.5rem;   /* 24px */
   --spacing-8: 2rem;     /* 32px */
   --spacing-12: 3rem;    /* 48px */
   --spacing-16: 4rem;    /* 64px */
   --spacing-24: 6rem;    /* 96px */
   ```

2. Locate the duplicate spacing in `:root` (starts around line 64). Find:
   ```css
   /* Spacing tokens */
   --space-xs: 0.25rem;
   --space-sm: 0.5rem;
   --space-md: 1rem;
   --space-lg: 1.5rem;
   --space-xl: 2rem;
   --space-2xl: 3rem;
   --space-3xl: 4rem;
   ```

3. The `--space-*` variables in `:root` are the ones actually used throughout the file. Search the entire file for `--spacing-` usage:
   - If `--spacing-*` variables are NOT used anywhere in the file (outside their definition), delete them from `@theme`.
   - If `--spacing-*` variables ARE used somewhere, replace those usages with the equivalent `--space-*` variable, then delete the `--spacing-*` definitions.

4. Mapping for replacement if needed:
   | Remove (--spacing-*) | Replace with (--space-*) |
   |---------------------|--------------------------|
   | `--spacing-1` (0.25rem) | `--space-xs` |
   | `--spacing-2` (0.5rem) | `--space-sm` |
   | `--spacing-4` (1rem) | `--space-md` |
   | `--spacing-6` (1.5rem) | `--space-lg` |
   | `--spacing-8` (2rem) | `--space-xl` |
   | `--spacing-12` (3rem) | `--space-2xl` |
   | `--spacing-16` (4rem) | `--space-3xl` |

5. After removing duplicates, update the comment in `:root` to be more descriptive:
   ```css
   /* Spacing tokens (8px base unit) */
   ```

**Expected result:** Only one spacing system remains. File is approximately 10 lines shorter.

**Guardrails:**
- Search for each `--spacing-*` variable before deleting to ensure it is not used.
- If any `--spacing-*` variable is used by Tailwind or external tooling, keep it and document in the log.

---

### Step 3: Add Missing Color Variables for Repeated Values

**Problem:** The blue accent color `rgb(35, 131, 226)` appears hardcoded in at least 5 places instead of using a CSS variable. Other colors are also repeated.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Add new color variables to the `:root` block. Find the existing color variables section (around lines 46-59) and add these new variables after `--missed`:
   ```css
   /* Interactive blue (used for links, selection, active states) */
   --color-blue: rgb(35, 131, 226);
   --color-blue-hover: rgb(0, 117, 211);
   --color-blue-selection: rgba(35, 131, 226, 0.28);
   --color-blue-bg: rgba(35, 131, 226, 0.1);
   ```

2. Search the entire file for `rgb(35, 131, 226)` and replace each occurrence with `var(--color-blue)`. Expected locations include:
   - `::selection` background (around line 288): replace `rgba(35, 131, 226, 0.28)` with `var(--color-blue-selection)`
   - `.save-btn.ready` background (around line 768): replace `rgb(35, 131, 226)` with `var(--color-blue)`
   - `.progress-count` color (around line 807): replace `rgb(35, 131, 226)` with `var(--color-blue)`
   - `.tracker-day.today` background (around line 1095): replace `rgb(35, 131, 226)` with `var(--color-blue)`
   - `.captured-location` background (around line 1441): replace `rgba(35, 131, 226, 0.1)` with `var(--color-blue-bg)`

3. Search for `rgb(0, 117, 211)` and replace with `var(--color-blue-hover)`. Expected locations:
   - `.save-btn.ready:hover` (around line 775)
   - `.sg-btn-primary:hover` (around line 1803)
   - `.sg-gps-btn:hover` (around line 1911)

4. For dark mode, check if any of these blues need different values. If they do, add dark mode overrides in `:root.dark`:
   ```css
   /* Keep same blue in dark mode - it works well on dark backgrounds */
   ```
   (The blue color typically works well in both modes, so no override may be needed.)

**Expected result:** All hardcoded blue values now reference CSS variables. Future color changes require updating only one place.

**Guardrails:**
- After each replacement, the color should render identically.
- Be careful with `rgba()` values that include opacity - use the appropriate variable (`--color-blue-selection`, `--color-blue-bg`).

---

### Step 4: Replace Magic Pixel Literals with Variables (Layout Values)

**Problem:** Many hardcoded pixel values appear throughout the file that should use CSS variables for consistency and maintainability.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Add layout-specific variables to `:root`. Find the spacing tokens section and add after it:
   ```css
   /* Layout tokens */
   --page-max-width: 900px;
   --page-padding-desktop: 96px;
   --page-padding-tablet: 48px;
   --page-padding-mobile: 32px;
   --page-padding-small: 16px;
   --sidebar-width: 280px;
   --sidebar-width-mobile: 360px;
   --header-padding-top: 80px;
   --header-padding-bottom: 32px;
   ```

2. Find `.page-container` (around line 417-421) and update:
   ```css
   .page-container {
   	width: 100%;
   	max-width: var(--page-max-width);
   	padding: 0 var(--page-padding-desktop);
   }
   ```

3. Find `.page-header` (around line 424-429) and update:
   ```css
   .page-header {
   	display: flex;
   	justify-content: space-between;
   	align-items: center;
   	padding: var(--header-padding-top) 0 var(--header-padding-bottom);
   }
   ```

4. Find `.sidebar` (around line 889-903) and update the width:
   ```css
   .sidebar {
   	/* ... other properties ... */
   	width: var(--sidebar-width);
   	/* ... rest of properties ... */
   }
   ```

5. Update the responsive media queries to use variables where defined. Find the tablet breakpoint (around line 2404-2408):
   ```css
   @media (max-width: 1024px) {
   	.page-container {
   		padding: 0 var(--page-padding-tablet);
   	}
   }
   ```

6. Find the next breakpoint (around line 2411-2414):
   ```css
   @media (max-width: 860px) {
   	.page-container {
   		padding: 0 var(--page-padding-mobile);
   	}
   	/* ... */
   }
   ```

7. Find the mobile breakpoint for sidebar (around line 2440-2443) and update:
   ```css
   .sidebar {
   	width: min(100%, var(--sidebar-width-mobile));
   	max-width: var(--sidebar-width-mobile);
   }
   ```

8. Find the smallest breakpoint (around line 2517-2519):
   ```css
   @media (max-width: 480px) {
   	.page-container {
   		padding: 0 var(--page-padding-small);
   	}
   	/* ... */
   }
   ```

**Expected result:** Core layout values are now variables, making responsive adjustments easier to understand and modify.

**Guardrails:**
- Test at each breakpoint to ensure layout remains identical.
- Only replace values that are clearly layout-related; leave one-off values as-is.

---

### Step 5: Replace Inline Shadow Values with Variables

**Problem:** Shadow variables are defined (lines 104-109) but some places use inline shadow values that duplicate these definitions.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Verify the shadow variables exist in `:root` (around lines 103-109):
   ```css
   --shadow-sm: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px;
   --shadow-sm-dark: rgba(255, 255, 255, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 3px 6px;
   --shadow-md: ...;
   --shadow-md-dark: ...;
   --shadow-lg: ...;
   --shadow-lg-dark: ...;
   ```

2. Search for inline shadow values that match `--shadow-sm`. Find `.theme-btn` (around line 1244):
   ```css
   /* Before */
   box-shadow: rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px;

   /* After */
   box-shadow: var(--shadow-sm);
   ```

3. Find `.dark .theme-btn` (around line 1249-1251):
   ```css
   /* Before */
   box-shadow: rgba(255, 255, 255, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 3px 6px;

   /* After */
   box-shadow: var(--shadow-sm-dark);
   ```

4. Search for any other inline shadows that match the defined variables. Check:
   - `.nav-btn` (around line 829)
   - `.progress-pill` (around line 798)
   - `.settings-modal` (around line 984)
   - `.location-dropdown-menu` (around line 1349)
   - `.sg-info-tooltip` (around line 2110)
   - `.settings-modal-extended` (around line 1491)

5. For each match, replace the inline value with the appropriate variable (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, or their `-dark` variants).

6. If dark mode versions use different shadows, ensure `.dark` selectors use the `-dark` variants.

**Expected result:** All shadow values reference the defined CSS variables. Changing a shadow style updates everywhere automatically.

**Guardrails:**
- Only replace shadows that exactly match the variable values.
- Some shadows may be intentionally different - leave those as inline values.

---

### Step 6: Add Section Comments and Organize Structure

**Problem:** The file lacks clear section markers, making it hard to navigate 2500+ lines of CSS.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Add a file header comment at the very top (before `@import`):
   ```css
   /**
    * Morning Clarity Journal - Global Styles
    *
    * Sections:
    * 1. Tailwind Import
    * 2. Theme Variables (@theme + :root)
    * 3. Base Reset & Typography
    * 4. Form Elements (inputs, buttons, selects)
    * 5. Animations
    * 6. Page Layout (containers, headers)
    * 7. Content Blocks (toggles, fields)
    * 8. Sidebar & Navigation
    * 9. Modals & Overlays
    * 10. Components (tracker, dropdowns, settings)
    * 11. Responsive Breakpoints
    */
   ```

2. Add section divider comments before each major section. Use this format:
   ```css
   /* ==========================================================================
      SECTION NAME
      Brief description of what this section contains
      ========================================================================== */
   ```

3. Add section markers at these locations (approximate line numbers will shift as you edit):

   Before `@import 'tailwindcss';`:
   ```css
   /* ==========================================================================
      1. TAILWIND IMPORT
      ========================================================================== */
   ```

   Before `@theme {`:
   ```css
   /* ==========================================================================
      2. THEME VARIABLES
      Design tokens for colors, spacing, typography, shadows
      ========================================================================== */
   ```

   Before `* {` (base reset around line 185):
   ```css
   /* ==========================================================================
      3. BASE RESET & TYPOGRAPHY
      Box-sizing, scrollbars, selection, focus states
      ========================================================================== */
   ```

   Before `input, textarea, select {` (around line 244):
   ```css
   /* ==========================================================================
      4. FORM ELEMENTS
      Inputs, textareas, selects, buttons
      ========================================================================== */
   ```

   Before `@keyframes fadeIn` (around line 306):
   ```css
   /* ==========================================================================
      5. ANIMATIONS
      Keyframe definitions and animation utility classes
      ========================================================================== */
   ```

   Before `.notion-page {` (around line 353):
   ```css
   /* ==========================================================================
      6. PAGE LAYOUT
      Main containers, headers, content areas
      ========================================================================== */
   ```

   Before `.block {` (around line 523):
   ```css
   /* ==========================================================================
      7. CONTENT BLOCKS
      Toggles, fields, question markers
      ========================================================================== */
   ```

   Before `.sidebar-toggle {` (around line 852):
   ```css
   /* ==========================================================================
      8. SIDEBAR & NAVIGATION
      Sidebar panel, toggle buttons, navigation controls
      ========================================================================== */
   ```

   Before `.settings-overlay {` (around line 961):
   ```css
   /* ==========================================================================
      9. MODALS & OVERLAYS
      Settings modal, overlay backgrounds
      ========================================================================== */
   ```

   Before `.tracker-card {` (around line 1054):
   ```css
   /* ==========================================================================
      10. COMPONENTS
      Tracker, dropdowns, location picker, settings UI
      ========================================================================== */
   ```

   Before `@media (max-width: 1024px)` (around line 2404):
   ```css
   /* ==========================================================================
      11. RESPONSIVE BREAKPOINTS
      Tablet and mobile adaptations
      ========================================================================== */
   ```

4. Remove any existing section comments that are now redundant or inconsistent with the new system. The file has some `/* ======== */` comments already - standardize them all to the format above.

**Expected result:** The file has a clear table of contents and consistent section markers, making navigation much easier.

**Guardrails:**
- Do not change any actual CSS rules in this step, only comments.
- Ensure section markers are at logical boundaries.

---

### Step 7: Remove Clearly Redundant or Overridden Rules

**Problem:** Some CSS rules may be duplicated or immediately overridden, adding unnecessary bytes.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Search for duplicate selector definitions. If the same selector appears twice with the same properties, keep only one. Check for:
   - Any selector that appears more than once outside of media queries
   - Properties defined and then immediately overridden in the same block

2. Check the `@theme` block for any variables that are immediately overridden in `:root`. If a variable is defined in `@theme` and then redefined with the same value in `:root`, keep only the `:root` version (since `:root` is where most variables live).

3. Look for properties that have no effect:
   - `transition: all 0s;` or `transition: none;` followed by another transition
   - `display: block;` on elements that are block by default
   - `position: static;` (the default)

4. Check for vendor prefixes that are no longer needed in modern browsers:
   - `-webkit-font-smoothing` and `-moz-osx-font-smoothing` are still useful
   - But if there are `-webkit-` or `-moz-` prefixes for standard properties like `transform`, `transition`, `flex`, these are no longer needed

5. Document any rules you remove and why in the Implementation Log.

**Expected result:** File is cleaner with no obviously redundant rules.

**Guardrails:**
- Only remove rules you are confident are redundant.
- If unsure, leave the rule and note it in the log.
- Do not remove rules that might affect older browser support unless explicitly safe.

---

### Step 8: Final Cleanup and Line Count Verification

**Problem:** After all optimizations, verify the improvements and clean up any remaining issues.

**File to update:**
- `morning-clarity-journal/src/app.css`

**What to change:**

1. Run a final pass looking for:
   - Trailing whitespace on any line
   - Multiple consecutive blank lines (reduce to single blank line)
   - Inconsistent indentation (should be tabs per AGENTS.md)
   - Missing semicolons

2. Count the total lines in the file. The goal is significant reduction from 2,598 lines. Document the new line count.

3. Create a summary of all CSS variables now defined in `:root`. This should include:
   - Color variables (--bg, --surface, --text, --accent, --color-blue, etc.)
   - Spacing variables (--space-*)
   - Typography variables (--font-*, --text-*, --leading-*, --tracking-*)
   - Layout variables (--page-*, --sidebar-*, --header-*)
   - Shadow variables (--shadow-*)
   - Safe area variables (--safe-*)

4. Verify no important styles were accidentally removed by checking:
   - The login page renders correctly
   - The journal form renders with proper spacing
   - The sidebar opens and closes
   - The settings modal opens and displays all tabs
   - Dark mode toggle works
   - Responsive breakpoints function at 1024px, 860px, 600px, 480px widths

**Expected result:** A cleaner, well-organized CSS file with documented variables and clear sections.

**Guardrails:**
- This is a verification step - make minimal changes.
- If any visual regression is found, investigate and fix before completing.

---

### Step 9: Verification and Final QA

**Commands:**
- After each step: `npx svelte-check --threshold error`
- After all steps: `npm run build` then `npm run dev`

**Visual checks:**
1. **Login page:** Input field styling, brand mark position, error messages
2. **Journal page:** Header layout, date display, action buttons, dropdown menus
3. **Journal form:** Field labels, input areas, toggle sections, save button states
4. **Sidebar:** Open/close animation, tracker display, recent entries list
5. **Settings modal:** Tab navigation, all settings panels render correctly
6. **Entry view:** Read-only display, navigation, location display
7. **Dark mode:** All of the above in dark theme
8. **Mobile (375px width):** All layouts adapt correctly

**Documentation:**
- Record the before and after line counts
- List all new CSS variables added
- Note any rules that were removed and why

---

## Implementation Logs

(append a short paragraph per completed step; include the step number, a concise description of changes, and `npx svelte-check --threshold error` result)

Step 1: Removed the duplicate :root.ritual and :root.ritual.dark theme blocks after confirming they matched the base themes, and updated the :root and :root.dark comments to note ritual usage. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 2: Removed unused --spacing-* tokens from @theme (no usages found) and clarified the :root spacing comment to 'Spacing tokens (8px base unit)'. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 3: Added blue-related color variables to :root and replaced all hardcoded blue rgb/rgba values with the new variables. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 4: Added layout tokens in :root and replaced page container padding/max-width, header padding, and sidebar widths (including responsive values) with variables. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 5: Replaced the theme button's inline light/dark box-shadow values with --shadow-sm and --shadow-sm-dark, keeping other shadows unchanged. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 6: Added the file header and major section markers, and standardized existing divider comments to the new format without altering CSS rules. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 7: Reviewed for clearly redundant or overridden rules but did not find any safe removals, so no CSS changes were made. Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 8: Cleaned trailing whitespace, confirmed line count is 2617 lines, and documented :root variables: colors (--bg, --bg-page, --surface, --surface-elevated, --text, --text-secondary, --text-tertiary, --text-placeholder, --accent, --border, --success, --missed, --color-blue, --color-blue-hover, --color-blue-selection, --color-blue-bg, --sidebar-bg), spacing (--space-xs, --space-sm, --space-md, --space-lg, --space-xl, --space-2xl, --space-3xl), layout (--page-max-width, --page-padding-desktop, --page-padding-tablet, --page-padding-mobile, --page-padding-small, --sidebar-width, --sidebar-width-mobile, --header-padding-top, --header-padding-bottom), typography sizes (--text-xs, --text-sm, --text-base, --text-lg, --text-xl, --text-2xl, --text-3xl), line heights (--leading-tight, --leading-normal, --leading-relaxed), tracking (--tracking-tight, --tracking-normal), radii (--radius-sm, --radius-md, --radius-lg), transitions (--transition-fast, --transition-normal), shadows (--shadow-sm, --shadow-sm-dark, --shadow-md, --shadow-md-dark, --shadow-lg, --shadow-lg-dark), and misc tokens (--page-shadow, --question-marker-width, --question-marker-gap, --toggle-icon-gap, --safe-top, --safe-right, --safe-bottom, --safe-left). Ran `npx svelte-check --threshold error` (0 errors, 0 warnings).
Step 9: Ran `npm run build` successfully; started `npm run dev` (Vite ready on http://localhost:5174/) and stopped after the command timeout.
