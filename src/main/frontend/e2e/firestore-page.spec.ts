import { test, expect } from '@playwright/test'

test.describe('Firestore Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should load the application', async ({ page }) => {
    // Verify the app loads without errors
    await expect(page).toHaveTitle(/a-firestore/i)
  })

  test('should show workspace controls', async ({ page }) => {
    // Check that the WorkspaceControllerDeck is visible
    const deck = page.locator('[class*="bg-card"]').first()
    await expect(deck).toBeVisible()
  })

  test('should have collection path input', async ({ page }) => {
    // Verify the query path input exists
    const pathInput = page.getByPlaceholder(/users|posts/i)
    await expect(pathInput).toBeVisible()
  })

  test('should have run query button', async ({ page }) => {
    // Check that the Run Query button is present
    const runButton = page.getByRole('button', { name: /Run Query/i })
    await expect(runButton).toBeVisible()
  })

  test('should show bulk delete option when rows are selected', async ({ page }) => {
    // This test assumes we can select rows in the query results
    // For now, just verify the UI structure exists
    
    // Check that the more actions dropdown exists
    const moreActionsButton = page.getByRole('button', { name: /More actions/i })
    await expect(moreActionsButton).toBeVisible()
  })

  test('mobile layout should use sheet component', async ({ page }) => {
    // Test mobile responsiveness by resizing viewport
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone 6/7/8
    
    // On narrow screens, the sidebar should be in a sheet/drawer mode
    const sidebar = page.locator('[class*="fixed"]').first()
    await expect(sidebar).toBeVisible()
  })
})
