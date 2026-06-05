# Backend Patterns Reference

Load this before backend API, controller, service, repository, entity, DTO, mapper, validator, specification, error, validation, or data-access work.

## Discovery Rules

- Discover the active backend base package from the `@SpringBootApplication` file before creating Java files.
- Detect project shape before recommending architecture: monolith, modular monolith, microservice system, or small demo.
- Place new classes under the existing package and layer folders. Do not copy package names from examples.
- Inspect nearby controllers, services, repositories, DTOs, mappers, validators, exceptions, and tests before adding a new pattern.
- Load `package-architecture.md` for package ranking and architecture recommendations.
- Load `backend-spring-feature-architecture.md` for backend/frontend feature alignment and feature package templates.

## Current Repo Pattern

- Root app, runtime GCP/Firestore services, and some controllers live directly under the active base package.
- Feature controllers also live under `controller/`.
- Services live under `service/` or the root package for existing GCP/Firestore manager classes.
- Config lives under `config/app` and `config/rest`.
- DTOs live under `dto/`; small endpoint records may also be nested in controllers.
- Exceptions and error payload records live under `exceptions/`.
- No JPA entity/repository layer or migration tool is currently present.
- No Spring Security configuration is currently present.

## Preferred Business App Placement

- Default to feature-based packages with `common` for shared infrastructure.
- Inside each feature, use only the subpackages the feature needs:
  - `controller`
  - `service`
  - `repository`
  - `entity`
  - `dto`
  - `mapper`
  - `validator`
  - `specification`
- Use `specification` only for dynamic search/filtering.
- Put shared config, exception, security, response, pagination, audit, util, and constants under `common` when the project has or needs those shared concerns.
- Align backend feature names with frontend feature names when practical.

## Controller Pattern

- APIs are under `/api/...` unless the active project uses another base route.
- WebFlux controller methods commonly return `Mono<ResponseEntity<...>>`.
- Existing Firestore APIs use headers for project/database context:
  - `X-Project-Id`
  - `X-Database-Id`, normalized to `"(default)"` when blank.
- Existing dynamic Firestore paths use path segment parity:
  - odd segment count means collection path,
  - even segment count means document path.
- Controllers do normalization and fast request validation, then delegate to services.
- Keep controllers thin and free of business logic.

Recommended new API shape:

```java
@RestController
@RequestMapping("/api/{feature}")
class FeatureController {
    private final FeatureService featureService;

    FeatureController(FeatureService featureService) {
        this.featureService = featureService;
    }

    @PostMapping
    Mono<ResponseEntity<FeatureResponse>> create(@Valid @RequestBody FeatureRequest request) {
        return featureService.create(request)
                .map(response -> ResponseEntity.status(HttpStatus.CREATED).body(response));
    }
}
```

Adapt names, package, validation, error handling, and return types to the active project.

## Service, Repository, Mapper, Validator

- Put business rules in services.
- Use repositories only for persistence.
- Use mappers for entity/DTO conversion.
- Use validators for custom validation that does not belong in annotations or service orchestration.
- Use specifications only for dynamic filtering/search.
- Existing Firestore/GCP SDK calls are blocking; wrap them with `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())`.
- Keep query limits bounded and normalize paging inputs.
- For write operations, make merge-vs-replace semantics explicit.
- For large writes, respect batch limits and avoid loading huge collections eagerly.

## DTO, Validation, Error

- Prefer typed request/response records or classes for new APIs.
- Use DTOs for request/response instead of exposing entities directly.
- Use `@Valid` and Jakarta validation when the feature uses typed DTOs.
- Manual validation is acceptable when payloads are intentionally dynamic.
- Preserve existing endpoint error contracts.
- For new APIs, prefer common response and exception handling where the project has it.
- Avoid leaking credentials, tokens, raw service account JSON, or internal stack details.

## API Best Practices

- Use clear route names and stable resource semantics.
- Return `201 Created` for successful creates when practical, `200 OK` for reads/updates, `204 No Content` for deletes without a body, and `400`/`404`/`409` for validation/not-found/conflict.
- Keep request and response DTOs versionable and explicit.
- Add pagination/filtering/sorting parameters consistently with nearby APIs.
- Document breaking changes before implementation.
- Do not add database schemas, repositories, migrations, or security frameworks unless the active project already uses them or the feature explicitly requires them.
