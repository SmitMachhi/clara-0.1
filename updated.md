## Template System Plan (New)

Goal: Add an in-app template editor with a tag-based DSL. Past entries must render with their original template version; new entries use the latest template. UI/UX must remain visually identical.

## IMPORTANT: Rules for the implementing agent

1. **Follow `AGENTS.md` rules** (tabs, single quotes, file headers, lean pages, DRY, etc.)
2. **Implement ONE step at a time.** After each step, write a brief log paragraph at the bottom of this file under "## Implementation Logs".
   2.2. **Before starting any step, read the Implementation Logs first** so you don’t repeat work.
3. **After each step**, run `npx svelte-check --threshold error` and fix any errors BEFORE moving to the next step.
4. **After ALL steps**, run `npm run build` and then `npm run dev` to verify the app loads and routes work.
5. **Do NOT skip steps or combine steps.** Each step should keep the app usable.


### DSL (tag-based, no visible IDs)
Allowed tags:
- `<hp>...</hp>` = main question prompt (auto-numbered in display)
- `<mp>...</mp>` = meta question prompt (must be inside an `<hp>` block)
- Optional placeholder attribute: `label="..."` on either tag

Example:
```
<hp>Who am I doing this for?</hp>
<mp label="Be specific...">What’s making me anxious right now?</mp>
<mp>What am I avoiding?</mp>
<hp label="Enter answer...">What if the fear is wrong?</hp>
<mp>Evidence this fear might not be true?</mp>
<mp>Upside if I act despite fear?</mp>
```

Rules:
- No IDs in the DSL.
- Each `<hp>` creates a question section with a textbox.
- Each `<mp>` adds a labeled field under the most recent `<hp>`.
- `<mp>` without a preceding `<hp>` is invalid.
- If `label="..."` is present, use it as the textbox placeholder for that tag.
- Backend auto-generates internal field IDs per template version.
- Every template save creates a new version. Entries are pinned to their version.

Security guardrails (apply to all steps below):
- Treat template text as untrusted input; parse on server only.
- Render prompts/placeholders as plain text only (no HTML injection).
- Enforce max template size (20KB) and max lines (200) to prevent abuse.
- Reject unknown tags/attributes with clear errors.
- Keep template API behind existing cookie auth (no extra tokens).
- Do not include template text in URLs or logs.
- Encrypt template source at rest (use existing AES helpers).

Execution guardrails for the implementing agent:
- Do one step at a time, update Implementation Logs after each step, and run `npx svelte-check --threshold error`.
- Do not change UI/UX layout; only swap data sources.
- Do not remove legacy support; entries must render with their own template version.
- Do not create new files unless explicitly instructed.
- Keep error messages and status codes exactly as specified below.

TemplateModel JSON shape (must match exactly):
```
{
  "questions": [
    {
      "id": "q1",
      "number": 1,
      "question": "Who am I doing this for?",
      "fields": [
        { "id": "f1", "label": "", "placeholder": "Enter answer..." },
        { "id": "f2", "label": "What’s making me anxious right now?", "placeholder": "" }
      ]
    }
  ],
  "fieldIds": ["f1", "f2"]
}
```

Schema rules:
- `questions` order is render order.
- `number` is 1-based HP numbering.
- `question` is the HP text.
- `fields` includes the HP's own textbox first, then MP fields in order.
- `label` is empty string for HP textbox; MP label is the MP text.
- `placeholder` is empty string when not provided.
- `fieldIds` is a flat list of all field IDs in render order.

### Step 14: Add template schema + migrations (backend)

Edit `morning-clarity-journal/src/lib/db.ts`:
1. Add `templates` table:
	- `id INTEGER PRIMARY KEY AUTOINCREMENT`
	- `created_at TEXT DEFAULT (datetime('now'))`
	- `source_text_encrypted BLOB NOT NULL`
	- `parsed_json TEXT NOT NULL`
