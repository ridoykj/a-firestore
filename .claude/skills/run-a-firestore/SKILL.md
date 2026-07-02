---
name: run-a-firestore
description: Build, run, and drive a-firestore (Spring Boot + React Firestore workbench). Use when asked to start the app, run its tests, take a screenshot of the UI, or verify a change in the running app.
---

a-firestore is a single Spring Boot app (WebFlux, port 8080) that serves the
built React SPA from `src/main/resources/static/`. Drive the running app with
the Playwright driver at `.claude/skills/run-a-firestore/driver.mjs` — it
navigates home → dashboard → Firestore workspace → Add Tab dialog, screenshots
each step, and checks the backend API.

All paths are relative to the repo root. Commands verified on Windows
(PowerShell + Git Bash), system Node v24, JDK 21+.

## Prerequisites

- JDK 21+ on `PATH` (verified with GraalVM JDK 21 and Oracle JDK 25).
- System Node.js only for running the driver / frontend commands directly —
  the Maven build installs its own Node 24.12.0 under `target/`.
- Playwright + its Chromium browser, installed once (the `-D` install is a
  no-op if `@playwright/test` is already in devDependencies):

```bash
cd src/main/frontend
npm install
npm install -D @playwright/test
npx playwright install chromium
```

## Run the app

```powershell
.\mvnw.cmd spring-boot:run
```

First run takes ~2 min: Maven's `generate-resources` runs `npm install` +
`npm run build` (rebuilding `src/main/resources/static/`) before the server
starts. Ready when the log prints `Netty started on port 8080`.

To run a second instance while one is already on 8080 (common — the dev often
leaves one running):

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--server.port=8081"
```

Check what's already running: `netstat -ano | findstr :8080` (a `java.exe`
LISTENING means the app is up — don't kill it, it's probably the user's).

Stop: Ctrl-C in the terminal, or kill the `java` PID from netstat.

URLs once up: `/` (app), `/app/firestore` (workspace), `/docs` (Swagger UI),
`/v3/api-docs` (OpenAPI JSON).

## Drive it (agent path)

```bash
node .claude/skills/run-a-firestore/driver.mjs smoke [baseUrl]   # default http://localhost:8080
```

Prints `SMOKE OK` on success. Screenshots land in
`.claude/skills/run-a-firestore/screenshots/` (01-home, 02-dashboard,
03-firestore-workspace, 04-add-tab-dialog).

| command | what it does |
|---|---|
| `smoke [baseUrl]` | Full UI flow with screenshots + `/v3/api-docs` API check |
| `shot <url> <outfile.png>` | Screenshot any page |
| `eval <url> <js-expression>` | Evaluate JS in the page, print JSON result |

Example — screenshot the workspace, query the page from JS:

```bash
node .claude/skills/run-a-firestore/driver.mjs shot http://localhost:8080/app/firestore ws.png
node .claude/skills/run-a-firestore/driver.mjs eval http://localhost:8080/ "document.title"
```

Everything past the Add Tab dialog (projects, queries, documents) requires a
real GCP service-account JSON uploaded through that dialog — there is no
emulator/dev mode wired into the running app, so the driver stops at the
credential boundary.

## Test

Frontend unit tests:

```bash
cd src/main/frontend
npm test
```

Backend:

```powershell
.\mvnw.cmd test
```

Known state (2026-07, branch v3) — treat these as the baseline, not your
regression:

- `npm test`: 33 pass, **5 pre-existing failures** in
  `__tests__/transfer-utils.test.ts` and `__tests__/firestore-utils.test.ts`,
  plus vitest errors on `e2e/firestore-page.spec.ts` (see Gotchas).
- `mvnw test`: 9 run, **1 pre-existing failure**
  (`GenericFirestoreServiceTest.pathValidationShouldRejectEmptyPaths`) →
  `BUILD FAILURE`. `FirestoreIntegrationTests` passes without Docker.

## Gotchas

- **Buttons vs links are inconsistent** — home's "Open Dashboard" is a
  `<Button onClick={navigate}>` (role `button`); the dashboard's "Open
  Firestore" is `<Button asChild><Link>` (role `link`). Playwright
  `getByRole('link', …)` times out on the former.
- **Code-split routes render late** — after clicking into
  `/app/firestore` the URL flips before the lazy chunk renders, so
  `waitForLoadState('networkidle')` still screenshots the *previous* page.
  Wait for a workspace element (the driver waits for the "Add Tab" button).
- **`document.title` is `GManager`**, not "a-firestore" — set at runtime by
  the SPA (static `index.html` says `frontend2`). Don't assert on the title.
- **vitest runs the Playwright spec and fails** — `vitest.config.ts` has no
  `exclude` for `e2e/`, so `npm test` always reports
  `e2e/firestore-page.spec.ts` as a failed suite. Ignore it or add the
  exclude.
- **`npm run test:e2e` is stale** — the spec asserts the Firestore workspace
  UI (path input, Run Query button) at `/`, but `/` is a welcome page: 5 of
  6 tests fail against the real app. Its `webServer: npm run dev` also
  expects port 8080, which Vite doesn't use. It reuses an existing server on
  8080, so it only half-works when the Spring app is already up. Use the
  driver instead.
- **Maven rebuilds the frontend on every `spring-boot:run` / `test`** — the
  frontend-maven-plugin runs `npm install` + `npm run build` in
  `generate-resources`, overwriting `src/main/resources/static/`. Don't run
  it concurrently with your own `npm install` in `src/main/frontend`.

## Troubleshooting

- **`locator.click: Timeout … waiting for getByRole('link', { name: /Open Dashboard/i })`**:
  it's a button, not a link — `getByRole('button', …)`.
- **Driver screenshots show the wrong page**: you screenshotted during a
  code-split route transition — wait for a concrete element first.
- **Port 8080 already in use on startup**: another instance is running;
  launch with `--server.port=8081` (syntax above) and pass the base URL to
  the driver.
