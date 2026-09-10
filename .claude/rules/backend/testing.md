---
paths:
  - "src/test/java/**/*.java"
  - "src/test/resources/**"
---

# Backend rules: tests

Stack: JUnit 5 + AssertJ (`assertThat`, `assertThatThrownBy`) + Mockito. For Spring beans use
`@MockitoBean`, not the removed `@MockBean`.

Run them without the Node/npm build steps:

```bash
./mvnw test -Dskip.installnodenpm -Dskip.npm
```

Single class or method:

```bash
./mvnw test -Dtest=QueryCursorCodecTest -Dskip.installnodenpm -Dskip.npm
```

## Which layer to test in

- **Pure logic** (`QueryCursorCodec`, `JobRegistry`, path/validation helpers) — plain unit tests, no
  Spring context. Prefer these; they are the fast majority.
- **Service behaviour against the SDK** — mock `Firestore`/`WriteBatch`/`Query` and assert with
  `ArgumentCaptor` what was sent (see `GenericFirestoreServiceTest`). This is how batch caps,
  optimistic-concurrency guards, and query construction are pinned.
- **Wire format** — through the real HTTP stack with `WebTestClient`
  (`DocumentDtoWireFormatTest`). A hand-built `ObjectMapper` proves nothing here; see
  `.claude/rules/backend/wire-contract.md`.

## Traps

- A test-only `@RestController` must map under `/api/**`. Anything else is forwarded to the SPA by
  `SpaWebFilter`, and the test fails with "Could not resolve view 'forward:/'" rather than a useful
  assertion.
- Integration tests use `@SpringBootTest @ActiveProfiles({"test", "emulator"})` with
  `src/test/resources/application-emulator.yaml`, which points the emulator at **`localhost:8080` —
  the same port the app itself uses**. Don't run the app and these tests at once. Testcontainers
  (`gcloud` module) is available if you need a real emulator container instead.
- Tests must not require a service-account JSON or network access to Google. Anything that would need
  real credentials belongs behind the emulator profile or a mock.
- When you fix a bug covered by a `FFP-###` or `DUP-###` item, add the regression test in the same
  change and reference the id in the test name or a comment, so the next reader can trace it.
