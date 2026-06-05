# API Contract: {{FEATURE_NAME}}

## Endpoint

- Method: `{{METHOD}}`
- Path: `{{PATH}}`
- Auth/permissions: `{{AUTH_OR_PERMISSION}}`
- Headers:
  - `{{HEADER_NAME}}`: `{{HEADER_PURPOSE}}`
- Route params: `{{ROUTE_PARAMS}}`
- Query params: `{{QUERY_PARAMS}}`

## Request

```json
{{REQUEST_JSON}}
```

Validation:

- `{{FIELD}}`: `{{RULE}}`

## Response

Status: `{{SUCCESS_STATUS}}`

```json
{{RESPONSE_JSON}}
```

## Errors

- `400`: `{{BAD_REQUEST_CASE}}`
- `401/403`: `{{AUTH_CASE}}`
- `404`: `{{NOT_FOUND_CASE}}`
- `409`: `{{CONFLICT_CASE}}`
- `500`: `{{SERVER_ERROR_CASE}}`

## Frontend Contract

- Schema/type file: `src/main/frontend/src/dto/{{feature-folder}}/{{FeatureName}}Schema.ts`
- API service function: `{{serviceFunction}}`
- Query/mutation hook: `{{hookName}}`
- Cache keys invalidated/refetched: `{{cacheKeys}}`
- Page/component state: `{{loading_empty_error_success_states}}`
- Feature folder alignment: `{{backend_feature}}` <-> `{{frontend_feature}}`

## Verification

```text
Backend build/test passes.
Frontend TypeScript/build passes.
Request succeeds with valid input.
Validation rejects invalid input.
Error response renders correctly.
Loading/empty/success states render correctly.
Existing behavior is unchanged.
```
