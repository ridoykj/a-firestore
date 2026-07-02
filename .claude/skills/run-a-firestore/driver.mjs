#!/usr/bin/env node
// Playwright driver for the a-firestore web app.
// Resolves Playwright from src/main/frontend/node_modules, so run
// `npm install` there first. Works from any cwd.
//
// Usage:
//   node .claude/skills/run-a-firestore/driver.mjs smoke [baseUrl]
//   node .claude/skills/run-a-firestore/driver.mjs shot <url> <outfile.png>
//   node .claude/skills/run-a-firestore/driver.mjs eval <url> <js-expression>
//
// Screenshots from `smoke` land in .claude/skills/run-a-firestore/screenshots/

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const skillDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(skillDir, '..', '..', '..')
const frontendDir = path.join(repoRoot, 'src', 'main', 'frontend')
const require = createRequire(path.join(frontendDir, 'package.json'))
const { chromium } = require('@playwright/test')

const shotsDir = path.join(skillDir, 'screenshots')
fs.mkdirSync(shotsDir, { recursive: true })

const [cmd = 'smoke', ...rest] = process.argv.slice(2)

async function withPage(fn) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[console.error] ${m.text()}`)
  })
  try {
    await fn(page)
  } finally {
    await browser.close()
  }
}

async function shot(page, name) {
  const file = path.join(shotsDir, name)
  await page.screenshot({ path: file })
  console.log(`screenshot: ${file}`)
}

if (cmd === 'smoke') {
  const base = rest[0] ?? 'http://localhost:8080'
  await withPage(async (page) => {
    // 1. Home page
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    console.log(`title: ${await page.title()}`)
    await shot(page, '01-home.png')

    // 2. Home -> Dashboard ("Open Dashboard" is a Button with onClick navigate, not a link)
    await page.getByRole('button', { name: /Open Dashboard/i }).click()
    await page.waitForURL('**/app')
    await shot(page, '02-dashboard.png')

    // 3. Dashboard -> Firestore workspace ("Open Firestore" IS a link here)
    await page.getByRole('link', { name: /Open Firestore/i }).click()
    await page.waitForURL('**/app/firestore')
    // Routes are code-split: the URL flips before the new chunk renders, so
    // networkidle is not enough — wait for a workspace element instead.
    const addTab = page.getByRole('button', { name: /Add Tab/i })
    await addTab.waitFor()
    await shot(page, '03-firestore-workspace.png')

    // 4. Open the "Add Tab" connection dialog
    await addTab.click()
    await page.getByRole('dialog').waitFor()
    await shot(page, '04-add-tab-dialog.png')
    const dialogText = await page.getByRole('dialog').innerText()
    console.log('--- Add Tab dialog text ---')
    console.log(dialogText.split('\n').slice(0, 12).join('\n'))

    // 5. Sanity-check the backend API is reachable through the same origin
    const apiStatus = await page.evaluate(async () => {
      const r = await fetch('/v3/api-docs')
      return r.status
    })
    console.log(`GET /v3/api-docs -> ${apiStatus}`)
    if (apiStatus !== 200) throw new Error('backend API not reachable')
    console.log('SMOKE OK')
  })
} else if (cmd === 'shot') {
  const [url, outfile] = rest
  if (!url || !outfile) throw new Error('usage: shot <url> <outfile.png>')
  await withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.screenshot({ path: outfile })
    console.log(`screenshot: ${outfile}`)
  })
} else if (cmd === 'eval') {
  const [url, expr] = rest
  if (!url || !expr) throw new Error('usage: eval <url> <js-expression>')
  await withPage(async (page) => {
    await page.goto(url, { waitUntil: 'networkidle' })
    const result = await page.evaluate(expr)
    console.log(JSON.stringify(result, null, 2))
  })
} else {
  throw new Error(`unknown command: ${cmd}`)
}
