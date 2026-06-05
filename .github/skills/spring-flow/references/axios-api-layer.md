# Axios API Layer Reference

Load this before HTTP client, API service, interceptor, API error, API response, or environment base URL work.

## Rules

- Create a shared Axios instance in `src/shared/api/axiosClient.ts` or follow the existing equivalent.
- Configure `baseURL` from environment variables.
- Add request interceptors for auth token handling where applicable.
- Add response interceptors for centralized error handling where applicable.
- Avoid raw Axios calls inside components.
- Avoid hardcoded API URLs in feature code.
- Keep API response and error types centralized.
- Use typed request and response contracts.

## Suggested Shared Files

```text
src/shared/api/
+-- axiosClient.ts
+-- apiError.ts
+-- apiResponse.ts
```

## Axios Client Pattern

```ts
import axios from "axios"

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
})

axiosClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access-token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

Adapt token storage, refresh behavior, and error shape to the active project.

## Feature API Pattern

```ts
export const userApi = {
  list: (params: UserListParams) =>
    request<UserListResponse>(() => axiosClient.get("/users", { params })),
  create: (payload: CreateUserRequest) =>
    request<UserResponse>(() => axiosClient.post("/users", payload)),
}
```
