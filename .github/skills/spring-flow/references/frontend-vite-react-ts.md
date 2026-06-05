# Frontend Vite React TypeScript Reference

Load this before frontend architecture, feature folder, shared UI, layout, schema/type, or dependency work.

## Inspect First

- Detect the frontend root before editing. Common roots: `src/main/frontend`, `frontend`, `web`, or repository root.
- Read `package.json`, lock file, `vite.config.*`, `tsconfig*`, `src/routes`, `src/app`, `src/features`, `src/shared`, current API clients, schema/type files, stores, layouts, and UI components.
- Do not force a new structure if the existing structure is clean, consistent, and working.
- Improve incrementally around the feature being touched.

## Preferred Structure

Use this for new clean Vite React TypeScript projects or gradual cleanup:

```text
src/
+-- app/
|   +-- main.tsx
|   +-- App.tsx
|   +-- providers/
|   |   +-- AppProvider.tsx
|   |   +-- QueryProvider.tsx
|   |   +-- RouterProvider.tsx
|   +-- router/
|       +-- router.tsx
|       +-- routeTree.gen.ts
|       +-- routeGuards.ts
+-- routes/
|   +-- __root.tsx
|   +-- index.tsx
|   +-- login.tsx
|   +-- dashboard.tsx
|   +-- users/
|       +-- index.tsx
|       +-- create.tsx
|       +-- $userId.tsx
+-- features/
|   +-- auth/
|   |   +-- components/
|   |   +-- pages/
|   |   +-- api/
|   |   +-- hooks/
|   |   +-- schemas/
|   |   +-- types/
|   |   +-- index.ts
|   +-- users/
|   |   +-- components/
|   |   +-- pages/
|   |   +-- api/
|   |   +-- hooks/
|   |   +-- schemas/
|   |   +-- types/
|   |   +-- index.ts
|   +-- dashboard/
|       +-- components/
|       +-- pages/
|       +-- api/
|       +-- hooks/
|       +-- types/
|       +-- index.ts
+-- shared/
|   +-- components/
|   |   +-- ui/
|   |   +-- common/
|   +-- api/
|   |   +-- axiosClient.ts
|   |   +-- apiError.ts
|   |   +-- apiResponse.ts
|   +-- hooks/
|   +-- types/
|   +-- utils/
|   +-- constants/
|   +-- config/
+-- assets/
|   +-- images/
|   +-- icons/
+-- styles/
|   +-- globals.css
+-- vite-env.d.ts
```

## Feature Ownership

- Match backend and frontend business feature names when practical.
- Keep business-specific UI in `features/<feature>/components`.
- Keep feature pages in `features/<feature>/pages` and thin route files in `routes`.
- Keep feature API functions in `features/<feature>/api`.
- Keep feature query/mutation hooks in `features/<feature>/hooks`.
- Keep schemas and types near the feature that owns them.
- Keep reusable UI in `shared/components/ui` or `shared/components/common`.
- Use barrel exports only when they improve readability and do not create circular imports.

## Dependency Guidance

Inspect `package.json` before recommending packages. Recommend missing packages only when the feature needs them.

- Core: `vite`, `react`, `react-dom`, `typescript`
- Routing: `@tanstack/react-router`, `@tanstack/router-plugin`
- Server state: `@tanstack/react-query`, `@tanstack/react-query-devtools`
- HTTP: `axios`
- Validation when already used or needed: `zod`
- Advanced forms when already used or needed: `react-hook-form`, `@hookform/resolvers`

## Coding Rules

- Use TypeScript strictly.
- Avoid duplicate components, services, hooks, or types.
- Prefer small cohesive files.
- Keep API logic out of components.
- Avoid unnecessary global components.
- Reuse existing UI and patterns.
- Keep summaries short and mention only changed files and important decisions.
