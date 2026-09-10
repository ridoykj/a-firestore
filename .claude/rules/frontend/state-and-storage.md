---
paths:
  - "src/main/frontend/src/features/gcp/store/*.ts"
  - "src/main/frontend/src/features/**/*-storage.ts"
  - "src/main/frontend/src/shared/lib/persistent-storage.ts"
---

# Frontend rules: client state and persistence

## Never persist a secret

`persistent-storage.ts` is the only localStorage accessor (`readJson` / `writeJson` / `removeJson`,
keys prefixed `a-firestore`, every read validated by a `StorageGuard<T>` with a fallback). Its
contract, stated in the file: only non-secret values.

The service-account JSON lives in `GcpStoreProvider` as an in-memory `File` for the session and is
never written to localStorage, sessionStorage, IndexedDB, a cookie, a query string, or a log line.
The backend likewise never writes it to disk. This is the app's only real boundary — it has no auth
layer — so treat any change that would persist or transmit credentials as a defect, not a feature.
The same goes for anything derived from them (tokens, decoded claims, project lists keyed by file
contents).

## What may be persisted

Workspace state only: tabs (`projectId:databaseId` ids), query form state, saved queries, column
prefs, validation rules. Add a new persisted slice as its own module built on
`persistent-storage.ts`, with a versioned key and a guard — a bad or stale localStorage payload must
fall back, never throw at render time.

## Attached state is session-only

Tabs are restored from localStorage, but **attachment is not**. A restored tab must be re-initialised
against the backend (`POST /api/firestore/init` or `/init-emulator`) before it may issue requests;
`isTabAttached` / `markTabAttached` track that and `FirestoreReconnectNotice` prompts for it. Do not
persist an `attached` flag or infer attachment from the presence of a stored tab — the backend
registry is empty after a restart, and any request would fail with `IllegalStateException`.

## Tab identity

A tab id is `projectId:databaseId` with `(default)` standing in for a blank database. Build it with
`tabIdFor` and store the database id with `toStoredDatabaseId`, both from `firestore-utils.ts` — the
same normalisation the backend uses for its connection key and the API layer uses for cache and
storage keys (DUP-004). If a private copy diverges, persisted query state reattaches to the wrong
database.
