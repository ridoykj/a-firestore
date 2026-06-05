# TanStack Router Reference

Load this before route, router, guard, layout, typed navigation, or route parameter work.

## Rules

- Prefer file-based routing when suitable.
- Keep route files inside `src/routes`.
- Keep router creation inside `src/app/router/router.tsx` or the project's existing router setup file.
- Keep generated route tree as `routeTree.gen.ts`.
- Use typed navigation and typed route params.
- Keep route guards separate from UI components, preferably in `src/app/router/routeGuards.ts`.
- Use layout routes for authenticated/private sections.
- Avoid placing business logic directly inside route files.
- Keep route files thin and delegate feature logic to feature modules.

## Route File Pattern

- Route file handles route declaration, loader/search validation when needed, and page composition.
- Feature page handles feature UI.
- Feature hooks handle server data.
- Feature API handles HTTP calls.

Example:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { UsersPage } from "@/features/users/pages/UsersPage"

export const Route = createFileRoute("/users/")({
  component: UsersPage,
})
```

## Guard Guidance

- Keep auth checks and redirects reusable.
- Avoid embedding auth business logic inside every route component.
- Preserve existing guard/session patterns if already present.
