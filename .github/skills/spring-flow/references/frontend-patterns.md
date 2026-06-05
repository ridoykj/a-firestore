# Frontend Patterns Reference

Load this before frontend route, page, component, schema/type, API service, hook/query/mutation, UI-state, form, validation, or styling work.

## Discovery Rules

- Inspect the existing Vite React TypeScript structure before changing code.
- Identify package manager, routing, state/data management, UI library, API client, schema/type files, validation, forms, tests, env vars, and build scripts.
- Match the existing project structure unless a small improvement is clearly useful.
- Load `frontend-vite-react-ts.md` for preferred feature-based frontend architecture.
- Load `tanstack-router.md` for route, router, guard, layout, typed params, and navigation work.
- Load `tanstack-query.md` for server-state and cache work.
- Load `axios-api-layer.md` for HTTP client and typed API contracts.

## Current Structure

- Frontend root: `src/main/frontend`.
- Source root: `src/main/frontend/src`.
- Routes: `routes/`, generated tree in `routeTree.gen.ts`.
- API/service layer: `services/api/`.
- Feature DTO/schema/type files: `dto/<feature>/XXXXSchema.ts`.
- App state: `store/`.
- Pages and feature components: `view/pages/`.
- Layout: `view/layout/`.
- Shared UI: `shadcn/components/ui`, hooks in `shadcn/hooks`, utilities in `shadcn/lib`.

## Feature-Based Frontend Organization

- Match frontend feature structure with backend feature structure when practical.
- Keep feature API clients, hooks, pages, components, types, schemas, and local utilities organized by feature.
- Avoid unnecessary global components.
- Promote shared UI only after reuse is real.
- Keep business-specific UI inside `features/<feature>/components`.
- Keep reusable UI in `shared/components`.

## Routing

- Use TanStack Router file routes with `createFileRoute`.
- Add route files under `src/routes` and let the router plugin regenerate `routeTree.gen.ts` during dev/build.
- Keep page components under `view/pages` when following existing page organization.
- Use existing layout behavior from `AppShell` for app routes.

## Types And Feature Schemas

- Use feature-based schema/type files. The pattern is `XXXXSchema.ts`, where `XXXX` is the feature/module name.
- `FirestoreSchema.ts` is one example of that pattern for the Firestore feature, not a global required file.
- Keep request/response types aligned with backend DTOs.
- Prefer `unknown` plus narrowing helpers for dynamic data over `any`.
- Keep constants and empty-state defaults near feature schemas when the feature already follows that style.

## API And Query Pattern

- Use the existing axios factory from `config/axios-config.tsx`.
- Keep endpoint calls in `services/api`.
- For new clean structure, prefer feature API functions in `features/<feature>/api` and query hooks in `features/<feature>/hooks`.
- Normalize API errors through existing helper patterns such as extracting `message` or string bodies.
- Use TanStack Query for fetches, mutations, cache keys, and invalidation.
- Keep query keys stable and scoped by feature context.
- Keep context headers, auth/token handling, route params, query params, and payload shapes exactly aligned with backend contracts.
- Avoid raw Axios calls inside components.
- Avoid `useEffect` for normal server data fetching when TanStack Query is available.

## UI Pattern

- Reuse local shadcn components before custom markup.
- Use lucide-react icons for icon buttons and action labels.
- Use sonner for toast feedback.
- Use `Alert` for errors, `Empty` for empty states, `Skeleton`/`Spinner` for loading, `Badge` for compact status.
- Use responsive layouts already present in the feature.
- Keep components focused; separate API state, form state, and UI state where practical.
- Avoid raw color styling when semantic Tailwind tokens or shadcn variants already fit.

## Forms And Validation

- `react-hook-form` and `zod` are installed, but use them only where they match the feature's existing form pattern or improve a new form cleanly.
- Keep form validation consistent with the project's existing validation approach.
- For JSON/dynamic payloads, follow existing parse/narrow/validate helper patterns.
- Show validation near the field and prevent invalid submissions.

## Verification

- Run `npm run build` from `src/main/frontend` for type/build verification when frontend contracts change.
- Run `npm run lint` when lint-sensitive changes are made.
- Manually check loading, empty, error, success, responsive layout, and cache refresh behavior.