2. Add `entries.template_id INTEGER` column (nullable at first).
3. Use `config` table to store `active_template_id`.
4. Add helpers (same file):
	- `createTemplateVersion(sourceText: string, parsed: TemplateModel): number` (encrypt before store)
	- `setActiveTemplate(id: number): void`
	- `getActiveTemplate(): { id: number; sourceText: string; parsed: TemplateModel } | null` (decrypt before return)
	- `getTemplateById(id: number): { id: number; sourceText: string; parsed: TemplateModel } | null` (decrypt before return)
	- `ensureActiveTemplate(): number` (seed default template if missing)
	- `backfillEntryTemplateIds(activeTemplateId: number): void`
5. On DB init, call `ensureActiveTemplate()` and `backfillEntryTemplateIds(...)` once.

Migration details:
- If `entries.template_id` is missing, add column with NULL default.
- If `templates` table is empty, create a default template from existing `journalTemplate` and set as active.
- Backfill existing entries by setting `template_id` to the active template ID where NULL.

Guardrails:
- No new files in this step.
- Keep encryption and existing data intact.
- Do NOT log template contents or parsed JSON.

### Step 15: Template DSL parsing + default seed (backend)

Edit `morning-clarity-journal/src/lib/template.ts`:
1. Add types:
	- `TemplateBlock` (type, text, placeholder?)
	- `TemplateField` (id, label?, placeholder?)
	- `TemplateQuestion` (id, number, question, fields)
	- `TemplateModel` (questions, fieldIds)
2. Add `parseTemplateSource(sourceText: string): { parsed: TemplateModel; errors: string[] }`
	- Parse by tag pairs (`<hp ...>...</hp>` and `<mp ...>...</mp>`).
	- `<hp>` starts a new question section; auto-number in render order.
	- Each `<hp>` also creates its own textbox field.
	- `<mp>` adds a labeled field under the most recent `<hp>`.
	- If `<mp>` appears before any `<hp>`, return a validation error.
	- Support optional `label="..."` attribute and map it to placeholder for that field.
	- Generate stable IDs for this version only (e.g. `q1`, `f1`, `f2` in parse order).
	- Enforce size limits before parsing and return a validation error if exceeded.
3. Add `serializeDefaultTemplate(): string` that converts the current hardcoded `journalTemplate` into DSL text. Use it for initial seeding only.
4. Keep `journalTemplate` for seed/back-compat only; do not use it in runtime UI after later steps.

Guardrails:
- Parse/validation must return line-level errors with helpful messages.
- Do NOT add parsing on the client.

Validation requirements:
- Unknown tags: error `Unknown tag on line X`.
- `<mp>` before any `<hp>`: error `MP without HP on line X`.
- Empty tag content: error `Empty tag content on line X`.
- Invalid attribute syntax: error `Invalid attribute on line X`.

### Step 16: Template API endpoints (backend)

Add NEW FILE `morning-clarity-journal/src/routes/api/template/+server.ts`:
1. `GET`: return active template `{ id, sourceText, parsed }`.
2. `POST`: accept `{ sourceText }`:
	- Parse/validate via `parseTemplateSource`.
	- If errors, return 400 with `{ error: 'Invalid template', details: [...] }`.
	- Create template version and set active.
	- Return `{ success: true, id }`.

Guardrails:
- Auth is enforced by hooks (no extra auth logic here).
- No query tokens.
- Do not return raw parse errors in 500s; always map to 400 with details.

### Step 17: Entries API + storage updates (backend)

Edit `morning-clarity-journal/src/lib/db.ts`:
1. Update `saveEntry(...)` to accept `templateId` and write `template_id`.
2. Update `getEntryByDate(...)` to include `template_id`.

Edit `morning-clarity-journal/src/routes/api/entries/+server.ts`:
1. Before save, call `getActiveTemplate()` and require a valid template ID.
2. Pass `template_id` to `saveEntry`.

Edit `morning-clarity-journal/src/routes/api/entries/[date]/+server.ts`:
1. Include `template_id` in the response.
2. Fetch the template by `template_id` and return `template` (parsed model) alongside entry data.

Guardrails:
- Do not change encryption format or client payload shape beyond adding template data.
- If template lookup fails for an entry, return 500 with `Failed to load template`.

### Step 18: Update journal form rendering to use templates (frontend)

