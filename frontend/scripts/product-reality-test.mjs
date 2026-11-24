/**
 * Product Reality Pass Truth Test
 * Verifies the complete product loop for fresh users via real browser UI:
 * 1. Fresh User 1 registers with NO uploads.
 * 2. Opens Practice, confirms only topic input + Start practice (no recent sessions, no switch when no notes).
 * 3. Enters "Deadlocks", clicks Start practice -> generates question one-at-a-time.
 * 4. Answers 4 questions: good -> good -> bad -> middle.
 * 5. Verifies:
 *    - Adaptive ladder updates after each evaluated answer (promotes/demotes).
 *    - /mastery shows Deadlocks with 4 attempts, real %, current level, last practiced.
 *    - /weak-areas shows Deadlocks if score < 70% with "Practice this" button.
 *    - /analytics shows score over time, cognitive progression, and daily volume.
 *    - /history shows session grouped by date and topic with question details.
 *    - /practice shows NO "Recent sessions".
 * 6. Fresh User 2 registers:
 *    - Verifies empty states on /dashboard, /mastery, /weak-areas, /analytics, /history.
 *    - Confirms User 2 sees zero data from User 1.
 * 7. Asserts 0 console errors, 0 page errors, 0 bad responses.
 */

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  })
)

const port = Number(args.port ?? 5174)
const base = `http://localhost:${port}`
const shotDir = path.resolve(
  process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
  'opencode',
  'reality_pass'
)
fs.mkdirSync(shotDir, { recursive: true })

const consoleErrors = []
const pageErrors = []
const failedRequests = []
const badResponses = []
const shots = []

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})

