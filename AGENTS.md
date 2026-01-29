# CLAUDE.md

## Core principles
- Feature-first structure: group by feature, not file type.
- write code for humans not bots, it needs to be understood by a human at one glance
- the goal isnt to write code that works but to code that is obvious
- Single source of truth: never duplicate or store derived state; compute it from the source.
- DRY: no duplicate logic, literals, or structures.
- No magic literals: extract repeated values into constants.
- One responsibility per file: split UI into components/subcomponents.
- Dumb SvelteKit views: `.svelte/+page.svelte` composes only; no business rules or heavy computation. Put logic in TS utilities/services or backend.
- No cross-pollution: do not embed big computations or business logic in `.svelte` files.

## Workflow (do this every task)
1) Read before editing: open relevant files, follow existing patterns, never guess.
2) Plan: list touched files + steps + verification commands.
3) Implement: small diffs, minimal scope.
4) Verify: run the smallest relevant checks (tests, lint, typecheck, build). Fix until green.
5) Commit: small commits, imperative subject.

## Token + context discipline
- Use `@path/to/file` refs in chat. Quote only the needed lines.
- Prefer search over reading lots of files.
- Keep outputs short: show only key errors/diffs.
- If stuck or self-correcting repeatedly: `/clear`, restate goal + constraints.
- If near limit: `/compact` preserving modified files + decisions + commands.

## Code quality rules (compressed)
### Naming and Size
- Max 200 lines per file (soft limit; split by responsibility).
- Intention-revealing, consistent domain vocabulary. No pointless abbreviations.
- Booleans: `is/has/can/should` + positive adjective (avoid negated names).

### Functions
- Single purpose, small. Minimize args (aim <=3). No boolean flag params; use options objects/enums.
- Separate I/O from pure logic. Minimize side effects.
- Use guard clauses; avoid deep nesting.

### Modules/classes
- High cohesion, low coupling. Prefer composition over inheritance.
- One public entrypoint when possible; keep helpers private.
- Order code by execution flow.

### Comments
- Prefer better names/types over comments.
- Comments only for “why”, constraints, or API docs.

### Tests
- One behavior per test. Clear names. AAA or Given-When-Then.
- Fast and deterministic. Avoid conditionals/loops in tests.

## Imports + async safety
- Case-sensitive import paths must match filesystem exactly.
- No floating promises. Always `await`, `return`, or `.catch()`/handled rejection.

## Formatting (Prettier)
- Tabs.
- Single quotes.
- No trailing commas.
- 100 char print width.

## Mandatory Svelte file header
Every `.svelte` file starts with:
```svelte
<!-- purpose: <one sentence> -->
<!-- context: <feature/module fit> -->
<!-- location: <full internal path> -->