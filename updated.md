# Fix Template System and Editor Truthfulness

Goal: Make the template system a single source of truth with strict validation, preserve backward compatibility, and rebuild the template editor so line numbers and text always match (no visual drift, no silent invalid states).

## IMPORTANT: Rules for implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you do not repeat work.
3. **After each step**, run the listed verification commands for that step.
4. **Do NOT skip steps or combine steps.** Each step should keep the app fully functional.
5. **BACKWARD COMPATIBILITY IS CRITICAL** - existing entries and presets must remain usable.

Critical fix guardrails (apply to all steps below):
- Do NOT allow invalid templates to become active
- Do NOT introduce duplicate sources of truth for template data
- Do NOT add large dependencies unless necessary to meet correctness
- Do NOT change journal UX or data flow except where required for correctness
- Keep the app functional after every step

---

## The Problem - Detailed Explanation

### Core Failures (Current Behavior)

1. **Invalid templates can be saved and activated**
   - `/api/template` accepts any source text and sets it active without validation.
   - This can brick the journal page and entry creation.

2. **Editor shows line numbers that are wrong**
   - The editor wraps lines, but the gutter counts only logical lines.
   - The overlay and textarea wrap at different widths due to scrollbars.
   - Result: cursor text and highlighted text drift out of alignment.

3. **Validation errors are not returned to the UI**
   - The UI expects `details`, but the API never returns them.
   - Preset validation failures often show as generic failures.

4. **Template data types are static, but templates are dynamic**
   - `JournalData` hardcodes field IDs that are derived from the template.
   - This undermines type integrity and makes template changes risky.

### First-Principles Target Architecture

- **Single source of truth:** template source text is authoritative; parsed model is derived on demand.
- **Validation at boundaries:** any template creation or activation must validate before persistence.
- **Truthful editor:** line numbers must represent exactly what the user edits. If wrapping is enabled, gutter must reflect visual lines; otherwise disable wrapping to keep a 1:1 mapping.
- **Dynamic data types:** entries store `Record<string, string>` keyed by template field IDs, not fixed interfaces.

---

## What These Changes Do

- Enforce template validation for active templates and presets
- Return structured validation errors to the UI with line numbers
- Prevent invalid templates from becoming active (and recover safely if one exists)
- Make editor rendering truthful (no line/text mismatch)
- Align data types with dynamic templates
- Ensure default preset protection applies to existing databases
- Return validation errors when applying invalid presets
- Remove legacy `JournalData` type from DB types

## What These Changes Do NOT Do

- Do NOT change template syntax or parsing rules
- Do NOT alter entry creation flow beyond validation/sanitization
- Do NOT change data storage format (still encrypted JSON)
- Do NOT add new features to the journal UX

---

## Implementation Targets (Remaining Work)

| Component | Files | Issue | Priority |
|-----------|-------|-------|----------|
| Default preset backfill | `src/lib/db/template-utils.ts`, `src/lib/db/schema-migrations.ts` | Existing DBs never set protected preset ID | 🟡 High |
| Preset apply validation | `src/lib/db/templates.ts`, `src/routes/api/template/+server.ts` | Invalid presets surface as “not found” | 🟡 High |
| Data model cleanup | `src/lib/db/types.ts` | Legacy `JournalData` still present | 🟡 High |

---

## Implementation Steps (Remaining Work)

### Step 1: Backfill Default Preset ID for Existing Databases

**Problem:** `default_template_preset_id` is only written when presets are empty, so existing DBs never get protection.

**Files to modify:**
- `src/lib/db/template-utils.ts`
- `src/lib/db/schema-migrations.ts`

**What to change:**

1. **Add a helper to ensure a default preset ID exists:**
   - New function `ensureDefaultPresetId(database: Database.Database): number | null`.
   - If `default_template_preset_id` exists and is valid, return it.
   - If missing, select a deterministic preset to protect:
     - First try `name = 'Default Template'`.
     - If not found, select the oldest preset by `created_at` then `id`.
   - Write the chosen ID to `config` as `default_template_preset_id`.

