---
paths:
  - "src/main/java/**/dto/*.java"
  - "src/main/java/**/exception/**/*.java"
---

# Backend rules: JSON wire contract

Applies to `com.itbd.afirestore.firestore.dto` and the error payload records. This contract is
mirrored by hand in the frontend, so a change here is a change in two repos' worth of code.

## Jackson 3, not Jackson 2

Spring Boot 4 encodes WebFlux responses with **Jackson 3 (`tools.jackson`)** and silently ignores
Jackson 2 (`com.fasterxml`) annotations — no error, the annotation just does nothing.

- Custom serializers, deserializers, and `@JsonValue`/`@JsonCreator`-style wiring must come from
  `tools.jackson.databind.annotation` / `tools.jackson.databind`.
- `AppConfig`'s `ObjectMapper` bean is a Jackson 2 mapper and is **not** what the codecs use, despite
  what its javadoc claims. Don't reason about wire format from that bean.
- Verify wire format through the real HTTP stack (`WebTestClient`, as `DocumentDtoWireFormatTest`
  does), never with a hand-built `ObjectMapper` — a hand-built mapper can pass while the actual
  response is wrong.

## FirestoreValue is a closed taxonomy

`FirestoreValue` is a sealed interface mirroring the Firestore REST value representation: every node
on the wire is an object with exactly **one** kind.

```json
{"stringValue": "a"}   {"integerValue": "42"}   {"mapValue": {"fields": {…}}}
```

Rules that must not regress:

- Integers travel as JSON **strings** (`"42"`). Firestore integers are int64 and JS numbers are not —
  emitting a bare number silently corrupts large IDs.
- Timestamps, references, geo points, and bytes keep their own kinds. Never collapse them to
  `stringValue` for convenience; the frontend's viewers and diff rely on the kind.
- `DocumentDto` is `Map<String, FirestoreValue> fields` plus `createTime` / `updateTime`. Don't add a
  parallel "plain JSON" field to the DTO — unwrapping is the frontend's job
  (`unwrapFirestoreFields`).
- Adding a kind means updating the sealed permits list, the serializer, and
  `Deserializer.fromNode` here, then `FIRESTORE_VALUE_KINDS` in `firestore-value-utils.ts`. Both sides
  are now compile-checked — the frontend used to restate the taxonomy in four `default:`-terminated
  switches that silently degraded a new kind (DUP-005).

## Error payloads

`ErrorResponse(httpStatus, errorCode, message, correlationId, fieldErrors)` is the single error shape,
produced by `RestExceptionHandler`. `errorCode` values are the client's contract — treat them as
stable strings, add new ones rather than renaming. `correlationId` also appears in the server log
line for that request, so keep it in every response.
