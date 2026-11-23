// Extended real-browser proof suites: middle band, custom topics, uploads,
// slow/bad networks and the DB-down UI. Run through browser-demo.mjs --suite=...
// or directly with `node scripts/browser-demo-extended.mjs --suite=middle`.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  })
)
const mode = args.mode ?? 'live'
const suite = args.suite ?? 'middle'
const port = Number(args.port ?? 5174)
const base = `http://localhost:${port}`
const pdfPath = args.pdf ?? path.resolve(
  process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
  'opencode', 'qm_demo_upload.pdf'
)
const uploadFixtures = {
  paging: args.pdfpaging ?? path.resolve(
    process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
    'opencode', 'qm_pdf_os_paging.pdf'
  ),
  primer: args.pdfprimer ?? path.resolve(
    process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
    'opencode', 'virtual-memory-primer.pdf'
  ),
  deadlocks: args.pdfdeadlocks ?? path.resolve(
    process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
    'opencode', 'qm_pdf_dbms_deadlocks.pdf'
  ),
}
const shotDir = path.resolve(
  process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
  'opencode', `qm_e2e_${suite}_${mode}`
)
fs.mkdirSync(shotDir, { recursive: true })

const MIDDLE_ANSWERS = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'middleAnswers.json'), 'utf8')
)
const conceptOf = (question) => {
  const haystack = (question?.question || '').toLowerCase()
  return Object.keys(MIDDLE_ANSWERS)
    .filter((key) => haystack.includes(key))
    .sort((a, b) => b.length - a.length)[0]
}
const answersFor = (question) => {
  const concept = conceptOf(question)
  return {
    concept: concept ?? 'generic',
    mid: concept ? MIDDLE_ANSWERS[concept].mid : null,
    high: concept ? MIDDLE_ANSWERS[concept].high : question.correct_answer,
    good: question.correct_answer,
  }
}

