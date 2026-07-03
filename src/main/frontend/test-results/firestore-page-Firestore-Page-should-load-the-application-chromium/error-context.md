# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firestore-page.spec.ts >> Firestore Page >> should load the application
- Location: e2e\firestore-page.spec.ts:8:3

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /a-firestore/i
Received string:  "GManager"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    13 × unexpected value "GManager"

```

```yaml
- main:
  - text: Welcome Welcome to Firestore Explorer Manage Firestore documents, browse projects, and run queries from one centralized workspace.
  - paragraph: Start by uploading your Google Cloud service account JSON file in the dashboard. Your credentials stay in the session and are only used for Firestore API requests.
  - paragraph: Need a quick start?
  - paragraph: Click below to open the dashboard and continue setup.
  - button "Open Dashboard"
- region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Firestore Page', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/')
  6  |   })
  7  | 
  8  |   test('should load the application', async ({ page }) => {
  9  |     // Verify the app loads without errors
> 10 |     await expect(page).toHaveTitle(/a-firestore/i)
     |                        ^ Error: expect(page).toHaveTitle(expected) failed
  11 |   })
  12 | 
  13 |   test('should show workspace controls', async ({ page }) => {
  14 |     // Check that the WorkspaceControllerDeck is visible
  15 |     const deck = page.locator('[class*="bg-card"]').first()
  16 |     await expect(deck).toBeVisible()
  17 |   })
  18 | 
  19 |   test('should have collection path input', async ({ page }) => {
  20 |     // Verify the query path input exists
  21 |     const pathInput = page.getByPlaceholder(/users|posts/i)
  22 |     await expect(pathInput).toBeVisible()
  23 |   })
  24 | 
  25 |   test('should have run query button', async ({ page }) => {
  26 |     // Check that the Run Query button is present
  27 |     const runButton = page.getByRole('button', { name: /Run Query/i })
  28 |     await expect(runButton).toBeVisible()
  29 |   })
  30 | 
  31 |   test('should show bulk delete option when rows are selected', async ({ page }) => {
  32 |     // This test assumes we can select rows in the query results
  33 |     // For now, just verify the UI structure exists
  34 |     
  35 |     // Check that the more actions dropdown exists
  36 |     const moreActionsButton = page.getByRole('button', { name: /More actions/i })
  37 |     await expect(moreActionsButton).toBeVisible()
  38 |   })
  39 | 
  40 |   test('mobile layout should use sheet component', async ({ page }) => {
  41 |     // Test mobile responsiveness by resizing viewport
  42 |     await page.setViewportSize({ width: 375, height: 667 }) // iPhone 6/7/8
  43 |     
  44 |     // On narrow screens, the sidebar should be in a sheet/drawer mode
  45 |     const sidebar = page.locator('[class*="fixed"]').first()
  46 |     await expect(sidebar).toBeVisible()
  47 |   })
  48 | })
  49 | 
```