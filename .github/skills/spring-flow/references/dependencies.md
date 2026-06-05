# Dependencies And Setup Reference

Load this when setup, build commands, dependency choices, env vars, or README accuracy matter. Trust manifests and source files over README text when they disagree.

## Backend Manifest

Source: `pom.xml`

- Build tool: Maven wrapper.
- Java: `21`.
- Spring Boot parent: `4.0.6`.
- Spring Cloud: `2025.1.1`.
- Spring Cloud GCP: `8.0.2`.
- Maven-managed frontend runtime: Node `v24.12.0`, npm `11.6.2`.
- Spring dependencies in use:
  - `spring-boot-starter-webflux`
  - `spring-boot-starter-validation`
  - `springdoc-openapi-starter-webflux-ui` `3.0.3`
  - `spring-cloud-gcp-starter-data-firestore`
  - `google-cloud-firestore-admin`
  - `google-cloud-resourcemanager`
  - `spring-boot-devtools` runtime optional
  - `lombok` optional
- Test dependencies:
  - `spring-boot-starter-validation-test`
  - `spring-boot-starter-webflux-test`
- Current data/security findings:
  - Firestore / Spring Cloud GCP is present.
  - Flyway/Liquibase are not present.
  - Spring Security starter is not present.
- The Maven `frontend-maven-plugin` runs in `generate-resources`:
  - install Node/npm
  - `npm install`
  - `npm run build`
  - working directory: `src/main/frontend`

## Frontend Manifest

Source: `src/main/frontend/package.json`

- Package manager: npm, based on `package-lock.json`.
- Vite app with React and TypeScript.
- Scripts:
  - `npm run dev`: `vite --mode dev`
  - `npm run build`: `tsc -b && vite build`
  - `npm run lint`: `eslint .`
  - `npm run preview`: `vite preview`
- Core dependencies:
  - React `19.2.5`, React DOM `19.2.5`
  - Vite `8.0.10`
  - TypeScript `~6.0.2`
  - TanStack Router/Query
  - axios
  - Tailwind CSS `4.2.4`
  - shadcn CLI and local shadcn-style source components
  - lucide-react
  - sonner
  - react-hook-form and zod
  - Monaco editor, React JSON view, XYFlow, dagre, html-to-image
  - next-themes, vaul, radix-ui, Base UI
- Routing and state/data management:
  - TanStack Router
  - TanStack Query
  - local `store/` folder

## Frontend Configuration

- `vite.config.ts` uses:
  - `@tanstack/router-plugin/vite`
  - `@vitejs/plugin-react`
  - React compiler preset through Rolldown Babel plugin
  - `@tailwindcss/vite`
  - alias `@` to `src/main/frontend/src`
  - build output to `src/main/resources/static`
- `components.json` uses shadcn aliases:
  - `@/shadcn/components`
  - `@/shadcn/components/ui`
  - `@/shadcn/lib`
  - `@/shadcn/hooks`
- Environment variable names found:
  - `VITE_BASE_URL`

## Dependency Rules

- Do not add libraries when existing dependencies already solve the problem.
- Inspect `package.json`, lock files, `pom.xml`, `build.gradle*`, and existing imports before recommending dependencies.
- For backend APIs, prefer Spring WebFlux, Jakarta validation, existing exception handling, and existing Google Cloud SDK patterns.
- For frontend UI, reuse local shadcn components and lucide icons before adding UI libraries.
- For data fetching, use existing axios and TanStack Query patterns.
- For frontend validation, use existing project patterns; zod/react-hook-form are available, but do not force them into a feature that currently validates differently unless the change is justified.

## Frontend Dependency Recommendation Set

Recommend only missing packages that are actually needed:

- Core: `vite`, `react`, `react-dom`, `typescript`
- Routing: `@tanstack/react-router`, `@tanstack/router-plugin`
- Server state: `@tanstack/react-query`, `@tanstack/react-query-devtools`
- HTTP: `axios`
- Validation when needed or already used: `zod`
- Forms when needed or already used: `react-hook-form`, `@hookform/resolvers`
