# a-firestore

A Spring Boot + HTMX Firestore browser/editor with:
- collection/document navigation
- query filters + pagination
- table/tree/json result views
- row-level edit/delete actions
- JSON-style Tree view with expandable nodes and inline key/value editing

## Stack
- Java 25
- Spring Boot 4.0.6 (WebFlux + Thymeleaf)
- Google Cloud Firestore (Spring Cloud GCP)
- Tailwind CSS 4 (compiled to `src/main/resources/static/main.css`)

## Prerequisites
- JDK 25
- Maven Wrapper is included (`mvnw`, `mvnw.cmd`)
- Firestore-enabled GCP project
- Service account JSON credential with Firestore access

## Run
From repository root:

```bash
./mvnw spring-boot:run
```

Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

Open:
- App UI: `http://localhost:8080/`
- Swagger UI: `http://localhost:8080/docs`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

## UI Workflow
1. Open `/`.
2. Upload/paste service-account JSON and initialize auth/project/database from the UI.
3. Run query from the main explorer.
4. Switch between `Table`, `Tree`, and `JSON` view modes.

### Table View
- Row `edit` loads document explorer into the action panel.
- Row `delete` prompts a confirmation dialog before deleting.

### Tree View (JSONFormatter-style)
- Uses collapsible object/array nodes with typed values.
- Expand/collapse nested content with disclosure arrows.
- Each document card includes **Edit Object Key/Value JSON**:
  - edit keys and scalar/object/array values
  - click **Save Key/Value Changes**
  - saves through full document replacement for reliable key rename behavior

Important:
- Tree editor intentionally excludes internal keys (e.g. `_path`) and top-level `id`.
- Save action replaces document fields with submitted JSON payload.

## HTTP Endpoints

### UI/HTMX
- `GET /ui/firestore/fragments/query-results`
- `POST /ui/firestore/actions/create`
- `POST /ui/firestore/actions/update` (merge update)
- `POST /ui/firestore/actions/replace` (full replace; used by Tree editor)
- `POST /ui/firestore/actions/delete`
- `GET /ui/firestore/fragments/explore`

### Generic REST API
Base: `/api/collections`

- `GET /api/collections` -> list root collections
- `GET /api/collections/**` -> read collection (or document by even path depth)
- `POST /api/collections/**` -> create document in collection path
- `PUT /api/collections/**` -> merge update document
- `DELETE /api/collections/**` -> delete document

## Frontend CSS Build
Tailwind source is in `src/main/frontend/styles.css`.

Manual build:

```bash
cd src/main/frontend
npm install
npm run build
```

Watch mode:

```bash
npm run watch
```

Note: Maven build already runs frontend build during `generate-resources` via `frontend-maven-plugin`.

## Quick Dev Commands

```bash
./mvnw -DskipTests compile
./mvnw test
```
