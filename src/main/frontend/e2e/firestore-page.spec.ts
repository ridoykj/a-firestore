import { test, expect } from '@playwright/test'

// FFP-006: Browser E2E smoke tests. These run against the vite dev server and
// do not require a backend or Firestore emulator; they cover the flows that are
// reachable before a connection exists.
test.describe('Application shell', () => {
  test('home page loads with the application title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/a-firestore/i)
    await expect(page.getByRole('button', { name: /Open Dashboard/i })).toBeVisible()
  })
})

test.describe('Firestore workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/firestore')
  })

  test('shows the disconnected state before any tab is opened', async ({ page }) => {
    // FFP-003: no hardcoded "Emulator Connected" claim; real state is disconnected.
    await expect(page.getByText('Disconnected')).toBeVisible()
    await expect(page.getByText('No Firestore tabs yet')).toBeVisible()
  })

  test('opens the add-tab dialog from the empty state', async ({ page }) => {
    await page.getByRole('button', { name: /Add Tab/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Add Firestore Tab')).toBeVisible()
  })

  test('mobile layout keeps the workspace entry point reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByRole('button', { name: /Add Tab/i })).toBeVisible()
  })
})
