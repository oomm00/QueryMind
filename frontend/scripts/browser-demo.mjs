// Real-browser demo proof against the dockerised backend.
// Usage: node scripts/browser-demo.mjs --mode=live --port=5174

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
const mode = args.mode ?? 'live'
const port = Number(args.port ?? 5174)
const base = `http://localhost:${port}`

// Extended proof suites live in their own module so the original ladder proof
// stays small and unchanged: `node scripts/browser-demo.mjs --suite=middle`.
if (args.suite) {
  await import('./browser-demo-extended.mjs')
  process.exit(0)
}
const shotDir = path.resolve(
  process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
  'opencode',
  `qm_e2e_shots_${mode}`
)
fs.mkdirSync(shotDir, { recursive: true })

const LADDER = [
  ['remember', 'easy'],
  ['understand', 'easy'],
  ['apply', 'medium'],
  ['analyze', 'medium'],
  ['evaluate', 'hard'],
  ['create', 'hard'],
]
const rungOf = (q) =>
  LADDER.findIndex(([bloom, difficulty]) =>
    q.bloom_level === bloom && q.difficulty === difficulty)

const consoleErrors = []
const pageErrors = []
const failedRequests = []
const badResponses = []
const network = []
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
  const url = response.url()
  if (url.startsWith('http://localhost:8000/')) {
    network.push(`${response.status()} ${url}`)
  }
  if (response.status() >= 400) badResponses.push(`${response.status()} ${url}`)
})

const shot = async (name) => {
  const file = path.join(shotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
}

const generate = async (tag, topic) => {
  const url = page.url()
  if (url.includes('/practice/') && !url.endsWith('/practice')) {
    const nextBtn = page.getByRole('button', { name: /Next question/ })
    if (await nextBtn.isVisible().catch(() => false)) {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/questions/generate') && response.status() === 200,
        { timeout: 60000 }
      )
      await nextBtn.click()
      const response = await responsePromise
      const body = await response.json()
      const question = body.questions?.[0] || body
      const reasons = page.getByTestId('adaptive-reason')
      await reasons.waitFor({ state: 'visible', timeout: 20000 })
      const reason = (await reasons.textContent()).trim()
      await shot(`${tag}-generate`)
      return {
        rung: rungOf(question),
        bloom_level: question.bloom_level,
        difficulty: question.difficulty,
        source: question.source,
        question_id: question.question_id,
        reason,
        correct_answer: question.correct_answer,
      }
    }
  }

  await page.goto(`${base}/practice`, { waitUntil: 'networkidle' })
  await page.locator('#generate-topic').fill(topic)
  const uploaded = page.getByLabel('Use only my uploaded notes')
  if (await uploaded.isVisible().catch(() => false)) {
    await uploaded.uncheck()
  }

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/questions/generate') && response.status() === 200,
    { timeout: 60000 }
  )
  await page.getByRole('button', { name: 'Start practice' }).click()
  await page.waitForURL(/\/practice\/[^/]+$/)

  const response = await responsePromise
  const body = await response.json()
  const question = body.questions?.[0] || body
  const reasons = page.getByTestId('adaptive-reason')
  await reasons.waitFor({ state: 'visible', timeout: 20000 })
  const reason = (await reasons.textContent()).trim()
  await shot(`${tag}-generate`)
  return {
    rung: rungOf(question),
    bloom_level: question.bloom_level,
    difficulty: question.difficulty,
    source: question.source,
    question_id: question.question_id,
    reason,
    correct_answer: question.correct_answer,
  }
}

