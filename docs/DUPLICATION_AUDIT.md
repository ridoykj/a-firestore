# Duplication Audit

Status: **Resolved** — all nine items implemented on 2026-08-06
Audited: 2026-08-06 (branch `v3`, commit `e8a592d`)
Audience: Future coding agents and maintainers

Catalogue of duplicated code and duplicated *logic* found by reading the tree at the audit commit.
Every item has since been consolidated; each entry keeps its original findings (so the reasoning and
the failure modes stay on record) and ends with a **Resolution** naming what replaced it. Line
numbers are as of the audit commit and no longer match the tree.

Priorities follow `FUTURE_FEATURE_PLAN.md`: **P0** correctness/safety, **P1** high-value
consolidation, **P2** cleanup.

| ID | Priority | Duplication | Sites | Now |
|---|---|---|---|---|
| DUP-001 | P0 | Six divergent Firestore path normalizers feeding the same parity check | 6 | `FirestorePaths` |
| DUP-002 | P0 | Two parallel deep-copy engines | 2 × 4 methods | one engine + `CopyProgressSink` |
| DUP-003 | P1 | Bulk delete / bulk edit path validators are line-for-line identical | 2 | `validateDocumentPaths` |
| DUP-004 | P1 | `(default)` database-id normalization reimplemented across both stacks | 6 + 7 | `FirestoreIds` / `normalizeDatabaseId` |
| DUP-005 | P1 | Firestore value-kind taxonomy restated per call site | 4 (FE) + 3 (BE) | `FIRESTORE_VALUE_KINDS` union |
| DUP-006 | P1 | Second wire decoder for an encoding the backend no longer emits | 1 | deleted |
| DUP-007 | P2 | Ad-hoc error payloads and repeated `onErrorResume` ladders | ~26 | `RestExceptionHandler` |
| DUP-008 | P2 | Dead context-less service overloads duplicating their context-taking twins | 4 | deleted |
| DUP-009 | P2 | `baseUrl` and SSE plumbing duplicated per consumer | 3 | `sse-client` |

New shared code introduced by the consolidation:

| Module | Owns |
|---|---|
| `firestore/support/FirestorePaths.java` | normalization + the collection/document parity rule |
| `firestore/support/FirestoreIds.java` | database-id normalization + the connection key |
| `common/exception/IndexRequiredException.java` | missing-index detection and its create-index URL |
| `common/exception/OperationFailedException.java` | a failure whose message is safe to show the user |
| `firestore/api/firestore-utils.ts` | frontend database-id / path / context-header helpers |
| `firestore/api/sse-client.ts` | `apiBaseUrl` + `streamSse` |

---

## DUP-001 (P0) — Six divergent path normalizers feeding one parity rule

**Sites**

