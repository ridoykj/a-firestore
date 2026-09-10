---
paths:
  - "src/main/frontend/src/features/**/api/*.ts"
  - "src/main/frontend/src/shared/api/*.tsx"
---

# Frontend rules: API and data layer

`features/firestore/api/` is the only place that talks to the backend. Components consume the hooks
it exports (`useFirestoreService`) — they do not call axios or `fetch` themselves.

## Every request carries the connection context

`FirestoreContext` is `{ projectId, databaseId }`. Requests go out with headers built by
`firestoreContextHeaders(projectId, databaseId)`, which normalises a blank database to `(default)` via
`normalizeDatabaseId`.

- Use those helpers, which come from `firestore-utils.ts` — axios calls and SSE streams both build
  headers with `firestoreContextHeaders`. Don't inline `"X-Project-Id"` / `"X-Database-Id"` at a call
  site; DUP-009 removed the last two hand-built copies, one of which sent no context headers at all.
  A request without them fails on the backend, or worse, is answered by whichever connection was
  initialised last.
- `normalizeDatabaseId` / `toStoredDatabaseId` are the only `(default)` mapping (DUP-004 replaced 13
  copies). It must stay an exact round trip: the same `"" → "(default)"` string feeds the backend
  connection key, the tab id in `gcp-store` (`tabIdFor`), and the localStorage context keys
  (`contextKeyFor`). A private copy desynchronises cached data from the connection it belongs to.

## TanStack Query keys

Build keys through `firestoreQueryKeys`, which nests everything under `contextKey(context)`. That
prefix is what makes invalidation and cache isolation per-connection correct — a hand-rolled key
array leaks one database's results into another's cache and can't be invalidated by the mutations'
`invalidateQueries({ queryKey: firestoreQueryKeys.contextRoot(...) })`.

## Typed values in, typed values out

`firestore-value-utils.ts` is the frontend mirror of the backend `FirestoreValue` contract:

- `normalizeFirestoreFields` / `normalizeWireValue` on the way in, `unwrapFirestoreValue` /
  `unwrapFirestoreFields` for display, `inferWireValue` / `buildWriteFields` /
  `computeDeleteFieldPaths` on the way out.
- Integers are wire **strings** (`{"integerValue": "42"}`). Never `Number()` one before sending it
  back; Firestore integers are int64 and JS numbers lose precision above 2^53.
- `normalizeWireValue` accepts the canonical single-kind form and nothing else. It used to carry a
  second decoder keyed on generic names (`value` / `items` / `fields` / `base64` / `path` /
  `{latitude,longitude}`) which misfired on a legitimate map field called `value` or `path`; that was
  deleted as DUP-006. If you ever need to read an old artifact shape, do it in the backup/restore
  parser where the format version is known — not in this shared normalizer.

## Errors

`request()` funnels failures through `toRequestError` / `extractApiMessage`. Keep throwing the typed
subclasses where the backend gives a typed contract — `FirestoreConflictError` for a 409 with
`latestDocument`, `FirestoreIndexError` for `errorCode: INDEX_REQUIRED` with `indexUrl` — so the UI
can offer the conflict diff and the create-index link. Note that `shared/api/axiosClient.tsx` still
carries a generic 401 refresh-token interceptor from a template; this app has no auth, so nothing
should start depending on it.

## SSE

Jobs, deep copy, and watch stream over SSE, not axios. `sse-client.ts` owns that wire-up —
`apiBaseUrl` and `streamSse(path, { headers, onEvent, onError, signal })`, which sets
`openWhenHidden`, skips unparseable messages, and suppresses the library's reconnect loop. Call it;
don't import `fetchEventSource` directly and don't re-declare a base URL (DUP-009 collapsed three
copies of each).