const answerAndSubmit = async (tag, answer) => {
  const answerInput = page.getByLabel('Your answer')
  await answerInput.waitFor({ state: 'visible', timeout: 20000 })
  await answerInput.fill(answer)
  await shot(`${tag}-answer`)

  const submitPromise = page.waitForResponse(
    (response) => response.url().includes('/attempts/submit') && response.status() === 200,
    { timeout: 120000 }
  )
  await page.getByRole('button', { name: 'Submit answer' }).click()
  const response = await submitPromise
  const body = await response.json()
  await page.getByTestId('evaluation-result').waitFor({ state: 'visible', timeout: 20000 })
  await shot(`${tag}-results`)
  return { score: body.score, evaluation_mode: body.evaluation_mode, duplicate: body.duplicate_submission }
}

try {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Create account' }).click()
  const email = `e2e-${mode}-${crypto.randomUUID()}@example.com`
  await page.locator('#full_name').fill('Demo Learner')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('demo-password-123')
  await page.locator('#btn-submit-auth').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  await shot('00-registered')

  // Save explicit requirement after_setup screenshot
  await page.goto(`${base}/practice`, { waitUntil: 'networkidle' })
  await page.screenshot({
    path: path.resolve(process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp', 'opencode', 'after_setup.png'),
    fullPage: true,
  })

  // Use a bank-backed topic so adaptive mastery is keyed to the served question.
  const topic = 'Deadlocks'
  const first = await generate('01-initial', topic)
  await page.screenshot({
    path: path.resolve(process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp', 'opencode', 'session_initial.png'),
    fullPage: true,
  })

  const good = await answerAndSubmit('01-good', first.correct_answer || 'mutual exclusion')

  const second = await generate('02-after-good', topic)
  await page.screenshot({
    path: path.resolve(process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp', 'opencode', 'session_level_up.png'),
    fullPage: true,
  })

  const bad = await answerAndSubmit('02-bad', 'asdf')

  const third = await generate('03-after-bad', topic)
  await page.screenshot({
    path: path.resolve(process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp', 'opencode', 'session_level_down.png'),
    fullPage: true,
  })

  // Finish session to test summary
  await page.getByRole('button', { name: 'Finish session' }).click()
  await page.getByRole('button', { name: 'Confirm finish' }).click()
  await page.getByTestId('session-summary').waitFor({ state: 'visible', timeout: 10000 })
  await shot('04-summary')

  console.log(JSON.stringify({ mode, email, topic, first, good, second, bad, third, shots, network, consoleErrors, pageErrors, failedRequests, badResponses }, null, 2))

  assert.equal(first.rung, 0, 'first adaptive rung should be Remember/Easy')
  assert.match(first.reason, /starting at Remember\/Easy/i)
  assert.equal(second.rung, first.rung + 1, 'one good answer should promote exactly one rung')
  assert.match(second.reason, /moving up/i)
  assert.equal(third.rung, second.rung - 1, 'one bad answer should demote exactly one rung')
  assert.match(third.reason, /moving down/i)
  assert.ok(good.score >= 0.75, `good answer score ${good.score}`)
  assert.ok(bad.score < 0.4, `bad answer score ${bad.score}`)
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  assert.deepEqual(badResponses, [])
  console.log(`PASS ${mode}: adaptive ladder ${first.rung} -> ${second.rung} -> ${third.rung}`)
} catch (error) {
  await page.screenshot({ path: path.join(shotDir, '99-failure.png'), fullPage: true }).catch(() => {})
  const diagnostics = await page.evaluate(() => ({
    url: location.href,
    body: document.body.innerText.slice(0, 4000),
    inputs: [...document.querySelectorAll('input')].map((el) => ({
      id: el.id, label: el.getAttribute('aria-label'), type: el.type, value: el.value, disabled: el.disabled, checked: el.checked,
    })),
    buttons: [...document.querySelectorAll('button')].map((el) => ({
      text: el.innerText.trim(), disabled: el.disabled, type: el.type,
    })).filter((b) => b.text),
  })).catch((e) => ({ error: String(e) }))
  console.log(JSON.stringify({ failure: String(error), diagnostics, shots, network, consoleErrors, pageErrors, failedRequests, badResponses }, null, 2))
  throw error
} finally {
  await browser.close()
}
