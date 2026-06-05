---
name: spring-flow
description: Professional repository-first development workflow for Spring Boot Java backends with Vite React TypeScript frontends using feature-driven backend packages, TanStack Router, TanStack Query, Axios, typed API contracts, clean frontend feature architecture, tests, README/docs, security, database, performance, and full-stack feature delivery.
---

# Spring Flow

Use this skill for professional Spring Boot + Vite React TypeScript development. Inspect first, preserve working behavior, prefer clean feature ownership, and keep backend/frontend contracts explicit.

## 1. Repository Inspection First

- Read the current repository structure before suggesting or changing code.
- Do not assume package names, architecture style, framework versions, routing, state management, database, or security before inspecting files.
- Detect whether the project is a monolith, modular monolith, microservice system, or small demo.
- Discover the backend base package from the active project, usually the `@SpringBootApplication` class and nearby package layout. Never hard-code a package name from this skill.
- Identify backend framework, Java version, Spring Boot version, build tool, dependencies, database access, migrations, security/auth setup, validation, exception handling, tests, and API style.
- Identify frontend framework, package manager, Vite config, TypeScript config, routes, layouts, guards, state/server-state management, API clients, schema/type files, UI library, validation, forms, styling, tests, env vars, and build scripts.
- Prefer source/manifests over stale docs: build files, package files, configs, routes, DTOs, services, tests, and existing code are the source of truth.
- Follow current folder structure, naming, coding style, architecture, dependency choices, utilities, DTOs, mappers, validators, components, hooks, and API clients unless the current approach is clearly harmful.

Recommended first-pass inspection:

```text
Backend: pom.xml/build.gradle*, settings.gradle*, application*.yml/properties, src/main/java, src/test
Frontend: package.json, lock files, vite.config.*, tsconfig*, src/routes, src/services, src/dto, src/store, src/view, shared UI
Integration: API clients, request headers, route paths, DTO/schema/type files, auth/token handling, error handling, loading/empty/failure UI
```

## 2. Bundled Resources

- Run `scripts/inspect_project.py` from the repository root for a read-only Markdown snapshot of architecture shape, package, dependencies, security/database hints, backend layers, frontend routing/state, services, schemas, and UI folders.
- Read `references/dependencies.md` when setup, versions, scripts, build commands, env vars, or dependency choices matter.
- Read `references/package-architecture.md` before package/module architecture recommendations or refactors.
- Read `references/backend-spring-feature-architecture.md` and `references/backend-patterns.md` before backend API/controller/service/repository/entity/DTO/mapper/validator/security/config/error work.
- Read `references/frontend-vite-react-ts.md` and `references/frontend-patterns.md` before frontend architecture, route, page, component, schema/type, API service, hook, state, form, or UI work.
- Read `references/tanstack-router.md` before route files, route guards, layouts, typed params, or navigation changes.
- Read `references/tanstack-query.md` before server-state queries, mutations, cache keys, invalidation, or duplicate-fetch fixes.
- Read `references/axios-api-layer.md` before HTTP client, interceptor, API error, API response, environment base URL, or typed request/response work.
- Read `references/integration-flow.md` before full-stack features or API contract reviews.
- Use `assets/api-contract-template.md` to draft API contracts.
- Use `assets/backend-feature-pattern.java.txt` and `assets/frontend-feature-pattern.ts.txt` as adaptable templates only after inspecting the active project.

## 3. Default Architecture Recommendation

- Default to `common + feature-based modules + sub-features for large domains` for most professional business applications.
- Use the active project style first. If improving structure, explain risk briefly and keep migration incremental.
- Do not blindly refactor a full project into a new architecture.
- Avoid over-split technical structures that scatter one business feature across many packages without clear ownership.

Preferred backend shape for most business apps:

```text
com.company.project
+-- common
|   +-- config
|   +-- exception
|   +-- security
|   +-- response
|   +-- pagination
|   +-- audit
|   +-- util
|   +-- constants
+-- auth
|   +-- controller
|   +-- service
|   +-- repository
|   +-- entity
|   +-- dto
|   +-- mapper
|   +-- validator
+-- user
+-- role
+-- inventory
|   +-- product
|   +-- stock
|   +-- warehouse
+-- sales
|   +-- customer
|   +-- order
+-- integration
|   +-- email
|   +-- sms
|   +-- payment
|   +-- ai
|   +-- storage
+-- ProjectApplication.java
```

Package structure ranking:

1. Feature-Based / Vertical Slice: best default for business apps with features such as user, role, product, order, customer, invoice.
2. Domain-Driven Design: best for complex enterprise systems with strong workflows and bounded contexts.
3. Clean / Hexagonal Architecture: best when long-term testability and framework independence matter.
4. Modular Monolith: best for large systems before microservices, with clear module boundaries.
5. Layer-Based: acceptable for small CRUD apps, tutorials, and demos; avoid for growing enterprise apps.
6. Microservice Multi-Project: use only for real deployment/scaling/ownership needs and operational maturity.
7. Over-Split Technical Structure: avoid.

## 4. Backend Development Rules

