# a-firestore

`a-firestore` is a local web workbench for exploring and managing Google Cloud Firestore. It combines a Spring Boot WebFlux API with a React application and supports multiple project/database contexts, nested data browsing, document editing, and data transfer.

See the [future feature plan](docs/FUTURE_FEATURE_PLAN.md) for the prioritized product and engineering roadmap.

## User features

### Connections and workspaces

- Upload a Google Cloud service-account JSON file and discover accessible projects and Firestore databases.
- Open several project/database contexts as tabs and switch between them without leaving the workspace.
- Change the project or database inside an open tab.
- Search and refresh root collections.
- Switch between light and dark themes.

### Browse and query data

- Query root collections or nested collection paths such as `users/user-id/posts`.
- Traverse documents and subcollections in a separate nested browser.
- Filter nested nodes by document or collection ID, navigate to a parent path, and load long lists incrementally.
- Add multiple server-side `where` clauses using AND logic.
- Use Firestore operators including `==`, `!=`, comparisons, `array-contains`, `array-contains-any`, `in`, and `not-in`.
- Enter typed filter values as strings, numbers, booleans, nulls, arrays, or ISO-8601 timestamps.
- Order results by field and direction, set the page size, and move between result pages.
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

- Refresh a document from Firestore, save merge updates, or delete it with confirmation.
- Receive a warning before closing or switching away from an unsaved JSON draft.
- Delete several selected documents in one action.

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

Run tests:

```bash
./mvnw test
```

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
| `/api/collections` and `/api/collections/**` | List collections and read, create, merge-update, or delete documents |
| `/api/workbench/query` | Run filtered, ordered, paginated collection queries |
| `/api/workbench/nested` | Traverse documents and subcollections |
| `POST /api/workbench/replace` | Fully replace or upsert a document |
| `/api/transfer/**` | Initialize transfer contexts and stream recursive deep-copy progress |

## Credential handling

The selected credential file is kept in frontend memory and sent to the backend when project discovery, database discovery, or Firestore client initialization is requested. The application code does not write the uploaded JSON to disk. This repository does not currently configure an application-level authentication boundary, so keep the app on a trusted network or add authentication before exposing it publicly.
