# a-firestore Future Feature Plan

Status: Proposed  
Audience: Future coding agents, maintainers, and contributors  
Product direction: Local, single-user Firestore power tool  
Primary priority: Data safety and reliability

## Purpose

This document records the current user-facing capabilities, verified implementation gaps, and the recommended order for future work. It is intended to remain useful across separate model or engineer sessions.

The roadmap favors safe Firestore inspection and editing before adding unrelated Google Cloud products. An item is complete only when its acceptance criteria and required automated tests pass.

## Product principles

1. Never silently change or discard Firestore value types.
2. Make destructive and replacement operations explicit and previewable.
3. Detect concurrent edits instead of overwriting them silently.
4. Keep credentials in memory only; never persist credential contents.
5. Prefer cursor-based, streaming, or bounded operations for large datasets.
6. Keep the application useful as a local tool without requiring user accounts.
7. Add automated coverage with every new behavior.

## Current feature baseline

The following capabilities are implemented today.

| Area | Available user features | Main implementation |
|---|---|---|
| Connections | Upload service-account JSON, discover projects/databases, change context | `AddTabDialog`, `FirestoreSidebar`, `FirestoreManagerService` |
| Workspaces | Open, switch, and close multiple project/database tabs | `FirestoreTabsLayout`, `gcp-store` |
| Collection browsing | List, search, refresh, and open root collections | `FirestoreSidebar` |
| Nested browsing | Traverse documents/subcollections, filter IDs, navigate upward, lazy-load nodes | `FirestoreNestedTraverse`, `/api/workbench/nested` |
| Queries | Multiple AND filters, typed filter values, ordering, page size, previous/next pages | `FirestoreFilterPanel`, `/api/workbench/query` |
| Results | Responsive table/card results, current-page quick search, row selection | `FirestoreQueryResults` |
| Document creation | Root/nested collection paths, custom or generated IDs, validated JSON | `FirestoreCreateDrawer` |
| Document inspection | Editable tree, searchable graph with PNG export, Monaco JSON editor | `FirestoreDocumentPreviewPanel` and viewer components |
| Document operations | Refresh, merge update, replace through imports, single/bulk delete | `FirestorePage`, generic collection APIs |
| File transfer | JSON/CSV collection and document import/export | `firestore-transfer-utils` |
| Firestore transfer | Recursive cross-project/database copy with merge/overwrite and SSE progress | `FirestoreToFirestoreImportDialog`, `FirestoreTransferService` |
| Appearance | Application and editor light/dark themes | Theme provider and preview state |

## Verified gaps

| Gap | User or engineering impact | Evidence |
|---|---|---|
| Mobile drawer states have no visible open triggers | Collections, nested traversal, and filters can be inaccessible on narrow screens | `FirestorePage` owns the drawer state but only passes setters to drawer components |
| Bulk delete starts without a confirmation dialog | A menu click can immediately delete multiple documents | `WorkspaceControllerDeck` calls the delete handler directly |
| Firestore document deletion is non-recursive | Subcollections can remain after a parent document is deleted | Generic delete uses `DocumentReference.delete()` |
| Header connection/account controls are hardcoded | The UI can claim an emulator connection and expose a nonfunctional logout action | `FirestoreTabsLayout` |
| Firestore clients have no explicit disconnect lifecycle | Replaced or abandoned connections can remain until process exit | `FirestoreManagerService` |
| Tree deletion and merge saving disagree | Removing a key from the draft may not remove it from Firestore | Tree edits update the draft; preview save uses merge semantics |
| Raw JSON does not guarantee native type fidelity | Timestamps, references, geopoints, bytes, and numeric types can be changed during a read/write round trip | APIs use raw `Map<String, Object>` payloads |
| Query pagination uses offsets | Later pages become increasingly expensive and can shift when data changes | `GenericFirestoreService.queryCollection()` |
| Bulk deletion is sequential in the browser | Partial failure is possible and large selections are slow | `FirestorePage.handleDeleteSelectedRows()` |
| Transfer execution is not resumable or cancellable | Long copies are difficult to recover or safely stop | Deep copy exposes progress only |
| Workspace/query state is mostly ephemeral | Refreshing the browser loses tabs, paths, filters, and table state | State is component memory except theme preferences |
| Automated coverage is minimal | Regressions in CRUD, queries, and transfers are hard to detect | Only the Spring context-load test exists |
| Error logging and API metadata contain placeholders | Diagnostics and generated documentation can be misleading | `RestExceptionHandler`, `OpenApi3Config` |

