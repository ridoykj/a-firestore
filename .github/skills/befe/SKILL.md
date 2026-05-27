---
name: "befe"
description: "Project-specific development guide for the a-firestore monorepo (Spring Boot WebFlux backend + React/TanStack/Tailwind/Shadcn frontend)."
---

## Scope First (Mandatory)
- Backend codebase path: `src\` (exclude `src\main\frontend\`).
- Frontend codebase path: `src\main\frontend\`.

# a-firestore Project Skill

Use this guide when implementing changes in this repository. Preserve current patterns unless explicitly asked to refactor.

## 1. Project Overview

### What this project does
- Firestore workbench for browsing, querying, editing, importing/exporting, and deep-copying Firestore data.
- Credentials are uploaded from UI and used by backend to initialize Firestore clients at runtime.

### Backend responsibilities
- Runtime Firestore connection management by project/database context.
- API endpoints for:
  - Project and database discovery.
  - Generic collection/document CRUD.
  - Query workbench (filters/order/pagination).
  - Nested traversal (documents/subcollections).
  - Firestore-to-Firestore deep copy.

### Frontend responsibilities
- Credential-driven session/tab context.
- Query builder, result table, nested traversal, document preview/edit.
- JSON/CSV import-export and Firestore-to-Firestore import workflow.

### High-level architecture
- Single Spring Boot service hosts APIs and serves built React static assets.
- Frontend build output is produced into backend static resources during Maven build.
- Data writes are performed through backend APIs (not direct browser Firestore writes in active flow).

## 2. Codebase Structure

### Backend module structure
- `src/main/java/com/itbd/afirestore`
  - Root package: app bootstrap plus runtime Firestore/GCP initialization endpoints.
  - `controller/`: REST endpoint layer.
  - `service/`: Firestore/GCP business logic.
  - `config/app`: shared app beans.
  - `config/rest`: CORS, SPA forwarding/filtering, OpenAPI, exception mapping.
  - `dto/`: request/response data contracts.
  - `exceptions/`: custom errors and API error payload contracts.

### Frontend module structure
- `src/main/frontend/src`
  - `routes/`: TanStack file-based routing.
  - `store/`: app-level context store for credentials/tabs/state.
  - `services/api/`: axios client + React Query integration.
  - `dto/`: frontend types/constants for Firestore features.
  - `view/pages/`: page-level feature UI and subcomponents.
  - `shadcn/components/ui`: local shadcn component source.
  - `shadcn/lib` and `shadcn/hooks`: shared UI utilities/hooks.

### Important configuration files
- Backend/root config:
  - `pom.xml`
  - `src/main/resources/application.yaml`
  - `README.md`
- Frontend config:
  - `src/main/frontend/package.json`
  - `src/main/frontend/vite.config.ts`
  - `src/main/frontend/components.json`
  - `src/main/frontend/eslint.config.js`
  - `src/main/frontend/tsconfig.json`
  - `src/main/frontend/tsconfig.app.json`
  - `src/main/frontend/tsconfig.node.json`
  - `src/main/frontend/.env`
  - `src/main/frontend/.env.dev`

### Important shared utilities/patterns
- Backend:
  - Central Firestore manager service for connection retrieval by project/database.
  - Generic Firestore service for CRUD/query/path semantics.
- Frontend:
  - Central Firestore API service wrapper.
  - Shared path/id/json validation helpers.
  - Shared DTO constants for query defaults and empty states.

## 3. Backend Development Guide

### Main Spring packages and responsibilities
- `com.itbd.afirestore`: bootstrapping and runtime init APIs.
- `com.itbd.afirestore.controller`: API route handlers.
- `com.itbd.afirestore.service`: Firestore/GCP operations.
- `com.itbd.afirestore.config.rest`: CORS, SPA handling, OpenAPI, global REST errors.

### Patterns in use
- Reactive controller signatures: `Mono<ResponseEntity<...>>`.
- Blocking Firestore/GCP calls wrapped in `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())`.
- Lightweight DTO usage (records + inline request/response records in controllers).
- Validation is mostly manual (path/document-id/json checks) instead of annotation-heavy DTO validation.

### Controller/service/repository/entity/security status
- Controller + service pattern: Present.
- Repository layer: Not found in current codebase.
- JPA entity layer: Not found in current codebase.
- Migration tooling (Flyway/Liquibase): Not found in current codebase.
- Security configuration (Spring Security authn/authz): Not found in current codebase.

### API route conventions
- All routes under `/api/...`.
- Dynamic Firestore routes use path-depth parity:
  - Odd segment count = collection path.
  - Even segment count = document path.
- Context headers are core contract for Firestore operations:
  - `X-Project-Id`
  - `X-Database-Id` (defaults to `"(default)"` when blank)
- Multipart credential upload is used for project/database discovery and initialization flows.

### Backend coding conventions
- Normalize and sanitize all user-provided paths/IDs early.
- Return predictable user-readable error payloads/messages.
- Keep merge-vs-replace semantics explicit:
  - Merge for update-style operations.
  - Full overwrite for replace-style operations.

## 4. Frontend Development Guide

### React app structure
- TanStack Router + React Query + local context store.
- Feature-centric UI under Firestore page modules.
- Main workbench page orchestrates state, queries, preview/edit, and import/export actions.

### Routing pattern
- File-based routing with generated route tree.
- Main routes:
  - Landing/setup route.
  - App container route.
  - Dashboard route.
  - Firestore workbench tabs route.

### State management approach
- Global/session-like state: custom context store.
- Server/cache state: TanStack Query.
- Local form/view state: component-level `useState`.

### API integration pattern
- Central axios instance + request helpers.
- One API service layer for Firestore endpoints.
- Query keys and mutations coordinated through React Query.

### Form handling approach
- Controlled inputs with explicit validation and user feedback.
- JSON editor validation combines syntax markers and semantic object-shape checks.
- `react-hook-form` dependency exists but usage was not found in active code.

### Component structure
- Page is composed from focused subcomponents:
  - Header, sidebar, nested traversal, filters, query results.
  - Create drawer, document preview panel, import dialog.
- Use local shadcn primitives consistently for dialog/sheet/form/table patterns.

### Tailwind + Shadcn conventions
- Tailwind v4 with CSS variables/tokenized theme.
- Local `cn()` helper (`clsx` + `tailwind-merge`) for class composition.
- Shadcn components are source-controlled in-repo and intended for direct composition.

### Common UI/UX conventions
- Toast notifications for action outcomes.
- Inline tone/message status objects for contextual feedback.
- Early client-side path/id/json validation before API calls.
- Unsaved-change confirmation before closing/switching edit context.

## 5. Build, Run, and Test Commands

### Backend (repo root)
- Run:
  - `./mvnw spring-boot:run`
  - Windows: `.\mvnw.cmd spring-boot:run`
- Compile:
  - `./mvnw -DskipTests compile`
- Test:
  - `./mvnw test`
- Package:
  - `./mvnw clean package`

### Frontend (`src/main/frontend`)
- Install:
  - `npm install`
- Dev:
  - `npm run dev`
- Build:
  - `npm run build`
- Lint:
  - `npm run lint`
- Preview:
  - `npm run preview`

### Environment variables
- Frontend:
  - `.env` contains `VITE_BASE_URL` defaulting to root-relative.
  - `.env.dev` contains local backend URL variant.
- Backend env file requirements: Not found in current codebase.

### Docker/deployment
- Dockerfile / docker-compose / k8s manifests: Not found in current codebase.

## 6. Development Rules for Future Changes

### Add a backend feature
1. Place endpoint in existing API group by concern.
2. Add/extend service logic first; reuse central Firestore manager/service patterns.
3. Keep blocking work on bounded elastic scheduler.
4. Validate path/document-id/context consistently before Firestore operations.
5. Maintain stable response/error shape.
6. Preserve existing header contract for context-aware endpoints.

### Add a frontend page/component
1. Add route via file-based routing convention.
2. Place view logic under feature page structure.
3. Keep API calls inside service layer; avoid direct axios scattered in components.
4. Reuse shared DTOs/helpers for validation and parsing.
5. Use React Query for server-state orchestration.

### Add or update an API endpoint
1. Keep route naming under `/api/...` conventions.
2. Add context headers when endpoint is Firestore project/database scoped.
3. Mirror contract in frontend types and service calls.
4. Wire cache invalidation/refetch where write operations affect displayed data.

### Connect frontend forms with backend APIs
1. Validate client input first (path/id/json).
2. Use central service methods.
3. Show both toast feedback and local status feedback.
4. Refresh query/nested/collection data consistently after mutations.

### Naming conventions
- Java: `PascalCase` classes, lowercase package names.
- Frontend components/types: `PascalCase`.
- Frontend utility/service modules: kebab-case naming style.

### File placement rules
- Backend APIs under backend controller package structure.
- Backend business logic under backend service package structure.
- Frontend feature UI under frontend view/page structure.
- Frontend API calls centralized in frontend service API layer.
- Shared frontend contracts under frontend DTO layer.

### Error handling rules
- Backend: clear, user-meaningful messages; preserve current exception-mapping behavior.
- Frontend: extract server message safely; show non-silent failures.

### Validation rules
- Collection path must have odd segment count.
- Document path must have even segment count.
- Document IDs cannot include `/` and cannot be `.` or `..`.
- Create/update/replace payloads must be JSON objects.

## 7. Important Gotchas

- `README.md` has details that do not fully match current implementation.
- Java version documentation and actual build property are inconsistent.
- `components.json` CSS path does not match active stylesheet location.
- OpenAPI metadata includes stale project-specific text/servers not aligned with this app.
- SPA route forwarding is handled in multiple backend places; be careful when changing static routing.
- Main Firestore workbench UI logic is state-heavy; cross-feature regression risk is high.
- Axios interceptor includes token-refresh logic that may be unrelated to active auth flow.
- Theme hook usage exists while provider wiring is unclear in current app bootstrap.
- API error payload keys are not fully uniform (`message` and `error` are both used).

## 8. Recommended Improvements (Safe Suggestions Only)

1. Align documentation/config consistency (`README.md`, Java version, `components.json` CSS path).
2. Standardize backend error payload shape across controllers.
3. Add backend tests around path validation/query behavior and frontend tests for transfer/parsing utilities.
4. Break large workbench orchestration logic into focused custom hooks.
5. Decide and complete theming architecture (provider + usage consistency) or simplify/remove unused theme wiring.
6. Review token-refresh interceptor necessity for this project and trim dead auth logic.
7. Gradually unify controller placement and response DTO conventions.
8. Consider connection lifecycle management policies for runtime Firestore client cache.
