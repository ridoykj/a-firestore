# Integration Flow Reference

Load this before full-stack features, API contract work, or backend/frontend contract reviews.

## Contract First

Define the contract before coding:

- HTTP method and endpoint.
- Route params, query params, headers.
- Auth/token/permission behavior.
- Request DTO/payload.
- Response DTO/payload.
- Validation rules.
- Error cases and status codes.
- Frontend type/schema file using the feature-based `XXXXSchema.ts` pattern.
- API service function and query/mutation hook.
- Loading, empty, success, error, and cache invalidation behavior.

## Backend To Frontend Flow

1. Discover the active backend package and feature folder pattern.
2. Place backend code in the feature module or sub-feature module, using `common` only for shared concerns.
3. Add or update typed backend DTOs where practical.
4. Keep controller validation thin and delegate business logic to the service.
5. Return a stable response shape and existing error format.
6. Add frontend request/response types in the feature schema/type file.
7. Add API service calls in the existing service layer.
8. Add TanStack Query fetch/mutation wrappers and invalidate scoped query keys after writes.
9. Connect page/component state to loading/error/empty/success UI.
10. Verify route, headers, params, payload, response, and cache behavior match.

## Feature Alignment Example

```text
Backend:
src/main/java/com/company/project/users/
+-- controller/
+-- service/
+-- repository/
+-- dto/
+-- mapper/
+-- model/
+-- validation/

Frontend:
src/features/users/
+-- components/
+-- pages/
+-- api/
+-- hooks/
+-- schemas/
+-- types/
+-- index.ts
```

## Error Handling

- Preserve existing endpoint error contracts.
- For new APIs, prefer structured errors with status, exception/name, message, and field errors when that matches backend conventions.
- Frontend API helpers should turn backend errors into user-readable `Error` messages.
- UI should show errors with existing components/toasts and avoid exposing secrets or raw credential content.

## Naming Rules

- Backend DTO names should match the active feature/module.
- Frontend type/schema files should match the active feature/module, for example `UserSchema.ts`, `OrderSchema.ts`, or the current feature's equivalent.
- Do not treat one feature's schema filename as a global convention.
- Keep backend DTO fields and frontend TypeScript property names consistent unless a mapper deliberately translates them.

## Verification Checklist

```text
Backend endpoint exists and returns expected status.
Request payload matches backend DTO.
Response payload matches frontend type.
Validation rejects invalid input.
Frontend API route, params, headers, and body match backend.
Loading state renders.
Empty state renders.
Error state renders with useful message.
Success path updates UI and invalidates/refetches data.
Existing feature behavior remains intact.
```