## Roadmap conventions

Priorities:

- **P0:** Correctness, safety, or severe usability issue.
- **P1:** High-value capability required by later features.
- **P2:** Productivity improvement.
- **P3:** Advanced or optional capability.

Statuses:

- `Proposed`: Approved direction, not started.
- `In progress`: Active implementation exists.
- `Blocked`: A named dependency or external issue prevents progress.
- `Done`: Acceptance criteria and tests pass.
- `Deferred`: Intentionally removed from the active roadmap.

## Phase 0: Baseline safety

| ID | Priority | Status | Feature | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| FFP-001 | P0 | Proposed | Mobile workspace controls | None | Narrow layouts expose keyboard-accessible buttons that open collections, nested traversal, and filter drawers; each drawer can be closed and focus returns to its trigger. |
| FFP-002 | P0 | Proposed | Destructive-action confirmation | None | Bulk delete shows project, database, count, and sample paths; cancel performs no requests; confirmation states that subcollections are not recursively deleted. |
| FFP-003 | P0 | Proposed | Real connection status and disconnect | None | Remove placeholder account/emulator UI; show the active connection mode and context; disconnect clears frontend context and closes the matching backend client. |
| FFP-004 | P0 | Proposed | Firestore client lifecycle | FFP-003 | Reinitialization closes replaced clients; explicit disconnect is supported; all clients close during application shutdown; lifecycle behavior is tested. |
| FFP-005 | P0 | Proposed | Structured diagnostics and correct API metadata | None | Remove stack-trace printing and stale branding; errors have stable codes and request correlation IDs; Swagger describes the actual application and endpoints. |
| FFP-006 | P0 | Proposed | Automated test foundation | None | Add frontend unit tests, backend unit/integration tests, a Firestore-emulator test profile, and browser E2E support with documented commands. |

Phase 0 completion gate:

- All current critical flows still build and pass.
- Destructive actions require explicit confirmation.
- Mobile workspace navigation is usable.
- Connection indicators reflect real application state.
- CI can run the new automated test suites.

## Phase 1: Data integrity

| ID | Priority | Status | Feature | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| FFP-101 | P0 | Proposed | Canonical Firestore value model | FFP-006 | Integers, doubles, timestamps, geopoints, references, bytes, arrays, maps, strings, booleans, and null survive API and import/export round trips without type loss. |
| FFP-102 | P0 | Proposed | Explicit merge and replace saves | FFP-101 | The editor labels the selected save mode, defaults safely, previews affected fields, and never performs an implicit replacement. |
| FFP-103 | P0 | Proposed | Real field deletion | FFP-101, FFP-102 | Tree/JSON deletions produce explicit field-delete paths in merge mode; nested field and array behavior is documented and tested. |
| FFP-104 | P0 | Proposed | Optimistic concurrency and conflict diff | FFP-101, FFP-102 | Reads include `updateTime`; stale writes return HTTP 409; users can reload, compare, or intentionally overwrite after reviewing a diff. |
| FFP-105 | P1 | Proposed | Cursor pagination | FFP-101 | Query navigation no longer uses Firestore offsets; ordered values and document ID form a stable cursor; tests show no duplicates or skipped documents. |
| FFP-106 | P0 | Proposed | Atomic bulk delete | FFP-002, FFP-006 | A backend batch deletes at most 500 validated document paths atomically and returns a structured result; frontend sequential deletion is removed. |

