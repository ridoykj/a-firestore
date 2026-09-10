---
paths:
  - "src/main/java/**/*Controller.java"
---

# Backend rules: controllers

Applies to `com.itbd.afirestore.**.controller`. Each one is a `@RestController` with a class-level
`@RequestMapping("/api/…")` and returns DTOs or `Flux<ServerSentEvent<…>>` directly — there is no
mapper layer to add.

## Connection context is per request, never implicit

- Any endpoint touching Firestore data declares both headers and passes them down:

  ```java
  @RequestHeader("X-Project-Id") String projectId,
  @RequestHeader(value = "X-Database-Id", required = false) String databaseId
  ```

- Never call the no-arg `FirestoreManagerService.getFirestore()`. It resolves `activeConnectionKey`
  — whichever connection was initialised last — so a request naming database A can read or write
  database B. Always use `getFirestore(projectId, databaseId)`, and never add a service overload that
  drops the context (four such overloads existed and were deleted as DUP-008).
- A blank `databaseId` means `(default)`. Normalise it with `FirestoreIds.normalizeDatabaseId`; do not
  re-implement the fallback inline. That mapping also keys the connection registry, so a private copy
  that trims differently silently addresses a different connection (DUP-004).

## URL mapping

- Map **only** under `/api/**`. `ReactForwardController` + `SpaWebFilter` forward every other
  non-asset GET to the SPA, so a controller at e.g. `/test/ping` fails at runtime with
  "Could not resolve view 'forward:/'". This applies to test-only controllers too.
- Firestore paths arrive via wildcard mappings (`@GetMapping("/**")`) and the controller pulls the
  tail out of the request itself (`extractFirestorePath`). Don't switch to `@PathVariable` — the
  path contains slashes.
- Odd segment count = collection, even = document. Use `FirestorePaths.isCollection` /
  `isDocument` / `requireDocument`; never inline `path.split("/").length % 2`. Java's `split` keeps
  leading and interior empty segments, so an inline copy fed by different slash-stripping reaches a
  different verdict — that is exactly what DUP-001 was.

## Errors

Controllers throw; they do not format errors. `RestExceptionHandler` (`@RestControllerAdvice`) is
the only place a response body is built, so every endpoint returns the same shape with a correlation
ID (DUP-007 removed ~26 ad-hoc bodies and the per-method `onErrorResume` ladders — don't reintroduce
either).

| Throw | Becomes |
| --- | --- |
| `IllegalArgumentException` | `400` `VALIDATION_FAILED` with your message |
| `NotFoundException` | `404` `NOT_FOUND` |
| `OptimisticConcurrencyException` | `409` `CONFLICT` + `latestDocument` |
| `IndexRequiredException` | `400` `INDEX_REQUIRED` + `indexUrl` |
| `OperationFailedException` | `500` `REQUEST_FAILED` with your message |
| anything else | `500` `INTERNAL_ERROR`, message withheld |

- That last row is deliberate and tested: an unanticipated error returns only a correlation ID. When
  a failure *should* be reported to the user, throw `OperationFailedException` — don't widen
  `handleThrowable`.
- The `409` and `INDEX_REQUIRED` payloads carry their extra field on purpose; the frontend maps them
  to `FirestoreConflictError` / `FirestoreIndexError`, so keep `latestDocument` and `indexUrl` at the
  top level.
- Prefer returning the service's `Mono` directly. Most handlers here need no `ResponseEntity` at all.

## Streaming endpoints

Return `Flux<ServerSentEvent<…>>` (see `/api/transfer/deep-copy`, `/api/workbench/watch`,
`/api/jobs/{id}/events`). Name every event type — the frontend switches on `event.event`. A client
disconnect surfaces as `AsyncRequestNotUsableException`, which the advice already downgrades to
`204`; don't log it as an error again. Long-running work belongs in a `JobRegistry` job so it stays
cancellable, not inline in the request thread.

## OpenAPI

`/docs` and `/v3/api-docs` are generated from these classes. New endpoints get a summary and
described responses; `RestExceptionHandler` is `@Hidden` on purpose, so don't document error bodies
per endpoint.