- Prefer feature-based package placement.
- Keep controllers thin; put business logic in services.
- Use repositories only for persistence.
- Use DTOs for request/response.
- Use mappers for entity/DTO conversion.
- Use validators for custom validation.
- Use specifications only when dynamic filtering/search is required.
- Use common response and exception handling where the project has it.
- Prefer typed request/response DTOs over raw maps for new APIs unless dynamic payloads are intentional.
- Do not expose entities directly unless the project already does so for that feature.
- Validate input at the correct layer using the existing validation style.
- Use consistent HTTP status codes, pagination, sorting, filtering, and structured errors.
- Use transactions when data consistency requires them.
- Avoid N+1 queries and inefficient database access.
- Avoid useless comments; comment only non-obvious business logic.
- Do not create unnecessary abstractions.

## 5. Frontend Development Rules

- Inspect the existing Vite React TypeScript structure before changing code.
- Detect whether the frontend already uses Vite, React, TypeScript, TanStack Router, TanStack Query, Axios, schema validation, forms, and shared UI.
- Match frontend feature structure with backend feature structure when practical.
- Prefer feature-based frontend folders for API clients, hooks, pages, components, types, schemas, and utilities.
- For clean new Vite React TypeScript apps or incremental cleanup, prefer `src/app`, `src/routes`, `src/features`, `src/shared`, `src/assets`, and `src/styles`.
- Keep route files in `src/routes`, router creation in `src/app/router/router.tsx`, generated route tree as `routeTree.gen.ts`, and route guards separate from UI components.
- Keep API calls in feature `api/` folders or the existing API/service layer. Do not call Axios directly from components.
- Keep TanStack Query hooks in feature `hooks/` folders and use Query for server state, not local UI state.
- Keep a shared Axios instance in `src/shared/api/axiosClient.ts` or the project's existing equivalent.
- Match feature type files to the project naming pattern. If feature schemas use `XXXXSchema.ts`, `XXXX` must be the feature/module name.
- Avoid `any` unless unavoidable and explained; prefer `unknown` plus narrowing for dynamic data.
- Reuse existing UI components, icons, layout, dialogs, tables, forms, toasts, styling, and validation patterns.
- Avoid unnecessary global components.
- Keep form validation consistent with the project's existing validation approach.
- Handle loading, success, error, and empty states.
- Maintain responsive behavior and avoid hardcoded values when config/constants exist.
- Do not blindly install frontend packages. Inspect `package.json` first and recommend only missing packages that the feature needs.

Preferred frontend shape for new clean Vite React TypeScript apps:

```text
src
+-- app
|   +-- main.tsx
|   +-- App.tsx
|   +-- providers
|   +-- router
+-- routes
+-- features
|   +-- auth
|   |   +-- components
|   |   +-- pages
|   |   +-- api
|   |   +-- hooks
|   |   +-- schemas
|   |   +-- types
|   |   +-- index.ts
|   +-- users
|   +-- dashboard
+-- shared
|   +-- components
|   |   +-- ui
|   |   +-- common
|   +-- api
|   +-- hooks
|   +-- types
|   +-- utils
|   +-- constants
|   +-- config
+-- assets
+-- styles
+-- vite-env.d.ts
```

## 6. Feature Development Workflow

When the user asks for a new feature:

1. Inspect related backend and frontend files.
2. Identify existing patterns and architecture shape.
3. Generate a short implementation plan.
4. Ask only necessary requirement questions.
5. If enough context exists, proceed without unnecessary questions.
6. Identify impacted modules, API contracts, route changes, query/mutation hooks, validation needs, and auth/guard behavior.
7. Define backend endpoint, request/response DTOs, validation, errors, frontend types, API call, query/mutation, and UI states.
8. Implement backend and frontend consistently.
9. Add or update tests if the project has a test setup.
10. Update README/API documentation when needed.
11. Verify build/test commands when available; if not run, say what was not verified.

## 7. README Tasks

When asked to create or update README files, document only real project facts:

- Project overview.
- Tech stack.
- Backend setup.
- Frontend setup.
- Backend structure.
- Frontend structure.
- Environment variables.
- Database setup.
- How to run locally.
- API overview.
- Folder/package structure.
- Development conventions.
- Build/deployment notes.
- Troubleshooting.

## 8. Token Efficiency And Output

- Keep outputs concise.
- Avoid long summaries and repeated unchanged code.
- Prefer patch-style explanations.
- Show only changed files unless the user asks for full files.
- If the user asks for full updated files, provide complete files.

For coding tasks:

```text
Understanding
Files to change
Plan
Code changes
Verification
Notes
```

For small fixes:

```text
Issue
Fix
Code
Verification
```

For README tasks, output the final README content directly.

## 9. Safety

- Do not blindly refactor the full project.
- Do not rename packages, entities, APIs, database schema, or frontend routes without checking impact.
- Do not change authentication/authorization behavior silently.
- Do not add heavy dependencies without justification.
- Before changing architecture, explain risk briefly.
- Preserve existing working behavior.
- Avoid generated/build file edits unless necessary.
- Never expose secrets, tokens, service account JSON, passwords, API keys, or private credentials.
