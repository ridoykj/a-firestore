# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`a-firestore` is a local single-user Firestore workbench: one Spring Boot (WebFlux, Java 21) service
that both exposes the API and serves the built React SPA from `src/main/resources/static/`. Firestore
clients are created **at runtime** from a service-account JSON uploaded through the UI (or pointed at
an emulator host) — there is no static credential config and no application-level auth boundary.

Backend: `src/main/java/com/itbd/afirestore/` · Frontend: `src/main/frontend/`.

## Project rules

Detailed, per-area conventions live in `.claude/rules/`. Each file is scoped with `paths:`
frontmatter, so it loads only while you are working on matching files — this file stays the map, the
rules carry the do/don't detail. When a rule and this file disagree, the rule is more specific and
wins; fix the disagreement rather than leaving both.

| Rule | Loads for | Covers |
| --- | --- | --- |
| `backend/controllers.md` | `**/*Controller.java` | context headers, `/api/**`-only mapping, wildcard path extraction, error contract, SSE |
| `backend/services.md` | `**/*Service.java`, `JobRegistry`, `QueryCursorCodec` | client resolution, path normalization, write/delete guards, cursors, jobs |
| `backend/wire-contract.md` | `**/dto/*.java`, `**/exception/**` | Jackson 3 vs 2, `FirestoreValue` kinds, int64-as-string, error payload |
| `backend/testing.md` | `src/test/java/**` | which layer to test in, `@MockitoBean`, emulator port clash, `/api/**` test controllers |
| `frontend/components.md` | `frontend/src/**/*.tsx` | orchestrator vs presentational, aliases, generated route tree, attached-tab gate |
| `frontend/data-layer.md` | `frontend/src/features/**/api/*.ts` | context headers, TanStack query keys, typed value helpers, typed errors, SSE |
| `frontend/state-and-storage.md` | `gcp-store`, `*-storage.ts`, `persistent-storage.ts` | never persist credentials, guarded reads, session-only attachment, tab identity |
| `frontend/testing.md` | frontend tests, `e2e/**` | vitest layout, asserting wire shape, stale Playwright spec |

## Commands

Run the app (port 8080; `/` app, `/app/firestore` workspace, `/docs` Swagger UI, `/v3/api-docs`):

```bash
./mvnw spring-boot:run
```

Full build (Maven `generate-resources` runs `npm install` + `npm run build`, overwriting
`src/main/resources/static/`; the `test` phase also runs vitest):

```bash
./mvnw clean verify
```

Backend tests only — skips the Node/npm steps, much faster for backend iteration:

```bash
./mvnw test -Dskip.installnodenpm -Dskip.npm
```

Single backend test class or method:

```bash
./mvnw test -Dtest=QueryCursorCodecTest -Dskip.installnodenpm -Dskip.npm
```

Frontend (from `src/main/frontend/`): `npm test` (vitest run), `npm run test:watch`,
`npm test -- --coverage`, `npm run lint`, `npm run build` (`tsc -b` + vite), `npm run dev` (Vite on
5173; CORS for that origin is allowed by `ReactJsLocalConfig`).

Single frontend test file:

```bash
npx vitest run src/features/firestore/__tests__/query-serialization.test.ts
```

E2E: `npx playwright install` once, then `npm run test:e2e`. **The committed spec
(`e2e/firestore-page.spec.ts`) is stale** — it asserts workspace UI at `/`, which is a welcome page.
Prefer the driver in `.claude/skills/run-a-firestore/driver.mjs` (`node
.claude/skills/run-a-firestore/driver.mjs smoke|shot|eval`) to drive or screenshot the running app;
read `.claude/skills/run-a-firestore/SKILL.md` before running the app or the UI — it documents
verified startup, port-conflict, and Playwright-selector gotchas.

## Architecture

### Runtime connection model (the core concept)

`FirestoreManagerService` is a registry of `Firestore` clients keyed `projectId:databaseId`
(`(default)` when the database is blank), plus an explicit per-connection mode
(`service-account` | `emulator`) and an `activeConnectionKey`. Almost every API call therefore
carries `X-Project-Id` and optional `X-Database-Id` headers and resolves its own client; calling a
data endpoint before `POST /api/firestore/init` (or `/init-emulator`) throws `IllegalStateException`.
Re-initializing a key closes the replaced client; `disconnect`/`disconnectAll`/`@PreDestroy` close
them explicitly. Credentials are never written to disk or persisted anywhere.

### Typed value contract (do not regress this)

`FirestoreValue` is a sealed interface mirroring the Firestore REST value representation: every node
on the wire is an object with exactly one kind (`{"stringValue": …}`, `{"integerValue": "42"}`,
`{"mapValue": {"fields": …}}`). Integers travel as JSON **strings** (int64 vs JS precision), and
timestamps/references/geo points/bytes are never collapsed to strings. `DocumentDto` uses
`Map<String, FirestoreValue>` fields plus `createTime`/`updateTime`. The frontend mirror lives in
`firestore-value-utils.ts` (`FirestoreWireValue`, `normalizeFirestoreFields`,
`unwrapFirestoreFields`).

**Spring Boot 4 encodes API responses with Jackson 3 (`tools.jackson`)** and silently ignores
Jackson 2 (`com.fasterxml`) annotations — custom wire formats must use
`tools.jackson.databind.annotation`. `AppConfig`'s `ObjectMapper` bean is Jackson 2 and is *not* what
the WebFlux codecs use, despite its javadoc. `DocumentDtoWireFormatTest` pins the contract through
the real HTTP stack; never assert wire format via a hand-built `ObjectMapper`.

### Write / delete safety

