# a-firestore

`a-firestore` is a local web workbench for exploring and managing Google Cloud Firestore. It combines a Spring Boot WebFlux API with a React application and supports multiple project/database contexts, nested data browsing, document editing, and data transfer.

See the [future feature plan](docs/FUTURE_FEATURE_PLAN.md) for the prioritized product and engineering roadmap.

## User features

### Connections and workspaces

- Upload a Google Cloud service-account JSON file and discover accessible projects and Firestore databases.
- Open several project/database contexts as tabs and switch between them without leaving the workspace.
- Change the project or database inside an open tab.
- See the real connection status (emulator or service account) for the active tab and disconnect it, which also closes the backend Firestore client.
- Search and refresh root collections.
- Switch between light and dark themes.
- On narrow screens, open the collections, nested-browser, and filter drawers from dedicated toolbar buttons.

### Browse and query data

- Query root collections or nested collection paths such as `users/user-id/posts`.
- Traverse documents and subcollections in a separate nested browser.
- Filter nested nodes by document or collection ID, navigate to a parent path, and load long lists incrementally.
- Add multiple server-side `where` clauses using AND logic.
- Use Firestore operators including `==`, `!=`, comparisons, `array-contains`, `array-contains-any`, `in`, and `not-in`.
- Enter typed filter values as strings, numbers, booleans, nulls, arrays, or ISO-8601 timestamps.
- Order results by field and direction, set the page size, and move between result pages using stable cursors (document IDs always break ties, so pages never skip or repeat documents while data changes).
- Quick-search the rows on the current page.
- Select individual or all visible rows for bulk actions.

### Create, inspect, edit, and delete

- Create documents in root or nested collections.
- Use a custom document ID, leave it empty for a Firestore-generated ID, or generate an ID in the UI.
- Author and format payloads in a Monaco JSON editor with syntax validation.
- Open documents from query results or the nested browser.
- Inspect a document in three views:

  - **Tree:** expand, collapse, copy, add, edit, or remove JSON values in the draft.
  - **Graph:** visualize nested data, search nodes, zoom, fit the graph, and export it as PNG.
  - **JSON:** edit and format raw JSON with validation and light/dark editor themes.

