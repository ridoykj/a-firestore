# Test Infrastructure Guide

This document describes the test infrastructure set up as part of **FFP-006: Automated test foundation**.

## Overview

The test suite includes three layers:

1. **Frontend Unit Tests** - Vitest + Testing Library (React components, utilities)
2. **Backend Unit/Integration Tests** - Spring Boot test starters (JUnit 5, AssertJ, `@MockitoBean`) + Testcontainers (Firestore emulator)
3. **Browser E2E Tests** - Playwright (full-stack integration testing)

## Running Tests

### Frontend Unit Tests

```bash
cd src/main/frontend

# Run all tests
npm test

# Watch mode for development
npm run test:watch

# With coverage report
npm test -- --coverage
```

### Backend Integration Tests

```bash
# Requires Firestore emulator running on localhost:8080
./mvnw test -Dspring.profiles.active=test,emulator

# Or using the Maven wrapper directly
mvnw test -Ptest
```

### Browser E2E Tests

```bash
cd src/main/frontend

# Install Playwright browsers (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run with UI mode for debugging
npx playwright test --ui

# Run specific test file
npx playwright test e2e/firestore-page.spec.ts
```

## Test Structure

### Frontend Tests

- **Location**: `src/main/frontend/src/**/__tests__/*.test.{ts,tsx}`
- **Configuration**: `src/main/frontend/vitest.config.ts`
- **Setup**: `src/main/frontend/src/test/setup.ts`

Example test file:
```typescript
import { describe, it, expect } from 'vitest'
import { normalizePath } from '../api/firestore-utils'

describe('firestore-utils', () => {
  it('should normalize paths correctly', () => {
    expect(normalizePath('/users')).toBe('users')
  })
})
```

### Backend Tests

- **Location**: `src/test/java/com/itbd/afirestore/**/*Tests.java`
- **Configuration**: `src/test/resources/application-emulator.yaml`

Example test:
```java
@SpringBootTest
@ActiveProfiles({"test", "emulator"})
class FirestoreIntegrationTests {
    @Test
    void contextLoadsWithEmulator() {
        // Test implementation
    }
}
```

### E2E Tests

- **Location**: `src/main/frontend/e2e/*.spec.ts`
- **Configuration**: `src/main/frontend/playwright.config.ts`

Example test:
```typescript
import { test, expect } from '@playwright/test'

test('should load the application', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/a-firestore/i)
})
```

## Firestore Emulator Setup

For backend integration tests, you need a running Firestore emulator:

### Option 1: Using Firebase CLI (Recommended)

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Initialize Firestore in your project
firebase init firestore

# Start the emulator
firebase emulators:start --only firestore
```

The emulator will run on `localhost:8080` by default.

### Option 2: Manual Setup

If you have a Google Cloud project with Firestore enabled, you can use the emulator binary directly from the Firebase SDK.

## CI/CD Integration

For continuous integration, consider:

1. **Frontend tests**: Run on every PR
2. **Backend tests**: Run on every commit to main branch
3. **E2E tests**: Run nightly or before releases

Example GitHub Actions workflow snippet:

```yaml
- name: Run frontend tests
  run: |
    cd src/main/frontend
    npm ci
    npm test

- name: Start Firestore emulator
  run: firebase emulators:start --only firestore &

- name: Run backend tests
  run: ./mvnw test -Dspring.profiles.active=test,emulator

- name: Run E2E tests
  run: |
    cd src/main/frontend
    npx playwright install
    npm run test:e2e
```

## Coverage Goals

Target coverage thresholds (to be enforced in CI):

- **Frontend utilities**: 90%+ line coverage
- **Backend services**: 80%+ line coverage
- **E2E critical paths**: All P0 features covered

## Troubleshooting

### Firestore emulator not starting

- Check if port 8080 is already in use: `netstat -ano | findstr :8080`
- Kill the process or change the emulator port in `application-emulator.yaml`

### Frontend tests failing with module resolution errors

- Ensure you're running tests from `src/main/frontend/` directory
- Check that `vitest.config.ts` has correct path aliases

### E2E tests timing out

- Increase timeout in `playwright.config.ts`: `testTimeout: 30000`
- Check if the dev server is actually running on port 8080

## Future Improvements

As part of future roadmap items:

- **FFP-106**: Add backend unit tests for atomic bulk delete validation
- **FFP-205**: Add emulator profile tests with explicit host/project/database configuration
- **FFP-304**: Add backup/restore E2E tests covering manifest version and conflict policy

## References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)
- [Testcontainers Java](https://www.testcontainers.org/)
- [Firestore Emulator](https://firebase.google.com/docs/firestore/test/simulate-local-dev)
