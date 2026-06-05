# Backend Spring Feature Architecture Reference

Load this before backend feature package design or backend/frontend feature alignment.

## Preferred Feature Shape

```text
src/main/java/com/company/project/users/
+-- controller/
+-- service/
+-- repository/
+-- dto/
+-- mapper/
+-- model/
+-- validation/
```

Use `entity/` instead of `model/` if the active project uses `entity`. Use `validator/` instead of `validation/` if that is the local style.

## Common Layer

Use `common` for shared infrastructure only:

```text
common/
+-- config/
+-- exception/
+-- security/
+-- response/
+-- pagination/
+-- audit/
+-- util/
+-- constants/
```

## Backend And Frontend Alignment

Match business feature names when practical:

```text
Backend:  src/main/java/com/company/project/users/
Frontend: src/features/users/
```

Avoid backend `user` and frontend `accountUsers` naming drift unless the business meaning is different.

## Backend Rules

- Controller: HTTP boundary only.
- Service: business logic and orchestration.
- Repository: persistence only.
- DTO: request/response contracts.
- Mapper: entity/DTO conversion.
- Validation: custom validation.
- Exception: common structured errors.
- Security: authentication/authorization configuration and permission checks.
- Config: framework/infrastructure configuration.
- Specification: dynamic filtering/search only.

Do not create all folders automatically. Create only the folders needed by the feature.