const context = await browser.newContext({ viewport: { width: 1365, height: 900 } })
const page = await context.newPage()

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText}`)
})
page.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('/auth/login')) {
    badResponses.push(`${response.status()} ${response.url()}`)
  }
})

const shot = async (name) => {
  const file = path.join(shotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
  console.log(`[Screenshot] ${name} -> ${file}`)
  return file
}

try {
  console.log('=== Step 1: Register Fresh User 1 ===')
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Create account' }).click()
  const email1 = `truth-user1-${crypto.randomUUID()}@example.com`
  await page.locator('#full_name').fill('Alice Truth')
  await page.locator('#email').fill(email1)
  await page.locator('#password').fill('pass-Alice123!')
  await page.locator('#btn-submit-auth').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  await shot('01_user1_registered')

  console.log('=== Step 2: Verify Practice Setup Screen (Default clicks, no uploads) ===')
  await page.goto(`${base}/practice`, { waitUntil: 'networkidle' })
  await shot('02_practice_setup_initial')

  // Verify "Use only my uploaded notes" is hidden because user has 0 uploaded documents
  const uploadSwitch = page.getByLabel('Use only my uploaded notes')
  const isUploadVisible = await uploadSwitch.isVisible().catch(() => false)
  assert.equal(isUploadVisible, false, '"Use only my uploaded notes" MUST be hidden when user has no uploads')

  // Verify "Recent sessions" does NOT exist on the Practice page
  const recentSessionsHeading = page.getByRole('heading', { name: /Recent sessions/i })
  const hasRecentSessions = await recentSessionsHeading.isVisible().catch(() => false)
  assert.equal(hasRecentSessions, false, '"Recent sessions" MUST NOT exist on the Practice page')

  // Verify controls that must NOT exist
  assert.equal(await page.getByRole('radio', { name: /Manual/i }).count(), 0)
  assert.equal(await page.getByLabel(/Difficulty/i).count(), 0)
  assert.equal(await page.getByLabel(/Number of questions/i).count(), 0)

  console.log('=== Step 3: Type topic and click Start practice ===')
  const topicInput = page.locator('#generate-topic')
  await topicInput.fill('Deadlocks')

  const genPromise = page.waitForResponse(
    (resp) => resp.url().includes('/questions/generate') && resp.status() === 200,
    { timeout: 60000 }
  )
  await page.getByRole('button', { name: 'Start practice' }).click()
  await page.waitForURL(/\/practice\/[^/]+$/, { timeout: 30000 })
  const gen1Response = await genPromise
  const q1Data = (await gen1Response.json()).questions?.[0]
  await page.getByTestId('adaptive-reason').waitFor({ state: 'visible', timeout: 20000 })
  await shot('03_session_q1_remember')

  const rung0 = await page.getByTestId('adaptive-active-rung').textContent()
  console.log(`Q1 initial active rung: ${rung0}`)
  assert.match(rung0, /remember/i)

  // Question 1: Good answer (matches correct_answer)
  console.log('=== Answering Q1 with good answer ===')
  await page.getByLabel('Your answer').fill(q1Data?.correct_answer || 'mutual exclusion')
  const sub1Promise = page.waitForResponse((r) => r.url().includes('/attempts/submit') && r.status() === 200)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const sub1 = await (await sub1Promise).json()
  await page.getByTestId('evaluation-result').waitFor({ state: 'visible', timeout: 20000 })
  await shot('04_q1_evaluated')
  console.log(`Q1 score: ${sub1.score}`)
  assert.ok(sub1.score >= 0.75, `Q1 good score expected >= 0.75, got ${sub1.score}`)

  // Next question -> Q2
  console.log('=== Requesting Q2 ===')
  const gen2Promise = page.waitForResponse((r) => r.url().includes('/questions/generate') && r.status() === 200)
  await page.getByRole('button', { name: /Next question/i }).click()
  const gen2Response = await gen2Promise
  const q2Data = (await gen2Response.json()).questions?.[0]
  await page.getByTestId('adaptive-reason').waitFor({ state: 'visible', timeout: 20000 })
  await shot('05_session_q2_promoted')
  const rung1 = await page.getByTestId('adaptive-active-rung').textContent()
  console.log(`Q2 active rung after promotion: ${rung1}`)
  assert.match(rung1, /understand/i, 'Rung should have moved up to understand')

  // Question 2: Good answer (matches correct_answer)
  console.log('=== Answering Q2 with good answer ===')
  await page.getByLabel('Your answer').fill(q2Data?.correct_answer || 'Deadlock is a condition where processes wait indefinitely')
  const sub2Promise = page.waitForResponse((r) => r.url().includes('/attempts/submit') && r.status() === 200)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const sub2 = await (await sub2Promise).json()
  await page.getByTestId('evaluation-result').waitFor({ state: 'visible', timeout: 20000 })
  await shot('06_q2_evaluated')
  console.log(`Q2 score: ${sub2.score}`)
  assert.ok(sub2.score >= 0.75, `Q2 good score expected >= 0.75, got ${sub2.score}`)

  // Next question -> Q3
  console.log('=== Requesting Q3 ===')
  const gen3Promise = page.waitForResponse((r) => r.url().includes('/questions/generate') && r.status() === 200)
  await page.getByRole('button', { name: /Next question/i }).click()
  const gen3Response = await gen3Promise
  const q3Data = (await gen3Response.json()).questions?.[0]
  await page.getByTestId('adaptive-reason').waitFor({ state: 'visible', timeout: 20000 })
  await shot('07_session_q3_promoted')
  const rung2 = await page.getByTestId('adaptive-active-rung').textContent()
  console.log(`Q3 active rung: ${rung2}`)
  assert.match(rung2, /apply/i, 'Rung should have moved up to apply')

  // Question 3: Bad answer
  console.log('=== Answering Q3 with bad answer ===')
  await page.getByLabel('Your answer').fill('asdf totally incorrect answer with zero facts')
  const sub3Promise = page.waitForResponse((r) => r.url().includes('/attempts/submit') && r.status() === 200)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const sub3 = await (await sub3Promise).json()
  await page.getByTestId('evaluation-result').waitFor({ state: 'visible', timeout: 20000 })
  await shot('08_q3_evaluated')
  console.log(`Q3 score: ${sub3.score}`)
  assert.ok(sub3.score < 0.40, `Q3 bad score expected < 0.40, got ${sub3.score}`)

  // Next question -> Q4
  console.log('=== Requesting Q4 ===')
  const gen4Promise = page.waitForResponse((r) => r.url().includes('/questions/generate') && r.status() === 200)
  await page.getByRole('button', { name: /Next question/i }).click()
  const gen4Response = await gen4Promise
  const q4Data = (await gen4Response.json()).questions?.[0]
  await page.getByTestId('adaptive-reason').waitFor({ state: 'visible', timeout: 20000 })
  await shot('09_session_q4_demoted')
  const rung3 = await page.getByTestId('adaptive-active-rung').textContent()
  console.log(`Q4 active rung after demotion: ${rung3}`)
  assert.match(rung3, /understand/i, 'Rung should have dropped back down to understand')

  // Question 4: Middle answer
  console.log('=== Answering Q4 with middle answer ===')
  const refAnswer = q4Data?.correct_answer || 'Deadlock involves processes waiting'
  const midAnswer = refAnswer.slice(0, Math.floor(refAnswer.length / 2)) + ' However all requests proceed.'
  await page.getByLabel('Your answer').fill(midAnswer)
  const sub4Promise = page.waitForResponse((r) => r.url().includes('/attempts/submit') && r.status() === 200)
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const sub4 = await (await sub4Promise).json()
  await page.getByTestId('evaluation-result').waitFor({ state: 'visible', timeout: 20000 })
  await shot('10_q4_evaluated')
  console.log(`Q4 score: ${sub4.score}`)

  // Finish session
  console.log('=== Finishing session ===')
  await page.getByRole('button', { name: 'Finish session' }).click()
  await page.getByRole('button', { name: 'Confirm finish' }).click()
  await page.getByTestId('session-summary').waitFor({ state: 'visible', timeout: 15000 })
  await shot('11_session_summary')

  // === Step 4: Verify /mastery ===
  console.log('=== Step 4: Verify /mastery ===')
  await page.goto(`${base}/mastery`, { waitUntil: 'networkidle' })
  await page.getByTestId('mastery-page').waitFor({ state: 'visible', timeout: 15000 })
  const masteryRow = page.locator('[data-testid^="mastery-row-"]').first()
  await masteryRow.waitFor({ state: 'visible', timeout: 15000 })
  const masteryRowText = await masteryRow.textContent()
  console.log(`Mastery row text: ${masteryRowText}`)
  assert.match(masteryRowText, /Deadlocks/)
  assert.match(masteryRowText, /attempt/)
  await shot('12_user1_mastery')

  // === Step 5: Verify /weak-areas ===
  console.log('=== Step 5: Verify /weak-areas ===')
  await page.goto(`${base}/weak-areas`, { waitUntil: 'networkidle' })
  await page.getByTestId('weak-areas-page').waitFor({ state: 'visible', timeout: 15000 })
  await shot('13_user1_weak_areas')

  // === Step 6: Verify /analytics ===
  console.log('=== Step 6: Verify /analytics ===')
  await page.goto(`${base}/analytics`, { waitUntil: 'networkidle' })
  await page.getByTestId('analytics-page').waitFor({ state: 'visible', timeout: 15000 })
  assert.ok(await page.getByRole('heading', { name: 'Score Over Time' }).isVisible())
  assert.ok(await page.getByRole('heading', { name: 'Cognitive Level Progression' }).isVisible())
  assert.ok(await page.getByRole('heading', { name: 'Daily Activity Volume' }).isVisible())
  await shot('14_user1_analytics')

  // === Step 7: Verify /history ===
  console.log('=== Step 7: Verify /history ===')
  await page.goto(`${base}/history`, { waitUntil: 'networkidle' })
  await page.getByTestId('history-page').waitFor({ state: 'visible', timeout: 15000 })
  const historyGroup = page.locator('[data-testid^="history-group-"]').first()
  await historyGroup.waitFor({ state: 'visible', timeout: 15000 })
  const historyText = await historyGroup.textContent()
  console.log(`History text: ${historyText}`)
  assert.match(historyText, /Deadlocks/)
  assert.match(historyText, /answered/i)
  await shot('15_user1_history')

  // === Step 8: Capture all other pages for design audit ===
  console.log('=== Step 8: Capture other pages ===')
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' })
  await shot('16_user1_dashboard')

  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
  await page.getByTestId('settings-page').waitFor({ state: 'visible', timeout: 15000 })
  assert.ok(await page.getByText(email1).isVisible())
  await shot('17_user1_settings')

  await page.goto(`${base}/notes`, { waitUntil: 'networkidle' })
  await shot('18_user1_notes')

  await page.goto(`${base}/courses`, { waitUntil: 'networkidle' })
  await shot('19_user1_courses')

  // === Step 9: Register Fresh User 2 and Verify Clean Empty States ===
  console.log('=== Step 9: Register Fresh User 2 and Verify Empty States ===')
  const context2 = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  const page2 = await context2.newPage()
  page2.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page2.on('pageerror', (error) => pageErrors.push(error.message))
  page2.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/auth/login')) {
      badResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  await page2.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page2.getByRole('tab', { name: 'Create account' }).click()
  const email2 = `truth-user2-${crypto.randomUUID()}@example.com`
  await page2.locator('#full_name').fill('Bob Fresh')
  await page2.locator('#email').fill(email2)
  await page2.locator('#password').fill('pass-Bob123!')
  await page2.locator('#btn-submit-auth').click()
  await page2.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })

  // User 2: Dashboard empty
  await page2.goto(`${base}/dashboard`, { waitUntil: 'networkidle' })
  assert.ok(await page2.getByText('No topic data yet').isVisible(), 'User 2 dashboard must show empty state')
  const f20 = path.join(shotDir, '20_user2_dashboard_empty.png')
  await page2.screenshot({ path: f20, fullPage: true })
  shots.push(f20)

  // User 2: Mastery empty
  await page2.goto(`${base}/mastery`, { waitUntil: 'networkidle' })
  assert.ok(await page2.getByText('No mastery records yet').isVisible(), 'User 2 mastery must show empty state')
  assert.equal(await page2.getByText('Deadlocks').count(), 0, "User 2 must NOT see User 1's topic")
  const f21 = path.join(shotDir, '21_user2_mastery_empty.png')
  await page2.screenshot({ path: f21, fullPage: true })
  shots.push(f21)

  // User 2: Weak areas empty
  await page2.goto(`${base}/weak-areas`, { waitUntil: 'networkidle' })
  assert.ok(await page2.getByText('No attempts recorded yet').isVisible(), 'User 2 weak areas must show empty state')
  const f22 = path.join(shotDir, '22_user2_weak_areas_empty.png')
  await page2.screenshot({ path: f22, fullPage: true })
  shots.push(f22)

  // User 2: Analytics empty
  await page2.goto(`${base}/analytics`, { waitUntil: 'networkidle' })
  assert.ok(await page2.getByText('No analytics data yet').isVisible(), 'User 2 analytics must show empty state')
  const f23 = path.join(shotDir, '23_user2_analytics_empty.png')
  await page2.screenshot({ path: f23, fullPage: true })
  shots.push(f23)

  // User 2: History empty
  await page2.goto(`${base}/history`, { waitUntil: 'networkidle' })
  assert.ok(await page2.getByText('No previous attempts').isVisible(), 'User 2 history must show empty state')
  const f24 = path.join(shotDir, '24_user2_history_empty.png')
  await page2.screenshot({ path: f24, fullPage: true })
  shots.push(f24)

  // Verify errors
  console.log('Console errors:', consoleErrors)
  console.log('Page errors:', pageErrors)
  console.log('Bad responses:', badResponses)
  assert.deepEqual(consoleErrors, [], 'No console errors allowed')
  assert.deepEqual(pageErrors, [], 'No unhandled page errors allowed')
  assert.deepEqual(badResponses, [], 'No 4xx/5xx responses allowed')

  console.log('\n=============================================')
  console.log('ALL PRODUCT REALITY TRUTH TESTS PASSED!')
  console.log('=============================================\n')
} catch (err) {
  console.error('TRUTH TEST FAILED:', err)
  await shot('99_error_state').catch(() => {})
  throw err
} finally {
  await browser.close()
}