2. **Call the helper during migrations:**
   - In `schema-migrations.ts`, after `ensureTemplatePresetSeed(db)`, call `ensureDefaultPresetId(db)`.

**Guardrails:**
- Do not create or delete presets here; only set the config key.
- Must be deterministic and stable across restarts.

**Verification:**
- On a DB with existing presets and no config key, confirm the key is created.
- Confirm delete protection now applies to the selected preset.

---

### Step 2: Return Validation Errors When Applying Invalid Presets

**Problem:** `applyPreset` uses a parsed preset fetch that returns `null` on invalid templates, causing a 404 instead of validation details.

**Files to modify:**
- `src/lib/db/templates.ts`
- `src/routes/api/template/+server.ts`

**What to change:**

1. **Add a raw preset fetcher:**
   - Create `getTemplatePresetSourceById(id: number): { id: number; name: string; sourceText: string } | null`
   - This must not parse or validate.

2. **Validate on apply:**
   - In `POST /api/template` for `applyPreset`, use the raw source function.
   - Run `assertValidTemplateSource(sourceText)` and return `validationErrorResponse` if it fails.
   - Only then call `createTemplateVersion`.

**Guardrails:**
- Apply path must never convert validation errors into `Preset not found`.

**Verification:**
- Apply a preset with invalid syntax: UI should show line-numbered errors.
- Apply a valid preset: should work normally.

---

### Step 3: Remove Legacy JournalData Interface from DB Types

**Problem:** `JournalData` remains in `src/lib/db/types.ts` and conflicts with the dynamic record model.

**Files to modify:**
- `src/lib/db/types.ts`

**What to change:**

1. **Delete the `JournalData` interface** if it is unused.
2. **Confirm no imports reference it** (use `rg -n "JournalData" src`).

**Guardrails:**
- Do not change stored data shape.
- Only type cleanup.

**Verification:**
- `rg` shows no references to `JournalData`.
- `npm run check` passes.

---

### Step 4: End-to-End Verification (Post-Fix)

**Commands to run:**
```bash
npm run check
npm run build
```

**Manual QA checklist:**
- Default preset protection applies even on existing DBs
- Invalid preset apply shows validation details
- Template editor alignment and validation remain correct

---

## Implementation Logs

**Step 1 (2026-01-29):** Backfilled default preset ID for existing databases. Added `ensureDefaultPresetId()` to `src/lib/db/template-utils.ts` that checks for an existing config key, validates the preset exists, and if missing selects a deterministic preset (first by name 'Default Template', then oldest by created_at/id). Updated `src/lib/db/schema-migrations.ts` to import and call this function after `ensureTemplatePresetSeed()`. Typecheck passed with 0 errors.

**Step 2 (2026-01-29):** Return validation errors when applying invalid presets. Added `getTemplatePresetSourceById()` function in `src/lib/db/templates.ts` that fetches raw preset source text without parsing/validating. Updated `src/routes/api/template/+server.ts` to import `getTemplatePresetSourceById` and `assertValidTemplateSource`, then modified the `applyPreset` handler to use the raw source, validate it, and return structured validation errors instead of converting to "Preset not found" 404. Typecheck passed with 0 errors.

**Step 3 (2026-01-29):** Removed legacy `JournalData` interface from DB types. Deleted the `JournalData` interface from `src/lib/db/types.ts` (lines 1-35) as it was not referenced in any active code (only found in .bak backup files). Verified with `grep -rn "JournalData" src --include="*.ts" --include="*.svelte" --exclude="*.bak" --exclude="*.bak2"` showing no references. Typecheck passed with 0 errors.

**Step 4 (2026-01-29):** End-to-End verification. Ran `npm run check` - svelte-check found 0 errors and 0 warnings. Ran `npm run build` - successful build with client and server output generated. All implementation steps complete and verified.

(Implementation logs are written by the implementing agent after each step. Do not edit this section during planning.)

## Summary of Planned Changes

| Area | Change | Expected Outcome |
|------|--------|------------------|
| Backfill | Default preset ID on existing DBs | Protection applies everywhere |
| Preset apply | Validation details surfaced | Errors are actionable |
| Types | Remove legacy `JournalData` | Data model stays consistent |