- Save with an explicit, labeled mode: **Merge** (default; updates submitted fields and explicitly deletes fields you removed from the draft) or **Replace** (the draft becomes the whole document), with a live preview of the fields the save will add, change, and delete.
- Native Firestore value types survive editing round trips: timestamps, references, geo points, bytes, and the integer/double distinction are preserved for values you did not change.
- Concurrent edits are detected: a stale save returns a conflict dialog that shows the latest server version next to your draft so you can reload, keep editing, or intentionally overwrite.
- Refresh a document from Firestore or delete it with confirmation (deletes are guarded by the document's last-seen update time).
- Receive a warning before closing or switching away from an unsaved JSON draft.
- Delete up to 500 selected documents in one atomic backend batch after a confirmation that lists the target project, database, and document paths and warns that subcollections are not recursively deleted; either all confirmed documents are deleted or none are.

### Import, export, and migration

- Export the current query page, the full collection, or selected rows as JSON or CSV.
- Import a JSON or CSV collection file as full-replacement upserts.
- Import or export a single document as JSON or CSV.
- Recursively copy selected documents or collections, including subcollections, between Firestore projects/databases.
- Reuse the current credential file or provide separate source credentials for a copy.
- Choose merge or overwrite conflict handling and watch streamed copy progress.

## Typical workflow

1. Start the application and open `http://localhost:8080/`.
2. Select **Open Dashboard**, then **Open Firestore**.
3. Select **Add Tab**, upload a service-account JSON file, and choose a project and database.
4. Pick a root collection or enter a collection path and run a query.
5. Use the filter panel, nested browser, row selection, and document preview as needed.

Collection paths contain an odd number of segments (`users`, `users/alice/posts`); document paths contain an even number (`users/alice`).

## Requirements

- JDK 21
- A Firestore-enabled Google Cloud project
- A service account with permission to discover the intended projects/databases and perform the Firestore operations you use
- Internet access on the first build so Maven can download dependencies and the pinned Node.js/npm toolchain

The Maven wrapper is included. The Maven frontend plugin installs Node.js 24.12.0 and npm 11.6.2 for the integrated build, so a system Node.js installation is only required when running frontend commands directly.

## Run the application

Linux or macOS:

```bash
./mvnw spring-boot:run
```

Windows PowerShell:

```powershell
.\mvnw.cmd spring-boot:run
```

Available URLs:

| URL | Purpose |
|---|---|
| `http://localhost:8080/` | Application |
| `http://localhost:8080/app` | Dashboard |
| `http://localhost:8080/app/firestore` | Firestore workspace |
| `http://localhost:8080/docs` | Swagger UI |
| `http://localhost:8080/v3/api-docs` | OpenAPI document |

## Development

Run the complete Maven build:

```bash
./mvnw clean verify
```

### Testing

Run backend and frontend unit tests together (the Maven `test` phase also runs the vitest suite):

```bash
./mvnw test
```

Run only the backend tests (skips the Node/npm steps):

```bash
./mvnw test -Dskip.installnodenpm -Dskip.npm
```

Run frontend unit tests directly:

```bash
cd src/main/frontend
npm test          # single run (vitest)
npm run test:watch
```

Run browser E2E tests (Playwright starts the vite dev server on port 5173 automatically):

```bash
cd src/main/frontend
npx playwright install   # one-time browser download
npm run test:e2e         # or: npx playwright test --project=chromium
```

Run backend integration tests against a local Firestore emulator using the `test,emulator` profile described in `src/test/resources/application-emulator.yaml`.

Run frontend tasks directly:

```bash
cd src/main/frontend
npm ci
npm run build
npm run lint
```

The frontend build writes the SPA to `src/main/resources/static/`. Its Tailwind entry point is `src/main/frontend/src/style.css`. Maven runs `npm install` and `npm run build` during `generate-resources`.

## Technology

| Layer | Main technologies |
|---|---|
| Backend | Java 21, Spring Boot 4.0.6, WebFlux |
| Google Cloud | Google Cloud Firestore, Firestore Admin, Resource Manager, Spring Cloud GCP 8.0.2 |
| Frontend | React 19, TypeScript 6, Vite 8 |
| State and routing | TanStack Query, TanStack Router |
| UI | Tailwind CSS 4, shadcn/ui, Base UI, Lucide |
| Data editors and views | Monaco Editor, React JSON View, React Flow |
| API documentation | SpringDoc OpenAPI 3.0.3 |

## Project structure

```text
src/main/java/com/itbd/afirestore/
|-- gcp/                         # Project discovery
|-- firestore/
|   |-- controller/              # CRUD, query, traversal, config, and transfer APIs
|   |-- service/                 # Firestore clients, operations, and recursive copy
|   `-- dto/
`-- common/                      # Web configuration and error handling

src/main/frontend/src/
|-- features/gcp/                # Credential and workspace-tab state
|-- features/firestore/
|   |-- api/                     # API client, queries, and transfer serialization
|   |-- components/              # Layout, query panels, dialogs, and viewers
|   |-- pages/                   # Firestore workspace
|   `-- schemas/                 # Shared frontend types
|-- routes/                      # TanStack Router routes
`-- shared/                      # Shared layout and UI components
```

## API overview

Requests that operate on an initialized Firestore context use `X-Project-Id` and optional `X-Database-Id` headers.

| Endpoint group | Purpose |
|---|---|
| `POST /api/gcp/projects` | Discover projects from an uploaded credential file |
| `POST /api/firestore/init` | Initialize a project/database client |
| `/api/collections` and `/api/collections/**` | List collections and read, create, write (typed merge/replace contract with optimistic concurrency), or delete documents |
| `/api/workbench/query` | Run filtered, ordered, cursor-paginated collection queries |
| `/api/workbench/nested` | Traverse documents and subcollections |
| `POST /api/workbench/bulk-delete` | Atomically delete up to 500 validated document paths |
| `POST /api/workbench/replace` | Fully replace or upsert a document (used by file imports) |
| `/api/transfer/**` | Initialize transfer contexts and stream recursive deep-copy progress |

## Credential handling

The selected credential file is kept in frontend memory and sent to the backend when project discovery, database discovery, or Firestore client initialization is requested. The application code does not write the uploaded JSON to disk. This repository does not currently configure an application-level authentication boundary, so keep the app on a trusted network or add authentication before exposing it publicly.