`DocumentWriteRequest` (`PUT /api/collections/**`) carries an explicit `MERGE`/`REPLACE` mode, typed
`fields`, `deleteFieldPaths` (dot notation; `REPLACE` requires it empty), and `expectedUpdateTime`.
A stale `expectedUpdateTime` throws `GenericFirestoreService.OptimisticConcurrencyException` →
HTTP 409 with `latestDocument`, which the frontend surfaces as `FirestoreConflictError` and a
conflict diff. Deletes accept the same guard via `?expectedUpdateTime=`. Bulk delete/edit are capped
at 500 validated paths (`MAX_BULK_DELETE_PATHS`, `MAX_BULK_EDIT_PATHS`) and run as one backend batch.

### Queries and pagination

`GET /api/workbench/query` takes parallel repeated params (`whereField`/`whereOperator`/`whereValue`/
`whereType`/`whereGroup`, repeated `orderField`/`orderDirection`) plus `filterCombinator`,
`collectionGroup`, `limit`, `cursor`. `QueryCursorCodec` encodes base64url JSON holding one
`FirestoreValue` per order clause plus the document-ID tiebreaker (legacy single-`orderValue` tokens
still decode) — pagination is cursor-based, never offset-based. A missing composite index is
translated from Firestore's `FAILED_PRECONDITION` into a `400` with `errorCode: INDEX_REQUIRED` and
an `indexUrl` (frontend: `FirestoreIndexError`).

### Long-running work and streaming

`JobRegistry` holds in-memory `Job`s (`PENDING/RUNNING/COMPLETED/FAILED/CANCELLED`) with committed
counts, bounded failure lists, and cancel flags; `/api/jobs/**` creates deep-copy and restore jobs,
streams `/{id}/events` as SSE, and reports/cancels them. `/api/transfer/deep-copy` (SSE) and
`/api/workbench/watch` (SSE) also return `Flux<ServerSentEvent<…>>`.

### Path convention

Collection paths have an odd number of segments (`users`, `users/alice/posts`); document paths have
an even number (`users/alice`). Controllers branch on `path.split("/").length % 2` and extract the
Firestore path from the wildcard mapping themselves (`extractFirestorePath`).

### Frontend

- `GcpStoreProvider` (`features/gcp/store/gcp-store.ts`) owns tabs (`projectId:databaseId` ids),
  the active tab, and the in-memory credentials `File`. Tabs are persisted to localStorage
  (non-secret only), but **"attached" state is session-only**: a tab restored from storage must be
  re-initialized against the backend before it may issue requests (`isTabAttached`/`markTabAttached`,
  surfaced by `FirestoreReconnectNotice`).
- `features/firestore/pages/FirestorePage.tsx` (~2k lines) is the orchestrator: it owns query form
  state, selection, drawer/panel state, preview drafts, and wires every dialog and panel. Panels,
  dialogs, and viewers under `features/firestore/components/**` are mostly presentational and
  receive callbacks from it.
- `features/firestore/api/` holds the axios+TanStack Query client (`firestore-service.ts`), typed
  value/path/diff helpers, transfer serialization, and the localStorage modules (query state, saved
  queries, column prefs, validation rules) built on `shared/lib/persistent-storage.ts` — versioned
  keys prefixed `a-firestore`, guard-validated reads, never secrets.
- Shared types are in `features/firestore/schemas/FirestoreSchema.ts`; routes are TanStack
  file-based under `src/routes/` with `routeTree.gen.ts` generated by the Vite plugin (don't edit).
- Aliases: `@/` → `src/`, `@/shadcn` → `src/shared/components/ui/shadcn`. shadcn components are
  vendored there (style `radix-mira`); `components.json` points the CLI at those aliases.

## Conventions and traps

- **`FFP-###` markers** in code comments map to roadmap items in
  [docs/FUTURE_FEATURE_PLAN.md](docs/FUTURE_FEATURE_PLAN.md) (id, priority, status, acceptance
  criteria). When touching or extending a marked behavior, read its row first; when finishing an
  item, update its status and reference the id in new comments. `docs/TEST_INFRASTRUCTURE.md` covers
  the three test layers, and `docs/DUPLICATION_AUDIT.md` catalogues known duplicated code/logic as
  `DUP-###` items — check it before adding a helper that may already exist in five other places.
- **Test controllers must map under `/api/**`** — `ReactForwardController` + `SpaWebFilter` forward
  every other non-asset GET to the SPA, so a probe at e.g. `/test/...` fails with
  "Could not resolve view 'forward:/'".
- Backend integration tests use `@SpringBootTest @ActiveProfiles({"test","emulator"})` with
  `src/test/resources/application-emulator.yaml` (emulator on `localhost:8080` — the same port the
  app uses, so don't run both). Testcontainers (`gcloud`) is available for emulator containers.
- `src/main/resources/static/` is build output regenerated by every Maven build and is untracked
  (`.gitignore`); expect files to reappear there after a build and leave them. Don't hand-edit them —
  the sources are in `src/main/frontend/` (`public/` for `favicon.svg` / `icons.svg`).
- Maven runs `npm install`, not `npm ci`, so `package-lock.json` shows modified after most builds.
  Verify it still satisfies `package.json` and commit it in sync — reverting it is how the lockfile
  silently drifted out of sync before, which broke `npm ci` on a fresh clone.
- Don't run `npm install` in `src/main/frontend` concurrently with a Maven build; both write
  `node_modules` and the static dir.
- The dev loop is often IntelliJ (backend on 8080, `target/classes`) + Vite dev server on 5173.
  A Maven rebuild does not refresh that running JVM; the backend needs a restart.
- Additional project guidance lives in `.github/skills/befe/SKILL.md` and
  `.github/skills/spring-flow/` (layering and API-contract patterns for new features).
