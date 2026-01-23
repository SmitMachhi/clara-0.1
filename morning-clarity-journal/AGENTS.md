
## architecture principles

- **feature-first**: group by feature, not type
- **dry**: no duplicate logic/literals/structures
- **single source of truth**: never duplicate/derive state; compute it
- **no magic literals**: extract repeated values to constants
- **lean pages**: `+page.svelte` handles routing/composition only; logic in hooks/services
- **one responsibility per file**: split ui into components/subcomponents
- **keep SvelteKit views dumb**: UI should never know your business logic. fetch from backend, render UI, nothing else
- **no cross-pollution**: don't put big computations or business rules inside .svelte files. keep them in TS utilities or backend
- **acceptable in .svelte**: thin API-call wrappers (fetch to endpoints), browser API interactions (geolocation, localStorage), and component state management. actual business logic (validation, encryption, database ops, coordinate math) must stay in TS utilities or server routes

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

```svelte
<!-- purpose: <one-sentence summary> -->
<!-- context: <feature/module and how it fits> -->
<!-- location: <full internal path> -->
```