Phase 1 completion gate:

- Every supported Firestore value round-trips exactly.
- Merge, replace, and delete semantics are visible and testable.
- Concurrent changes cannot be silently overwritten.
- Query pages remain stable under duplicate sort values.
- Bulk delete is confirmed and atomic.

## Phase 2: Query productivity

| ID | Priority | Status | Feature | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| FFP-201 | P1 | Proposed | Restorable workspaces | FFP-003 | Persist tab metadata, paths, filters, and column preferences without credential contents; restored tabs require credential reattachment before requests. |
| FFP-202 | P2 | Proposed | Saved queries, favorites, and history | FFP-201 | Queries can be named, rerun, exported, and deleted; history is bounded per project/database and excludes secrets. |
| FFP-203 | P1 | Proposed | Advanced query builder | FFP-105 | Support OR groups, collection-group queries, multiple order clauses, validation of unsupported combinations, and actionable index-error guidance. |
| FFP-204 | P2 | Proposed | Configurable result tables | FFP-201 | Users can show, hide, reorder, resize, and pin columns; nested values have an inspector; preferences restore per collection. |
| FFP-205 | P1 | Proposed | Firestore Emulator profiles | FFP-003, FFP-006 | Users can connect to an explicit emulator host/project/database without credentials; status clearly distinguishes emulator and Google Cloud. |
| FFP-206 | P2 | Proposed | Keyboard shortcuts and command palette | FFP-001 | Searchable commands cover query execution, create, preview, save, tab switching, and panel toggles without overriding editor shortcuts. |

Phase 2 completion gate:

- A browser refresh preserves non-secret work state.
- Common queries can be saved and rerun quickly.
- Emulator use is explicit and testable.
- Advanced filters fail early with useful guidance.

## Phase 3: Advanced data operations

| ID | Priority | Status | Feature | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| FFP-301 | P2 | Proposed | Document and collection comparison | FFP-101, FFP-104 | Compare two documents or collection samples with type-aware added/removed/changed output and exportable results. |
| FFP-302 | P2 | Proposed | Schema profiler and validation | FFP-101 | Report field frequency, observed types, nullability, and conflicts; optional local rules validate before writes without changing Firestore rules. |
| FFP-303 | P1 | Proposed | Previewable bulk edit | FFP-101, FFP-104, FFP-106 | Users select documents, define a typed patch, review a dry run, and execute bounded batches with conflict reporting. |
| FFP-304 | P1 | Proposed | Streaming backup and restore | FFP-101 | Backups preserve paths and native types, process data in bounded chunks, include a manifest/version, and support restore preview and conflict policy. |
| FFP-305 | P1 | Proposed | Durable transfer jobs | FFP-101, FFP-304 | Deep copy supports previewed mappings, deduplicated selections, cancellation, resumability, committed-progress counts, and downloadable failure reports. |
| FFP-306 | P3 | Proposed | Real-time watch mode | FFP-104, FFP-105 | Users can start/stop document or collection listeners; updates stream over SSE, show connection state, and never overwrite an unsaved draft. |

Phase 3 completion gate:

- Large operations are bounded, previewable, cancellable where possible, and report partial outcomes.
- Backup and migration artifacts preserve Firestore types.
- Real-time updates coexist safely with local edits.

## API and type direction

Internal breaking changes are allowed because the backend and frontend ship together. Update Swagger and this document whenever a contract changes.

### Typed document contract

Replace raw document maps with a DTO containing:

```text
DocumentDto
  id
  path
  fields: map<string, FirestoreValue>
  createTime
  updateTime
  subcollections
```

`FirestoreValue` should follow the canonical Firestore REST value model, using one explicit value kind per node. It must distinguish integer and double values and support all types named in FFP-101.

### Safe write contract

```text
DocumentWriteRequest
  mode: MERGE | REPLACE
  fields: map<string, FirestoreValue>
  deleteFieldPaths: string[]
  expectedUpdateTime: timestamp | null
```

