# TanStack Query Reference

Load this before server-state fetching, mutations, query keys, cache invalidation, or duplicate API call fixes.

## Rules

- Create a single `QueryClient` configuration.
- Wrap the app with `QueryClientProvider`.
- Keep query keys typed and centralized when useful.
- Place feature-specific query/mutation hooks inside each feature's `hooks/` folder.
- Place feature API functions inside each feature's `api/` folder.
- Use TanStack Query for server state, not local UI state.
- Use local React state or feature stores for local UI state.
- Invalidate or update cache after create, update, and delete mutations.
- Avoid duplicate API calls across components.
- Avoid `useEffect` for normal server data fetching when TanStack Query is available.

## Query Key Pattern

```ts
export const userQueryKeys = {
  root: ["users"] as const,
  list: (filters: UserListFilters) => [...userQueryKeys.root, "list", filters] as const,
  detail: (userId: string) => [...userQueryKeys.root, "detail", userId] as const,
}
```

## Hook Pattern

```ts
export function useUsersQuery(filters: UserListFilters) {
  return useQuery({
    queryKey: userQueryKeys.list(filters),
    queryFn: () => userApi.list(filters),
  })
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: userApi.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.root })
    },
  })
}
```