| Implementation | Behaviour |
|---|---|
| `FirestoreWatchController.normalize` ([:127](../src/main/java/com/itbd/afirestore/firestore/controller/FirestoreWatchController.java#L127)) | `trim().replaceAll("^/+\|/+$", "")` — strips *all* leading and trailing slashes |
| `FirestoreWorkbenchController.normalize` ([:653](../src/main/java/com/itbd/afirestore/firestore/controller/FirestoreWorkbenchController.java#L653)) | strips **one** trailing slash, then **one** leading slash |
| `GenericFirestoreController.normalizePath` ([:209](../src/main/java/com/itbd/afirestore/firestore/controller/GenericFirestoreController.java#L209)) | strips **one** leading slash, *all* trailing slashes |
| `FirestoreTransferService.normalizePath` ([:286](../src/main/java/com/itbd/afirestore/firestore/service/FirestoreTransferService.java#L286)) | splits and drops **every** empty segment, including interior ones |
| `GenericFirestoreService.normalizeDocumentPath` ([:688](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L688)) | same regex as the watch controller |
| `GenericFirestoreService.validateBulkDeletePaths` / `validateBulkEditPaths` ([:448](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L448), [:601](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L601)) | same regex, inlined again |

Every one of them feeds the same collection/document decision, `path.split("/").length % 2`,
which is itself re-implemented in 8 places (`isCollectionPath` in
`FirestoreWorkbenchController:667`, `GenericFirestoreController:223`,
`FirestoreTransferService:315`, plus inline parity tests at `FirestoreWatchController:62`,
`GenericFirestoreController:54`, `FirestoreBackupService:65`, `GenericFirestoreService:451/602/873`).

**Why it matters.** Java's `split` keeps interior and leading empty segments, so *how much* a
normalizer strips changes the segment count, which flips the collection/document
classification. The same user input is therefore classified differently per endpoint:

- `//users` — the watch endpoint normalizes to `users` (1 segment, odd → **collection**); the
  workbench query endpoint normalizes to `/users` (2 segments, even → **document**) and rejects
  it with "Path must be a collection path."
- `users//posts` — the workbench endpoint leaves it intact (3 segments, odd → **collection**),
  passes it to the SDK, and fails with a 500 from an invalid Firestore path; the transfer
  service collapses it to `users/posts` (even → **document**) and copies it successfully.

**Suggested fix.** One `FirestorePaths` utility — `normalize` (drop all empty segments),
`isCollection`, `isDocument`, `lastSegment`, `requireDocument`, `requireCollection` — used by
every controller and service. Delete the six copies. Unit-test the normalizer against
`//a`, `a//b`, `a/`, `/a/`, `""`, `null`, and pin the parity outcome for each.

**Resolution.** `firestore/support/FirestorePaths.java` (plus `parent` and `segmentCount`). Every
predicate normalizes before counting, so it is idempotent and callers may pass raw or normalized
input. All six normalizers and all eight inline parity tests delegate to it, including
`FirestoreBackupService`'s restore loop. `FirestorePathsTest` is the parity table: the `//users` and
`users//posts` divergences above are its regression cases. The frontend's `normalizePath` was aligned
to the same rule, so a path cannot be a collection on one side of the wire and a document on the
other.

---

## DUP-002 (P0) — Two parallel deep-copy engines

**Sites** — [`FirestoreTransferService`](../src/main/java/com/itbd/afirestore/firestore/service/FirestoreTransferService.java)

| SSE path (`/api/transfer/deep-copy`) | Job path (`/api/jobs/deep-copy`) |
|---|---|
| `performDeepCopyAsync` :50 | `startDeepCopyJob` :118 |
| `copyCollectionRecursive` :203 | `copyCollectionForJob` :168 |
| `copyDocumentRecursive` :217 | `copyDocumentForJob` :178 |
| `BatchManager` :330 | `JobBatchManager` :387 |

Both re-implement the same sequence: resolve source/target clients, normalize the target base
path, derive `SetOptions.merge()` from `"MERGE".equalsIgnoreCase(conflictResolution())`,
normalize and collect source paths, dispatch document-vs-collection, resolve and validate the
target path (`resolveTargetDocumentPath`/`ensureDocumentPath` — shared), walk subcollections
recursively, and batch writes.

**Why it matters.** The two copies have already drifted, so a fix to one silently misses the
other:

- The job path checks `job.isCancelRequested()` between paths; the SSE path cannot be
  cancelled at all.
- The job path dedupes via `LinkedHashSet` and records per-path failures; the SSE path keeps
  duplicates in a `List` and aborts the whole copy by throwing on the first invalid path.
- The SSE path fans out across virtual threads; the job path is sequential. A concurrency bug
  fixed in one is not fixed in the other.

**Suggested fix.** One copy engine taking a progress sink (`onCommitted(int)`,
`onFailure(path, reason)`, `isCancelled()`), implemented twice — once over `JobRegistry.Job`,
once over the SSE emitter. One batch manager parameterized by that sink. Retiring the SSE
endpoint in favour of the job endpoint would be the smaller change if the frontend can move.

**Resolution.** The sink, not the endpoint retirement — both entry points still exist and now differ
only in their `CopyProgressSink` (`JobProgressSink` over `JobRegistry.Job`, `CollectingProgressSink`
over the SSE counter). `copySources` -> `copySource` -> `copyCollection` -> `copyDocument` is the one
walker and `CopyBatch` the one batch manager. Each drift was resolved toward the better behaviour
rather than either predecessor's: cancellation is checked before every document on **both** paths,
both fan out across virtual threads, and both record per-path failures instead of aborting — the SSE
path summarizes them into its error reference so a bad source path is still reported. Progress counts
on commit, not on queue, so a cancelled copy's count is a real checkpoint. The unused
`performDeepCopy` polling wrapper (a `Thread.sleep` loop) was deleted.

---

## DUP-003 (P1) — Bulk delete / bulk edit validators are identical

**Sites** — `GenericFirestoreService.validateBulkDeletePaths` ([:441](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L441))
and `validateBulkEditPaths` ([~:594](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L594)).

Byte-for-byte the same loop — null/blank rejection, the `^/+|/+$` strip, the even-segment
check, `LinkedHashSet` dedupe, cap check, `List.copyOf` — differing only in the two error
message prefixes ("Bulk delete" / "Bulk edit") and the constant (`MAX_BULK_DELETE_PATHS` /
`MAX_BULK_EDIT_PATHS`, both 500).

**Why it matters.** Both are `static` and separately unit-tested, so a hardening change (say,
rejecting paths with `..` segments, or raising the cap) applied to one leaves the other
endpoint accepting what the first now refuses.

**Suggested fix.** `validateDocumentPaths(List<String> paths, int max, String operationLabel)`;
keep both public entry points as one-line delegates so existing tests still describe intent.

**Resolution.** Exactly that. `validateBulkDeletePaths` / `validateBulkEditPaths` are one-line
delegates, so both test suites still pin their own label and cap while there is a single
implementation to harden.

---

## DUP-004 (P1) — `(default)` database-id normalization reimplemented in 13 places

**Backend (6)** — `FirestoreManagerService:273`, `GenericFirestoreController:205`,
`FirestoreWorkbenchController:674`, `FirestoreWatchController:134`, `JobController:123`, and
inline inside `AdminFirestoreController.getAllDatabases:30-32`. Two spellings (ternary vs
if-block) of identical behaviour.

**Frontend (7)** — `gcp-store.ts:98`, `AddTabDialog.tsx:36`, `firestore-service.ts:482`,
`FirestoreWatchDialog.tsx:76`, `FirestoreToFirestoreImportDialog.tsx:100`,
`saved-queries-storage.ts:30`, `validation-rules-storage.ts:9`.

**Why it matters.** This is not cosmetic: the `"" ↔ "(default)"` round trip is the identity
function for three different keys — the backend connection key (`projectId + ":" + databaseId`,
`FirestoreManagerService:262`), the frontend tab id (`gcp-store.ts:107`), and the localStorage
context key for saved queries, history, column prefs, and validation rules. A copy that trims
differently (or forgets to map `"(default)"` back to `""`, as `gcp-store.ts:108` and
`AddTabDialog.tsx:51` must) produces a tab whose requests hit one connection while its
persisted state lives under another key.

**Suggested fix.** Backend: normalize once at the edge — a `FirestoreContext` argument
resolver or `HandlerMethodArgumentResolver` that reads both headers and hands controllers an
already-normalized record — and drop the six copies. Frontend: one exported
`normalizeDatabaseId` / `toStoredDatabaseId` pair in `firestore-utils.ts`, imported everywhere,
with the `"" ↔ "(default)"` direction named in the function name.

**Resolution.** Frontend as suggested: `normalizeDatabaseId` / `toStoredDatabaseId`, plus `tabIdFor`,
`contextKeyFor`, and `firestoreContextHeaders`, so the tab id, the cache scope, the storage key, and
the request headers all derive from one function. Backend: a shared `FirestoreIds` utility rather than
an argument resolver — the resolver would have changed every controller signature for no behavioural
gain, so the smaller change was taken; `FirestoreManagerService` builds its connection key from it
too. `FirestoreIdsTest` pins the round trip.

---

## DUP-005 (P1) — Value-kind taxonomy restated per call site

**Frontend (4)** — the 11 wire kinds are listed independently in
`firestore-value-utils.ts:40-51` (guard array), `:165-200` (`unwrapFirestoreValue` switch),
`:326+` (`wrapValueWithOriginal` switch), and `firestore-diff.ts:51` (`wireKindToType` switch).

**Backend (3)** — `FirestoreValue`'s `permits` clause, `Serializer.serialize`, and
`Deserializer.fromNode` ([FirestoreValue.java](../src/main/java/com/itbd/afirestore/firestore/dto/FirestoreValue.java)).

**Why it matters.** The backend's three are protected by the sealed interface: a new permitted
subtype makes the switches fail to compile. The frontend's four have no such link — they are
string switches with `default: return null` / `return "unknown"` arms. Adding a kind means
seven coordinated edits, and a missed frontend site degrades silently: the tree/graph viewer
renders nothing, the diff labels the field `unknown`, and the schema profiler (which reuses
`flattenTypedFields`) reports a phantom type conflict.

**Suggested fix.** Export `const FIRESTORE_VALUE_KINDS = [...] as const` plus
`type FirestoreValueKind = typeof FIRESTORE_VALUE_KINDS[number]` from one module, key the
switches on that union, and let `noImplicitReturns`/exhaustiveness checking flag the gaps. The
sealed interface stays the source of truth on the backend.

**Resolution.** Both are exported from `firestore-value-utils.ts`. The guard array became `kindOf`,
which returns `FirestoreValueKind | null` and is the single entry point for reading a value's kind;
`unwrapFirestoreValue` and `wrapValueWithOriginal` switch on that union and end in
`assertAllKindsHandled(kind, fallback)`, which fails to compile when a kind is unhandled but still
degrades gracefully at runtime. `firestore-diff.ts`'s switch became a
`Record<FirestoreValueKind, DiffValueType>`, exhaustive by construction. Adding a kind now breaks the
build in every place that must change.

---

## DUP-006 (P1) — Second wire decoder for an encoding the backend no longer emits

**Site** — `normalizeWireValue`, `firestore-value-utils.ts:58-124`.

After the canonical-form early return, the function contains a whole second decoder keyed on
`value`, `items`, `fields`, `base64`, `path`, and a bare `{latitude, longitude}` pair. Its
own docstring explains why: the backend once serialized `FirestoreValue`'s record components
raw, because Jackson 3 ignored the Jackson 2 annotations.

**Why it matters.** That premise no longer holds — `FirestoreValue` now carries
`tools.jackson.databind.annotation` annotations, and `DocumentDtoWireFormatTest` pins the
canonical single-kind form through the real HTTP stack. So this branch is unreachable for
current API responses while remaining reachable for anything else routed through
`normalizeFirestoreFields`. It decodes on *generic* key names, so any single-key object whose
key happens to be `value`, `path`, `fields`, or `items` is reinterpreted as a typed Firestore
value rather than a plain map — a live hazard the moment this function is pointed at
user-authored JSON (imports, backup artifacts) instead of API output.

**Suggested fix.** Confirm no persisted artifact (backup manifests, exported JSON) uses the
record-component shape, then delete the branch and let `normalizeWireValue` return `null` for
non-canonical input. If a compatibility path is still needed for old backup files, move it into
the backup/restore parser where the format version is known, not into the shared normalizer.

**Resolution.** Deleted; `normalizeWireValue` is now `isWireValue(value) ? value : null`. No
compatibility path was added: backup artifacts are serialized by the same canonical encoder, and the
restore endpoint deserializes `Map<String, FirestoreValue>` with Jackson 3, which accepts only the
canonical form — so an artifact old enough to carry record components would fail on the backend
regardless of what the frontend normalizer did. The three tests that pinned the old decoder were
replaced with tests asserting the hazard is gone: a map field named `value`, `path`, `fields`, or
`items` stays a map.

---

## DUP-007 (P2) — Ad-hoc error payloads and repeated `onErrorResume` ladders

**Sites** — inline `Map.of("message", …)` at `FirestoreWorkbenchController:68,76,91,208,406,425`,
`JobController:44,58,111`, `FirestoreWatchController:51,58,71,97`; the
`errorBody`/`errorBodyObject` pair at `GenericFirestoreController:234-242` (the second is a
pure cast of the first); and 13 `onErrorResume` chains in each of `GenericFirestoreController`
and `FirestoreWorkbenchController` repeating the same
`IllegalArgumentException → 400`, `OptimisticConcurrencyException → 409`, `Exception → 500`
mapping.

**Why it matters.** Three error shapes now reach the client — `{message}`, `{errorCode,
message, latestDocument}`, and `{errorCode, message, indexUrl}` — so
`extractApiMessage` on the frontend has to guess. `RestExceptionHandler` exists but these
per-method ladders bypass it, which is also why FFP-005's "stable error codes and request
correlation IDs" only holds on the paths that happen to go through the handler.

**Suggested fix.** Map the three exception types once in `RestExceptionHandler`, delete the
per-method ladders, and give the payload a single `ErrorResponse` record (the
`common/exception/handler/error/ErrorResponse` type already exists). Keep only the genuinely
special bodies — the 409 conflict document and the `INDEX_REQUIRED` link — as subtypes.

**Resolution.** `RestExceptionHandler` now maps `IllegalArgumentException` -> 400
`VALIDATION_FAILED`, `OptimisticConcurrencyException` -> 409 `ConflictErrorResponse` (carrying
`latestDocument`), `IndexRequiredException` -> 400 `IndexRequiredErrorResponse` (carrying `indexUrl`),
and `OperationFailedException` -> 500 `REQUEST_FAILED` with its message. Every ladder and every
`Map.of("message", ...)` body is gone; controllers `throw` and return the service's `Mono` directly,
which also let most of them drop `ResponseEntity` from their signatures.

That fourth type is what made this safe. `handleThrowable` deliberately withholds the exception
message (FFP-005, pinned by
`RestExceptionHandlerTest.unexpectedErrorsReturnInternalErrorCodeWithoutLeakingDetails`), so routing
everything there would have replaced the real Firestore complaint with a bare correlation ID — a
diagnostic regression for a local workbench. Instead `GenericFirestoreService` funnels every call
through one tail, `.as(GenericFirestoreService::firestoreCall)`, which schedules the blocking SDK work
and translates failures once: contract-carrying exceptions pass through, a missing index becomes
`IndexRequiredException`, and anything else becomes an `OperationFailedException` holding the deepest
cause message — the same text the old ladders reported. That tail also removed 17 repetitions of
`.subscribeOn(Schedulers.boundedElastic())`. Index detection moved out of the workbench controller
into `IndexRequiredException.from`, so it applies to every caller instead of one endpoint. The only
per-method translation left is the nested-traversal timeout hint, which is genuinely
endpoint-specific.

---

## DUP-008 (P2) — Dead context-less service overloads

**Sites** — `GenericFirestoreService.getAllDatabases()` ([:751](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L751)),
`getAllCollections()` ([:782](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L782)),
`createDocument(String, Map)` ([:803](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L803)),
`createDocument(String, String, Map)` ([:810](../src/main/java/com/itbd/afirestore/firestore/service/GenericFirestoreService.java#L810)).

Each duplicates its `(projectId, databaseId, …)` sibling verbatim except for calling
`firestoreManagerService.getFirestore()` — the no-argument form that falls back to
`activeConnectionKey`, or to an arbitrary map entry when that key is null
(`FirestoreManagerService:143-154`). **Verified: none of the four has a caller** in
`src/main` or `src/test`; only the 5-argument `createDocument` is used
(`GenericFirestoreController:117`).

**Why it matters.** They are a loaded gun for a multi-tab app: any future caller that picks the
shorter overload writes to whichever tab initialized last, not the tab the request named. That
is a silent cross-database write with no error.

**Suggested fix.** Delete all four. If an "active connection" convenience is ever wanted, it
belongs at the controller edge where the headers are visible, not in the service.

**Resolution.** All four deleted. `FirestoreManagerService.getFirestore()` — the no-argument form they
relied on — still exists but now has no caller in `src/main`; `.claude/rules/backend/` tells future
work not to reintroduce one.

---

## DUP-009 (P2) — `baseUrl` and SSE plumbing duplicated per consumer

**Sites** — `const baseUrl = import.meta.env.VITE_BASE_URL || ""` declared three times
(`firestore-service.ts:302`, `job-client.ts:10`, `FirestoreWatchDialog.tsx:26`), and two
independent `fetchEventSource` wire-ups (`job-client.ts:25`, `FirestoreWatchDialog.tsx:71`)
repeating `openWhenHidden: true`, a silent `JSON.parse` try/catch, and the `throw error` inside
`onerror` needed to suppress the library's reconnect loop.

**Why it matters.** `FirestoreWatchDialog` builds its `X-Project-Id`/`X-Database-Id` headers
inline (`:75-77`) instead of using the builder at `firestore-service.ts:493` — a fourth copy of
DUP-004 — while `job-client` sends **no** context headers at all. If `/api/jobs/**` ever starts
requiring them (it currently resolves the job by id alone), the watch dialog keeps working and
the job stream silently 400s.

**Suggested fix.** One `apiBaseUrl` export, one `streamSse(path, { headers, onEvent, signal })`
helper owning `openWhenHidden`, parse-failure handling and reconnect suppression, and one
shared context-header builder used by axios and SSE alike.

**Resolution.** `firestore/api/sse-client.ts` exports `apiBaseUrl` and `streamSse`; `job-client` and
`FirestoreWatchDialog` both use it, and `firestore-service`'s axios headers plus both SSE streams come
from `firestoreContextHeaders`. `streamJobEvents` takes an optional `context` and both call sites pass
it, so the job stream no longer depends on `/api/jobs/**` resolving by id alone.

---

## How this was verified

Each item was confirmed by reading the cited lines, not by pattern-matching alone: helper
bodies were diffed against each other, the DUP-001 divergences were traced through Java's
`String.split` semantics to the parity check, and DUP-008's "no callers" claim comes from a
`grep` across `src/main` and `src/test`. No behaviour was changed. Nothing here is a
regression from a recent commit — these are accumulated structural duplications.

Suggested sequencing: DUP-001 and DUP-004 first (they are prerequisites that shrink DUP-002,
DUP-003 and DUP-007), then DUP-002, then the rest opportunistically. Each item should land with
tests that would fail against the pre-consolidation divergence — for DUP-001 that means a
parity table, for DUP-002 a cancellation test that runs against both entry points.