Edit `morning-clarity-journal/src/routes/journal/+page.svelte`:
1. Fetch active template from `/api/template` on mount.
2. Build `formData` from template field IDs (new helper).
3. Replace `journalTemplate` usage with the fetched template model.
4. If template load fails, show the existing load error UX.

Implementation detail:
- Create `createEmptyFormData(template: TemplateModel)` in `src/lib/template.ts` (or update `getEmptyJournalData` to accept a template).

Edit `morning-clarity-journal/src/lib/components/JournalForm.svelte`:
1. Remove `journalTemplate` import.
2. Accept `template` as a prop and render from it.
3. Keep the same UI structure and classes; only swap the data source.
4. Do not change layout or styles; render HP/MP prompts exactly as current UI.

Placeholder handling:
- If a field has placeholder text, set `data-placeholder` attribute on the contenteditable.
- Use CSS `:empty::before` to show placeholder text (no DOM changes).

Guardrails:
- UI/UX must remain visually identical.
- No client-side parsing.

### Step 19: Update entry view rendering with template versions (frontend)

Edit `morning-clarity-journal/src/routes/entry/[date]/+page.svelte`:
1. Use `template` returned from `/api/entries/[date]` instead of `journalTemplate`.
2. Compute legacy fields by comparing entry keys to template field IDs from the entry’s template.
3. Keep legacy section behavior and layout unchanged.

Guardrails:
- Past entries must render exactly as before.

### Step 20: Settings template editor UI (frontend)

Edit `morning-clarity-journal/src/lib/components/SettingsModal.svelte`:
1. Add “Edit Template” button (under Database Backup).
2. Add a new modal with:
	- Large textarea (monospace)
	- Short usage instructions + example
	- Load current template via `/api/template` on open
	- Save via POST `/api/template`
3. On successful save:
	- Close editor
	- Trigger a callback `onTemplateChanged` to refetch template in journal page
	- Clear local draft (`mcj-draft`) to avoid mismatched fields

Guardrails:
- No new files for UI; keep within `SettingsModal.svelte`.
- Use existing Modal component for consistency.

### Step 21: Final verification (template system)

Run after each step: `npx svelte-check --threshold error`.

After all steps:
1. `npm run build`
2. `npm run dev`

Manual checks:
- Editing template creates new version and affects only future entries.
- Old entries render with their original layout and fields.
- Journal form UI looks the same as before.
- Template editor shows clear validation errors on invalid lines.
- Template source is encrypted in DB (verify `templates.source_text_encrypted` is not readable text).

---

## Implementation Logs
Step 14: Added templates table and entries.template_id migrations in `src/lib/db.ts`, plus template version helpers, active-template config handling, and default template seeding/backfill using the current journal template. Ran `npx svelte-check --threshold error` with no issues.
Step 15: Added template DSL parsing, validation, and default template serialization in `src/lib/template.ts`, and wired default seeding to serialize+parse in `src/lib/db.ts`. Updated legacy template fields to include placeholders and removed multiline/type metadata. Ran `npx svelte-check --threshold error` with no issues.
Step 16: Added `/api/template` GET/POST endpoints to fetch and update the active template with validation errors mapped to 400 responses. Ran `npx svelte-check --threshold error` with no issues.
Step 17: Stored template IDs on entries, required an active template during save, and returned entry templates from the date endpoint. Ran `npx svelte-check --threshold error` with no issues.
Step 18: Loaded templates on the journal page, built form data from template field IDs, and rendered the form via the template model. Added placeholder rendering via `data-placeholder` and CSS. Ran `npx svelte-check --threshold error` with no issues.
Step 19: Switched entry view rendering to use the entry’s template version, and computed legacy fields against that template’s field IDs. Ran `npx svelte-check --threshold error` with no issues.
Step 20: Added template editor modal and API wiring in `SettingsModal.svelte`, cleared drafts on save, and provided styling for the editor. Wired template refresh callback in `journal/+page.svelte`. Ran `npx svelte-check --threshold error` with no issues.
Step 21: Ran `npm run build` successfully. Started `npm run dev` to verify the app boots (server ready at localhost:5173) and then stopped due to timeout.
