# Refactor Implementation Plan (No-Change Guarantee)

## Context
This repo is a SvelteKit journaling app with SQLite + AES-256-GCM encryption. The UI, layout, styles, and behavior must remain identical. Follow `AGENTS.md` principles: feature-first, DRY, single source of truth, no magic literals, lean `+page.svelte`, dumb views, single-responsibility files, handle promises, and Svelte file headers.

## Non-Negotiables
- Pixel-perfect UI parity: no layout/animation/style changes.
- API contracts unchanged (paths, payloads, response shapes).
- Data model unchanged (SQLite schema, encryption format).
- Behaviors unchanged (auth gating, time lock, GPS handling, backup flow).
- No visible copy changes.

## Quick Map of Current Surface
- Routes: `/` (login), `/journal`, `/entry/[date]`.
- API: `/api/auth`, `/api/entries`, `/api/entries/[date]`, `/api/locations`, `/api/locations/[id]`, `/api/backup`, `/api/seed-test`.
- Core libs: `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/crypto.ts`, `src/lib/utils.ts`, `src/lib/template.ts`.
- UI: `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `src/routes/journal/+page.svelte`, `src/routes/entry/[date]/+page.svelte`.

## Plan (Implementation Steps)
1) Baseline invariants checklist
- Document expected UI behaviors and API payloads; treat as immutable contracts.
- Identify all user-visible strings, CSS variables, and animation timings in `src/app.css` and pages.
- Snapshot critical derived values (date formatting, completion counts, tracker statuses, GPS matching logic).

2) New feature-first module structure (no behavior change)
- Create `src/lib/features/` with subfolders:
  - `auth/` for session + password logic.
  - `entries/` for entry IO + data validation + date formatting glue.
  - `locations/` for location IO + validation + matching logic.
  - `backup/` for backup creation/list/download helpers.
  - `journal/` for template + field utilities.
- Keep `src/lib/db.ts` as low-level DB access, but expose feature-specific service wrappers.

3) Extract business logic out of Svelte pages
- Move all non-UI logic from `src/routes/journal/+page.svelte` into feature services:
  - Data loading, save, validation, GPS capture helpers, date/time ticking, completion stats.
- Move entry-view formatting helpers from `src/routes/entry/[date]/+page.svelte` into `features/entries/view.ts`.
- Keep Svelte pages as: route composition + event wiring + rendering.

4) Remove duplication and magic literals
- Centralize repeated strings/numbers into constants:
  - Cutoff hour, session duration, GPS tolerance, timeout values, API paths.
- Merge duplicated password logic between `src/lib/auth.ts` and `src/lib/db.ts` into a single source.
- Deduplicate date/time helpers where used across pages by exporting from a single module.

5) Componentize without changing markup output
- Split large Svelte pages into components while keeping DOM structure identical.
- Example: journal page split into sidebar, settings modal, location dropdown, save section.
- Ensure new components receive full data via props; no business logic inside components.

6) Update imports and add required Svelte file headers
- All Svelte files get mandatory 3-line header from `AGENTS.md`.
- Fix import casing to match file system.
- Ensure no floating promises; add `.catch()` or `try/catch`.

7) Parity validation
- Manual checklist for:
  - Login flow and session cookie.
  - Journal form flow (cutoff, completion gating).
  - Location dropdown + GPS capture behavior.
  - Tracker rendering and recent list.
  - Entry view expansion behavior.
  - Backups list and download.
- If available, run `npm run check` and confirm no type errors.

## Deliverables
- Clean, feature-first folder structure.
- Lean Svelte pages with only view wiring.
- Centralized constants and shared utilities.
- No UI, behavior, or data changes.

## Notes for Implementing Agent
- Do not change HTML structure or CSS class names.
- Do not modify API shapes or DB schema.
- Preserve all time/date formatting strings exactly.
- Keep encryption pack/unpack logic untouched.
