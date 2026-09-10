---
paths:
  - "src/main/frontend/src/**/__tests__/**"
  - "src/main/frontend/src/**/*.test.ts"
  - "src/main/frontend/src/**/*.test.tsx"
  - "src/main/frontend/e2e/**"
---

# Frontend rules: tests

Vitest + jsdom + Testing Library, globals enabled, setup in `src/test/setup.ts`. Tests live in
`__tests__/` next to the code they cover. Run from `src/main/frontend/`:

```bash
npm test
```

Single file:

```bash
npx vitest run src/features/firestore/__tests__/query-serialization.test.ts
```

`npm run test:watch` and `npm test -- --coverage` also work; coverage is scoped to
`src/features/**` and `src/shared/**`.

## What to cover here

Pure logic is the priority, because it is where the wire contract can silently break: value
normalisation and inference, query serialisation, diffing, path helpers, the storage modules' guards
and fallbacks. Component tests exist for interaction bugs that unit tests can't reach (e.g. a
selection render loop) — reach for them for that reason, not for snapshotting markup.

Assert the **wire shape**, not just round-trip equality. `{"integerValue": "42"}` as a string, and
timestamp/reference/geo/bytes keeping their own kinds, are the invariants that matter; a test that
only checks `unwrap(wrap(x)) === x` passes while both directions are wrong together.

For storage modules, cover the corrupt-payload path: a malformed or stale localStorage value must hit
the guard and return the fallback, not throw during render.

## E2E

Playwright, `npx playwright install` once, then `npm run test:e2e`. **The committed spec
`e2e/firestore-page.spec.ts` is stale** — it asserts workspace UI at `/`, which is a welcome page;
the workspace is at `/app/firestore`. Fix or replace it rather than adding a second spec beside it.
For driving or screenshotting a running app, `.claude/skills/run-a-firestore/` has a driver
(`node .claude/skills/run-a-firestore/driver.mjs smoke|shot|eval`) and documents the startup,
port-conflict, and selector gotchas — read it before starting the app.

Vitest excludes `e2e/**`, so a Playwright spec will not be picked up by `npm test`.