// Pick the middle-band wording against a throwaway user so the demo user's own
// attempt history (and therefore the adaptive rung) is untouched by calibration.
const apiBase = 'http://localhost:8000'
const registerApiUser = async () => {
  const response = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `calibrate-${suite}-${mode}-${crypto.randomUUID()}@example.com`,
      password: 'demo-password-123',
    }),
  })
  return (await response.json()).access_token
}
const calibrateMid = async (question, token) => {
  const ref = question.correct_answer || ''
  const midpoint = Math.floor(ref.length / 2)
  const candidates = [
    answersFor(question).mid,
    ref,
    `${ref} However, the scheduler always grants every request immediately and no cycle is ever checked.`,
    `${ref} However, every process can use the resource at the same time.`,
    `${ref.slice(0, midpoint)} However, the scheduler always grants every request immediately.`,
    'A deadlock is when processes wait for each other, but all requests are granted immediately and no cycle is ever checked.',
  ].filter(Boolean)

  let best = { answer: candidates[0], score: -1, distance: Infinity }
  for (const answer of candidates) {
    const response = await fetch(`${apiBase}/attempts/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        question_id: question.question_id,
        user_answer: answer,
        submission_id: crypto.randomUUID(),
      }),
    })
    if (!response.ok) continue
    const score = Number((await response.json()).score ?? 0)
    const distance = score >= 0.4 && score <= 0.7 ? Math.abs(score - 0.55) : 10 + Math.abs(score - 0.55)
    if (distance < best.distance) best = { answer, score, distance }
  }
  return best
}

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
  if (url.startsWith('http://localhost:8000/')) network.push(`${response.status()} ${url}`)
  if (response.status() >= 400) badResponses.push(`${response.status()} ${url}`)
})

const shot = async (name) => {
  const file = path.join(shotDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
}

const visibleText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()

const register = async () => {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Create account' }).click()
  const email = `e2e-${suite}-${mode}-${crypto.randomUUID()}@example.com`
  await page.locator('#full_name').fill('Demo Learner')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('demo-password-123')
  await page.locator('#btn-submit-auth').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  await shot('00-registered')
  return email
}

const uploadDocument = async ({ tag, file, subject, topic }) => {
  assert.ok(fs.existsSync(file), `missing PDF ${file}`)
  await page.goto(`${base}/notes`, { waitUntil: 'networkidle' })
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('Topic').fill(topic)
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/documents/upload'),
    { timeout: 120000 }
  )
  await page.locator('#qm-upload-input').setInputFiles(file)
  await page.getByRole('button', { name: /Upload 1 file/ }).click()
  const response = await responsePromise
  await page.getByText('1 file uploaded').waitFor({ timeout: 60000 })
  await shot(`${tag}-uploaded`)
  return {
    status: response.status(),
    body: await response.json(),
    subject: await page.getByLabel('Subject').inputValue(),
    topic: await page.getByLabel('Topic').inputValue(),
    visible: (await visibleText()).slice(0, 1200),
  }
}

const openGenerate = async ({ topic, count = 1, uploadedOnly = false }) => {
  await page.goto(`${base}/practice`, { waitUntil: 'networkidle' })
  await page.locator('#generate-topic').fill(topic)
  await page.getByLabel('Any number of questions').fill(String(count))
  const uploaded = page.getByLabel('Use only my uploaded material')
  if (await uploaded.isVisible()) {
    if (uploadedOnly) await uploaded.check()
    else await uploaded.uncheck()
  }
}

const generate = async ({ tag, topic, count = 1, uploadedOnly = false }) => {
  await openGenerate({ topic, count, uploadedOnly })
  const reasons = page.getByTestId('adaptive-reason')
  const started = performance.now()
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/questions/generate'),
    { timeout: 60000 }
  )
  await page.getByRole('button', { name: 'Generate questions' }).click()
  const progressVisible = await page.getByRole('status').first().isVisible().catch(() => false)
  const response = await responsePromise
  const elapsed = (performance.now() - started) / 1000
  const body = await response.json()
  const payload = response.request().postData()
  if (response.status() !== 200) {
    await shot(`${tag}-friendly-error`)
    return {
      status: response.status(), body, payload, elapsed, progressVisible,
      visible: (await visibleText()).slice(0, 4000),
    }
  }
  const question = body.questions?.[0]
  if (!question) {
    await shot(`${tag}-friendly-error`)
    return {
      status: 200, body, payload, elapsed, progressVisible,
      visible: (await visibleText()).slice(0, 4000),
    }
  }
  await reasons.waitFor({ state: 'visible', timeout: 20000 })
  await shot(`${tag}-generate`)
  return {
    status: 200,
    payload,
    question,
    elapsed,
    progressVisible,
    reason: (await reasons.textContent()).trim(),
    visible: (await visibleText()).slice(0, 4000),
  }
}

const answerAndSubmit = async ({ tag, answer, retryButtonName = 'Submit' }) => {
  await page.getByRole('button', { name: /^Start (practice|with 1 question)$/ }).click()
  await page.waitForURL(/\/practice\/[^/]+$/)
  const servedBadge = await page.getByText(/Served topic:/).first()
    .textContent().catch(() => null)
  await page.getByLabel('Your answer').fill(answer)
  await shot(`${tag}-answer`)
  const submitPromise = page.waitForResponse(
    (response) => response.url().includes('/attempts/submit'),
    { timeout: 120000 }
  )
  await page.getByRole('button', { name: 'Review and submit' }).click()
  await page.getByRole('dialog').getByRole('button', { name: retryButtonName }).click()
  const response = await submitPromise
  const body = await response.json()
  if (response.status() === 200) {
    await page.waitForURL(/\/practice\/[^/]+\/results$/)
    await shot(`${tag}-results`)
  }
  return { status: response.status(), body, servedBadge }
}

const table = (headers, rows) => {
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => String(row[col]).length)))
  const line = (cells) => `| ${cells.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`
  return [
    line(headers),
    `|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`,
    ...rows.map(line),
  ].join('\n')
}

const rungOf = (question) => {
  const ladder = [
    ['remember', 'easy'], ['understand', 'easy'], ['apply', 'medium'],
    ['analyze', 'medium'], ['evaluate', 'hard'], ['create', 'hard'],
  ]
  return ladder.findIndex(([bloom, difficulty]) =>
    question.bloom_level === bloom && question.difficulty === difficulty)
}

let result = {}
try {
  let email = null
  if (suite === 'dbdown') {
    const seed = JSON.parse(fs.readFileSync(path.resolve(
      process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
      'opencode', 'qm_db_seed.json'
    ), 'utf8'))
    await page.addInitScript(({ token, sessionsKey, sessionsValue }) => {
      localStorage.setItem('qm_token', token)
      localStorage.setItem(sessionsKey, sessionsValue)
    }, seed)
    // /auth/me needs the DB. Freeze the identity captured before the outage so
    // the UI can render; the submit below still hits the real 503 endpoint.
    await page.route('**/auth/me', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(seed.user),
    }))
  } else {
    email = await register()
  }

  if (suite === 'middle') {
    const topic = 'Deadlocks'
    const BAD = 'asdf'
    const calibrationToken = await registerApiUser()

    const rows = []
    const generated = []
    const start = await generate({ tag: '01-start', topic })
    assert.equal(start.status, 200)
    generated.push(start)

    const a0 = answersFor(start.question)
    const calibrated = await calibrateMid(start.question, calibrationToken)
    const s0 = await answerAndSubmit({ tag: '01-mid', answer: calibrated.answer })
    const g1 = await generate({ tag: '02-after-mid', topic })
    generated.push(g1)
    rows.push([`${a0.concept} mid ${calibrated.score.toFixed(2)}`, s0.body.score, start.question.bloom_level, g1.question.bloom_level, g1.reason])

    const a1 = answersFor(g1.question)
    const s1 = await answerAndSubmit({ tag: '02-high', answer: a1.high })
    const g2 = await generate({ tag: '03-after-high', topic })
    generated.push(g2)
    rows.push([`${a1.concept} high`, s1.body.score, g1.question.bloom_level, g2.question.bloom_level, g2.reason])

    const s2 = await answerAndSubmit({ tag: '03-bad', answer: BAD })
    const g3 = await generate({ tag: '04-after-drop', topic })
    generated.push(g3)
    rows.push(['bad 0', s2.body.score, g2.question.bloom_level, g3.question.bloom_level, g3.reason])

    const a3 = answersFor(g3.question)
    const s3 = await answerAndSubmit({ tag: '04-good-1', answer: a3.good })
    const g4 = await generate({ tag: '05-after-good-1', topic })
    generated.push(g4)
    rows.push(['good 1/2', s3.body.score, g3.question.bloom_level, g4.question.bloom_level, g4.reason])

    const a4 = answersFor(g4.question)
    const s4 = await answerAndSubmit({ tag: '05-good-2', answer: a4.good })
    const g5 = await generate({ tag: '06-after-good-2', topic })
    generated.push(g5)
    rows.push(['good 2/2', s4.body.score, g4.question.bloom_level, g5.question.bloom_level, g5.reason])

    result = { mode, suite, topic, email, rows, rungs: generated.map(rungOf) }
    console.log('\n' + table(['answer', 'score', 'rung before', 'rung after', 'reason'], rows) + '\n')

    assert.ok(s0.body.score >= 0.3 && s0.body.score <= 0.7, `mid score ${s0.body.score}`)
    assert.ok(s1.body.score >= 0.75, `high score ${s1.body.score}`)
    assert.equal(rungOf(g1.question), rungOf(start.question), '0.5 must stay on the same rung')
    assert.equal(rungOf(g2.question), rungOf(g1.question) + 1, '0.8 must go up exactly one rung')
    assert.equal(rungOf(g3.question), rungOf(g2.question) - 1, '0 must drop exactly one rung')
    assert.equal(rungOf(g4.question), rungOf(g3.question), 'first good after a drop must wait')
    assert.match(g4.reason, /1 of 2|1\/2|one more|pending/i)
    assert.equal(rungOf(g5.question), rungOf(g3.question) + 1, 'second good after a drop promotes')
  }

  if (suite === 'custom') {
    const topic = 'Paging and Virtual Memory'
    const absent = 'Zebras and Unpaid Parking Tickets'
    const bankFlow = []
    for (let i = 1; i <= 4; i += 1) {
      const generated = await generate({ tag: `bank-${i}`, topic })
      if (generated.status !== 200 || !generated.question) {
        bankFlow.push({ step: i, friendlyMessage: generated.visible })
        break
      }
      const submitted = await answerAndSubmit({
        tag: `bank-${i}-answer`,
        answer: generated.question.correct_answer || 'A short correct answer.',
      })
      bankFlow.push({
        step: i,
        source: generated.question.source,
        servedTopic: generated.question.topic,
        bloom_level: generated.question.bloom_level,
        difficulty: generated.question.difficulty,
        question: generated.question.question,
        reason: generated.reason,
        score: submitted.body.score,
      })
    }

    const noCache = await generate({ tag: 'absent-topic', topic: absent })
    await page.screenshot({ path: path.join(shotDir, 'absent-topic.png'), fullPage: true })

    await openGenerate({ topic: absent, uploadedOnly: true })
    await page.getByRole('button', { name: 'Generate questions' }).click()
    await page.getByText(/No material found|No uploaded material covers this topic/i).first()
      .waitFor({ timeout: 15000 })
    const noContextText = await visibleText()
    await shot('absent-topic-nocontext')

    await page.goto(`${base}/notes`, { waitUntil: 'networkidle' })
    await page.getByLabel('Subject').fill('OS')
    await page.getByLabel('Topic').fill('Paging and Virtual Memory')
    console.log('UPLOAD FIELDS', JSON.stringify({
      subject: await page.getByLabel('Subject').inputValue(),
      topic: await page.getByLabel('Topic').inputValue(),
    }))
    assert.ok(fs.existsSync(pdfPath), `missing PDF ${pdfPath}`)
    await page.locator('#qm-upload-input').setInputFiles(pdfPath)
    await page.getByRole('button', { name: /Upload 1 file/ }).click()
    await page.getByText('1 file uploaded').waitFor({ timeout: 60000 })
    await shot('pdf-uploaded')

    const token = await page.evaluate(() => localStorage.getItem('qm_token'))
    const meResponse = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    console.log('AUTH ME', meResponse.status, JSON.stringify(await meResponse.json()))
    const topicsResponse = await fetch(`${apiBase}/documents/topics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const documentTopics = await topicsResponse.json()
    const documentsResponse = await fetch(`${apiBase}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    console.log('UPLOAD RESULT', (await documentsResponse.json()).slice(0, 1))
    console.log('DOCUMENT TOPICS', JSON.stringify(documentTopics))

    let pdfGen
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      pdfGen = await generate({
        tag: `pdf-generate-${attempt}`, topic: 'Paging and Virtual Memory', uploadedOnly: true,
      })
      if (pdfGen.question?.source === 'live' && pdfGen.question.source_chunks?.length) break
    }
    let pdfAnswer = null
    if (pdfGen.status === 200 && pdfGen.question) {
      pdfAnswer = await answerAndSubmit({
        tag: 'pdf-answer', answer: pdfGen.question.correct_answer || 'A page is a fixed-size block.',
      })
    }

    result = { mode, suite, email, bankFlow, noCache, noContextText, pdfGen, pdfAnswer }
    console.log('\n' + table(
      ['step', 'source', 'served topic', 'bloom/difficulty', 'score'],
      bankFlow.map((row) => [row.step, row.source ?? '-', row.servedTopic ?? '-',
        row.bloom_level ? `${row.bloom_level}/${row.difficulty}` : '-', row.score ?? '-'])
    ) + '\n')
    console.log('absent topic:', JSON.stringify({
      status: noCache.status, source: noCache.question?.source,
      question: noCache.question?.question, visible: noCache.visible,
    }, null, 2))
    console.log('no-context message:', (noContextText.match(/No (material found|uploaded material covers this topic)[^.]{0,140}/i) ?? [''])[0])
    console.log('pdf generate:', JSON.stringify({
      status: pdfGen.status, source: pdfGen.question?.source,
      payload: pdfGen.payload, source_chunks: pdfGen.question?.source_chunks,
      question: pdfGen.question?.question, visible: pdfGen.visible,
    }, null, 2))

    assert.equal(bankFlow.length, 4, 'four custom-topic questions should be answered')
    assert.ok(bankFlow.every((row) => row.source), 'each custom-topic answer needs a served question')
    assert.ok(noCache.status === 200 && noCache.question, 'absent topic must still show a usable question')
    assert.ok(pdfGen.status === 200 && pdfGen.question, 'uploaded PDF must yield a usable question')
    if (mode === 'live') {
      assert.equal(pdfGen.question.source, 'live', 'uploaded-only question must come from the PDF context')
      assert.ok(pdfGen.question.source_chunks?.length, 'uploaded-only question must cite the PDF chunk')
    } else {
      assert.equal(pdfGen.question.source, 'uploaded', 'offline uploaded-only must be grounded in the PDF')
      assert.ok(pdfGen.question.source_chunks?.includes('qm_demo_upload.pdf') || pdfGen.question.source_chunks?.length)
      assert.match(pdfGen.question.context_warning ?? '', /offline|uploaded/i)
    }
  }

  if (suite === 'uploads') {
    const exactTopic = 'Paging and Virtual Memory'
    const mismatchTopic = 'Virtual Memory'
    const uploads = [
      await uploadDocument({ tag: '01-pdf-paging', file: uploadFixtures.paging, subject: 'OS', topic: exactTopic }),
      await uploadDocument({ tag: '02-pdf-primer', file: uploadFixtures.primer, subject: 'OS', topic: 'Virtual Memory Primer' }),
      await uploadDocument({ tag: '03-pdf-deadlocks', file: uploadFixtures.deadlocks, subject: 'DBMS', topic: 'Deadlocks' }),
    ]

    // Uploaded-only must survive four real answers and move the adaptive rung.
    const ladder = []
    for (let step = 1; step <= 4; step += 1) {
      const generated = await generate({
        tag: `04-exact-${step}`, topic: exactTopic, uploadedOnly: true,
      })
      assert.equal(generated.status, 200)
      assert.equal(JSON.parse(generated.payload).uploaded_only, true)
      const citesPdf = Boolean(generated.question.source_chunks?.includes('qm_pdf_os_paging.pdf'))
      if (step === 1) assert.ok(citesPdf, 'first uploaded-only question must cite the PDF chunk')
      assert.ok(
        citesPdf || /page|frame|paging|virtual memory/i.test(generated.question.question),
        `question ${step} is not grounded in the PDF text: ${generated.question.question}`
      )
      const submitted = await answerAndSubmit({
        tag: `04-exact-${step}-answer`,
        answer: generated.question.correct_answer || 'A page is a fixed-size block of virtual address space.',
      })
      ladder.push({
        step,
        source: generated.question.source,
        source_chunk: generated.question.source_chunks?.join(', ') || '(LLM text grounded in context)',
        rung: rungOf(generated.question),
        answer_score: submitted.body.score,
      })
    }

    // The PDF's stored title differs from the typed topic: no title-string guard.
    const titleDiffers = await generate({
      tag: '05-title-differs', topic: mismatchTopic, uploadedOnly: true,
    })
    assert.equal(titleDiffers.status, 200)
    assert.equal(JSON.parse(titleDiffers.payload).subject, null)
    assert.ok(
      titleDiffers.question.source_chunks?.includes('virtual-memory-primer.pdf')
      || /page|frame|virtual memory/i.test(titleDiffers.question.question),
      `title-differs question is not grounded in the PDF: ${titleDiffers.question.question}`
    )
    assert.equal(titleDiffers.question.served_topic, 'Virtual Memory Primer')
    assert.doesNotMatch(titleDiffers.visible, /No uploaded material covers this topic/i)
    const notice = titleDiffers.visible.match(
      /No exact match for “Virtual Memory”.+?recorded under “Virtual Memory Primer”./
    )?.[0] ?? ''
    const titleAnswer = await answerAndSubmit({
      tag: '05-title-differs-answer',
      answer: titleDiffers.question.correct_answer || 'The page table',
    })

    // Two PDFs on two subjects: a DBMS query must not fall into the OS PDF.
    const dbms = await generate({ tag: '06-two-pdfs-dbms', topic: 'Deadlocks', uploadedOnly: true })
    assert.equal(dbms.status, 200)
    assert.ok(
      dbms.question.source_chunks?.includes('qm_pdf_dbms_deadlocks.pdf')
      || /deadlock|circular wait|mutual exclusion/i.test(dbms.question.question),
      `DBMS query served the wrong PDF: ${dbms.question.question}`
    )
    assert.equal(dbms.question.served_topic, 'Deadlocks')
    const dbmsAnswer = await answerAndSubmit({
      tag: '06-two-pdfs-dbms-answer', answer: dbms.question.correct_answer || 'A deadlock is a cycle of waiting.',
    })

    const osAfterTwo = await generate({
      tag: '07-two-pdfs-os', topic: mismatchTopic, uploadedOnly: true,
    })
    assert.equal(osAfterTwo.status, 200)
    assert.ok(
      osAfterTwo.question.source_chunks?.includes('virtual-memory-primer.pdf')
      || /page|frame|virtual memory/i.test(osAfterTwo.question.question),
      `OS query served the wrong PDF: ${osAfterTwo.question.question}`
    )
    assert.ok(!osAfterTwo.question.source_chunks?.includes('qm_pdf_dbms_deadlocks.pdf'))

    result = {
      mode, suite, email,
      uploads: uploads.map((upload) => ({
        status: upload.status, document: upload.body.document,
        subject: upload.subject, topic: upload.topic, chunks: upload.body.chunks_ingested,
      })),
      ladder,
      titleDiffers: {
        requested: mismatchTopic,
        served: titleDiffers.question.served_topic,
        source: titleDiffers.question.source,
        source_chunks: titleDiffers.question.source_chunks,
        question: titleDiffers.question.question,
        notice,
        served_badge: titleAnswer.servedBadge,
        answer_score: titleAnswer.body.score,
        visible: titleDiffers.visible,
      },
      twoPdfs: {
        dbms: { source_chunks: dbms.question.source_chunks, served: dbms.question.served_topic, question: dbms.question.question },
        dbms_answer_score: dbmsAnswer.body.score,
        os: { source_chunks: osAfterTwo.question.source_chunks, served: osAfterTwo.question.served_topic, question: osAfterTwo.question.question },
      },
    }
    console.log('\n' + table(['step', 'source', 'chunk', 'rung', 'score'], ladder.map((row) => [
      row.step, row.source, row.source_chunk, row.rung, row.answer_score,
    ])) + '\n')
    console.log('title-differs UI text:', notice)
    console.log('title-differs served badge:', titleAnswer.servedBadge)
    console.log('two PDFs:', JSON.stringify(result.twoPdfs, null, 2))
    assert.deepEqual(ladder.map((row) => row.rung), [0, 1, 2, 3])
    assert.ok(ladder.every((row) => row.answer_score >= 0.75))
    assert.match(notice, /recorded under “Virtual Memory Primer”/)
    assert.match(titleAnswer.servedBadge ?? '', /Served topic: Virtual Memory Primer/)
  }

  if (suite === 'novel') {
    const novel = 'Amoeba Tax Accounting'
    const steps = []
    for (let step = 1; step <= 4; step += 1) {
      const generated = await generate({ tag: `novel-${step}`, topic: novel })
      assert.equal(generated.status, 200)
      const served = generated.question.served_topic || generated.question.topic || novel
      const expectedNotice = served.toLowerCase() === novel.toLowerCase()
        ? null
        : `No exact match for “${novel}”. This is a related practice question from “${served}”. Your answer will be recorded under “${served}”.`
      if (expectedNotice) {
        assert.ok(generated.visible.includes(expectedNotice), `missing fallback notice: ${expectedNotice}`)
      }
      const submitted = await answerAndSubmit({
        tag: `novel-${step}-answer`,
        answer: generated.question.correct_answer || 'A brief answer.',
      })
      if (expectedNotice) {
        assert.equal(submitted.servedBadge, `Served topic: ${served}`)
      }
      steps.push({
        step,
        source: generated.question.source,
        requested: novel,
        served,
        notice: Boolean(expectedNotice),
        badge: submitted.servedBadge,
        score: submitted.body.score,
      })
    }

    const token = await page.evaluate(() => localStorage.getItem('qm_token'))
    const me = await (await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    const history = await (await fetch(`${apiBase}/attempts/history/${me.user_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    const latest = history[0]
    assert.equal(latest.topic, steps.at(-1).served, 'attempt must be stored under the served topic')

    result = { mode, suite, email, novel, steps, latest_history: latest }
    console.log('\n' + table(['step', 'source', 'served topic', 'notice', 'badge', 'score'], steps.map((row) => [
      row.step, row.source, row.served, String(row.notice), row.badge ?? '-', row.score,
    ])) + '\n')
    console.log('latest attempt:', JSON.stringify(latest))
    assert.equal(steps.length, 4)
    if (mode === 'offline') {
      assert.ok(steps.some((row) => row.notice), 'offline fallback must say when the served topic differs')
    }
  }

  if (suite === 'network') {
    const topic = 'Paging and Virtual Memory'
    const client = await context.newCDPSession(page)
    const setNetwork = async (slow) => client.send('Network.emulateNetworkConditions', slow ? {
      offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024,
    } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

    await setNetwork(true)
    const slow = await generate({ tag: 'slow-3g', topic })
    assert.equal(slow.status, 200)
    assert.ok(slow.progressVisible, 'progress panel must be visible while generating')
    assert.ok(slow.elapsed < 35, `slow 3G generation took ${slow.elapsed}s (deadline 35s)`)
    await shot('slow-3g-question')

    const submitted = await answerAndSubmit({
      tag: 'slow-3g-answer', answer: slow.question.correct_answer || 'mutual exclusion',
    })
    assert.equal(submitted.status, 200)
    await setNetwork(false)

    // With the LLM endpoint blocked at the container/host level, the fallback
    // still has to give the learner a question inside the same deadline.
    const blocked = await generate({ tag: 'llm-blocked', topic })
    if (blocked.status === 200 && blocked.question) await shot('llm-blocked-question')
    result = { mode, suite, email, slow: { elapsed: slow.elapsed, progressVisible: slow.progressVisible, source: slow.question.source }, submitted: submitted.body.score, blocked }
    console.log('\n' + table(['scenario', 'seconds to question', 'progress shown', 'source'], [
      ['slow 3G', slow.elapsed.toFixed(2), String(slow.progressVisible), slow.question.source],
      ['LLM blocked', blocked.elapsed?.toFixed(2) ?? '-', String(blocked.progressVisible ?? false), blocked.question?.source ?? '-'],
    ]) + '\n')
    assert.equal(blocked.status, 200)
    assert.ok(blocked.question, 'blocked LLM must still produce a usable question')
    assert.ok(blocked.elapsed < 35, `blocked-LLM generation took ${blocked.elapsed}s`)
  }

  if (suite === 'dbdown') {
    const topic = 'Paging and Virtual Memory'
    const generated = await generate({ tag: 'dbdown-generate', topic })

    // Submit needs a question already on screen; the session URL is captured
    // before the DB is stopped.
    const seed = JSON.parse(fs.readFileSync(path.resolve(
      process.env.TEMP ?? 'C:\\Users\\omsat\\AppData\\Local\\Temp',
      'opencode', 'qm_db_seed.json'
    ), 'utf8'))
    const sessionUrl = seed.sessionUrl
    await page.goto(sessionUrl, { waitUntil: 'networkidle' })
    const answerInput = page.getByLabel('Your answer')
    for (let index = 0; index < 6 && !(await answerInput.count()); index += 1) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
    await answerInput.waitFor({ timeout: 10000 })
    await answerInput.fill('a short answer')
    // "Review and submit" only appears on the last question.
    const reviewButton = page.getByRole('button', { name: 'Review and submit' })
    for (let index = 0; index < 6 && !(await reviewButton.count()); index += 1) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
    await reviewButton.waitFor({ timeout: 10000 })
    const submitResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/attempts/submit') && response.status() >= 500,
      { timeout: 60000 }
    )
    await reviewButton.click()
    const confirmDialog = page.getByRole('dialog')
    await confirmDialog.waitFor({ timeout: 10000 })
    await confirmDialog.getByRole('button', { name: 'Submit' }).click()
    const submitResponse = await submitResponsePromise
    const submitBody = await submitResponse.json()
    await page.getByText(/database is temporarily unavailable/i).first().waitFor({ timeout: 10000 })
    await shot('dbdown-submit')
    const submitView = await visibleText()
    const retryVisible = await page.getByRole('dialog').getByRole('button', { name: 'Retry' }).isVisible()

    result = {
      mode, suite, email,
      generate: { status: generated.status, code: generated.body?.code, view: generated.visible, elapsed: generated.elapsed },
      submit: { body: submitBody, view: submitView, retryVisible },
    }
    console.log('\n' + table(['action', 'HTTP', 'code', 'friendly message shown', 'Retry shown'], [
      ['generate', generated.status, generated.body?.code,
        String(/database is temporarily unavailable/i.test(generated.visible ?? '')),
        String(await page.getByRole('button', { name: 'Generate questions' }).isVisible().catch(() => false))],
      ['submit', submitResponse.status(), submitBody.code,
        String(/database is temporarily unavailable/i.test(submitView)),
        String(retryVisible)],
    ]) + '\n')
    assert.equal(generated.status, 503)
    assert.equal(generated.body?.code, 'DB_UNAVAILABLE')
    assert.match(generated.visible ?? '', /database is temporarily unavailable/i)
    assert.equal(submitResponse.status(), 503)
    assert.equal(submitBody.code, 'DB_UNAVAILABLE')
    assert.match(submitView, /database is temporarily unavailable/i)
    assert.equal(retryVisible, true)
  }

  result.consoleErrors = consoleErrors
  result.pageErrors = pageErrors
  result.failedRequests = failedRequests
  result.badResponses = badResponses
  result.shots = shots
  console.log(JSON.stringify(result, null, 2))
  if (suite !== 'dbdown') {
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
  }
  console.log(`PASS ${mode}/${suite}`)
} catch (error) {
  await page.screenshot({ path: path.join(shotDir, '99-failure.png'), fullPage: true }).catch(() => {})
  console.log(JSON.stringify({
    failure: String(error),
    visible: await visibleText().catch(() => ''),
    shots, network, consoleErrors, pageErrors, failedRequests, badResponses,
  }, null, 2))
  throw error
} finally {
  await browser.close()
}