Rules:

- `MERGE` changes submitted fields and applies explicit field deletions.
- `REPLACE` makes the submitted field map authoritative.
- `expectedUpdateTime` is required for editing an existing document.
- A precondition mismatch returns HTTP 409 with the latest document metadata.
- Server transforms, if later added, must be explicit operations rather than magic string values.

### Cursor query contract

Replace page-number requests with:

```text
QueryRequest
  path
  filterTree
  orderBy[]
  limit
  cursor

QueryResponse
  documents[]
  nextCursor
  hasMore
  elapsedMs
```

Always add document ID as the final deterministic ordering key. Treat cursors as opaque outside the backend.

### Bulk and job contracts

- Bulk delete accepts one context and at most 500 unique, validated document paths.
- Transfer/backup operations become jobs with create, status/event stream, cancel, and result-report operations.
- Progress counts committed documents, not merely queued writes.
- Cancellation is best effort and reports the last committed checkpoint.

### Transfer format compatibility

- Add a top-level `formatVersion`.
- New formats use typed Firestore values.
- Retain parsers for existing unversioned JSON/CSV files where values can be interpreted safely.
- Reject ambiguous legacy values instead of silently guessing a Firestore type.

## Security and privacy invariants

- Never store service-account JSON, access tokens, or credential-derived secrets in local storage, session storage, IndexedDB, logs, examples, exports, URLs, or error messages.
- Persist only non-secret workspace metadata.
- Keep the default product mode local and single-user.
- Validate all paths and operation limits on the backend even when the frontend already validates them.
- Do not add multi-user authentication, public hosting, or cloud credential storage as part of this roadmap.

## Verification strategy

### Frontend unit tests

- Query/filter serialization and validation.
- Typed value editor conversion and error states.
- Merge/replace mode and deleted-field tracking.
- Conflict dialog and diff decisions.
- Bulk-delete confirmation and cancellation.
- Workspace restoration without credential persistence.
- Mobile drawer triggers and keyboard navigation.

### Backend unit and integration tests

- Round-trip every supported Firestore value.
- Merge, replace, field deletion, and update-time preconditions.
- Cursor encoding/decoding and deterministic pagination.
- Atomic bulk-delete validation and batch limits.
- Firestore client replacement, disconnect, and shutdown.
- Transfer selection deduplication, checkpoints, cancellation, and failure reports.

### Emulator-backed browser E2E

Cover:

1. Connect to the emulator.
2. Create root and nested documents.
3. Query, filter, order, and paginate.
4. Edit values, delete fields, replace a document, and handle a stale-write conflict.
5. Select and bulk-delete documents.
6. Export and restore typed data.
7. Preview, run, cancel, and resume a deep-copy job.
8. Restore a workspace and reattach its connection safely.

### Documentation checks

- Verify all relative Markdown links.
- Run `git diff --check`.
- Confirm roadmap statuses match implemented behavior.
- Update the README feature list when a user-facing item reaches `Done`.

## Instructions for future agents

1. Read this file, the README, and the current implementation before selecting work.
2. Do not assume a roadmap item is absent solely because its status says `Proposed`; verify the code first.
3. Work on dependencies before dependent items.
4. Change an item to `In progress` only when implementation begins.
5. Add or update automated tests in the same change as the feature.
6. Never place real credential data in code, fixtures, tests, logs, screenshots, or documentation.
7. Preserve unrelated user changes in the worktree.
8. Mark an item `Done` only after its acceptance criteria and verification pass.
9. Record material contract decisions in the API section.
10. Keep this roadmap and the README synchronized with delivered user behavior.

## Deferred work

The following are intentionally outside the active roadmap:

- Multi-user authentication and role-based access control.
- Public SaaS deployment.
- Persistent cloud credential vaults.
- BigQuery and other Google Cloud products.
- Mobile-native applications.

Revisit these only after the local Firestore tool is safe, reliable, and well tested.
