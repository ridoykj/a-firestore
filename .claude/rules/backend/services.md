---
paths:
  - "src/main/java/**/*Service.java"
  - "src/main/java/**/JobRegistry.java"
  - "src/main/java/**/QueryCursorCodec.java"
---

# Backend rules: services

Applies to `com.itbd.afirestore.**.service`. Services are `@Service` with constructor injection
(`@RequiredArgsConstructor`) and `@Slf4j`; they hold the Firestore SDK calls, and controllers hold
no query-building logic.

## Client resolution

`FirestoreManagerService` is the only place a `Firestore` client is created or cached (keyed
`projectId:databaseId`, `(default)` for a blank database, with a per-connection
`service-account` | `emulator` mode). Service methods take the project and database and call
`getFirestore(projectId, databaseId)`.

- Do not add a context-less overload of an existing method. Four used to exist with zero callers
  (`getAllDatabases()`, `getAllCollections()`, and two `createDocument` forms) and were deleted as
  DUP-008: they resolved `activeConnectionKey`, so the first caller to pick the shorter signature
  would have written to whichever tab initialised last. `getFirestore()`'s no-argument form is still
  there for the same reason — leave it unused.
- Calling a data method before `POST /api/firestore/init` (or `/init-emulator`) throws
  `IllegalStateException` — that is the intended contract, don't paper over it with a default client.
- Credentials stay in memory. Never write the service-account JSON to disk, a log line, a temp file,
  or an exception message.

## Paths

`FirestorePaths` owns normalization and the collection/document parity rule; there is no second
normalizer, and there should never be. It replaced six divergent ones (DUP-001) that made `//users` a
collection on the watch endpoint but a rejected document path on the workbench endpoint, and let
`users//posts` 500 on query while copying fine through the transfer service — because Java's
`String.split` keeps leading and interior empty segments, so how much each copy stripped changed the
segment count.

`normalize` drops every empty segment and is idempotent, so predicates may be handed raw or
already-normalized input. Use `requireDocument` / `requireCollection` when the wrong parity should be
a `400`.

## Writes and deletes

- `DocumentWriteRequest` carries an explicit `MERGE` / `REPLACE` mode, typed `fields`,
  `deleteFieldPaths` (dot notation; `REPLACE` requires the list empty), and `expectedUpdateTime`.
- A stale `expectedUpdateTime` must throw `OptimisticConcurrencyException` carrying the latest
  document. Never silently overwrite: the guard is the only protection here, since there is no auth
  layer and two browser tabs can hold the same document.
- Bulk paths are validated and capped (`MAX_BULK_DELETE_PATHS`, `MAX_BULK_EDIT_PATHS` = 500) and run
  as a single batch. `validateBulkDeletePaths` / `validateBulkEditPaths` are one-line delegates to
  `validateDocumentPaths(paths, max, label)` (DUP-003); harden that, not a copy.

## Queries and cursors

Pagination is cursor-based, never offset-based. `QueryCursorCodec` encodes base64url JSON holding one
`FirestoreValue` per order clause plus the document-ID tiebreaker; legacy single-`orderValue` tokens
must keep decoding. Treat the token as opaque outside the backend. Firestore's
`FAILED_PRECONDITION` for a missing composite index is translated to `400` /
`errorCode: INDEX_REQUIRED` with the `indexUrl` — keep that translation, it is the only way the user
learns which index to create.

## Long-running work

- `JobRegistry` holds in-memory jobs (`PENDING/RUNNING/COMPLETED/FAILED/CANCELLED`) with committed
  counts, a bounded failure list, and a cancel flag. Any loop that can run long must check the
  cancel flag and report progress; failure lists stay bounded so a bad restore can't exhaust heap.
- `FirestoreTransferService` has **one** copy engine (`copySources` → `copySource` →
  `copyCollection` → `copyDocument`, batching through `CopyBatch`). The SSE endpoint and the job
  endpoint differ only in the `CopyProgressSink` they pass, which is what a new caller should add too
  — not a second walker. It used to be two engines that had drifted on cancellation, concurrency, and
  failure handling (DUP-002), so a fix landed on one path and missed the other.
- Report progress through the sink only after a batch commits. Committed counts are a durability
  checkpoint (a cancelled job resumes from them in MERGE mode), not a queue depth.
