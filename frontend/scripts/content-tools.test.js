/**
 * The content tools that are not the validator: reading the resource URLs out of
 * the content, classifying a link check, reading a page title, and deciding where
 * an imported topic file would land. No test here touches the network.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkUrl, classifyStatus, collectResourceUrls, extractTitle, summarise } from './check-links.mjs'
import {
  indexDistribution,
  mcqAnswers,
  planImport,
  seedFromId,
  seededRandom,
  shuffleQuestion,
  slugFromFile,
  topicToFiles,
} from './import-content.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '__fixtures__')
const VALID = join(FIXTURES, 'valid')
const INVALID = join(FIXTURES, 'invalid')
const WARNINGS = join(FIXTURES, 'warnings')
const FAKE_TOPIC = JSON.parse(readFileSync(join(FIXTURES, 'import', 'fake-topic.json'), 'utf8'))

/** A fetch that answers once, so checkUrl can be tested without a network. */
function respond({ status = 200, contentType = 'text/html', body = '' } = {}) {
  return async () => ({
    status,
    headers: { get: () => contentType },
    text: async () => body,
  })
}

describe('collectResourceUrls', () => {
  it('lists every resource URL with the concept that uses it', () => {
    expect(collectResourceUrls(VALID)).toEqual([
      { url: 'https://example.com/fixture-reading', where: ['First concept'] },
    ])
  })

  it('collects whatever is authored, however many there are', () => {
    const urls = collectResourceUrls(INVALID)
    expect(urls).toHaveLength(4)
    expect(urls[0].where).toEqual(['First concept'])
  })

  it('has nothing to collect in a folder with no content, or one it cannot read', () => {
    expect(collectResourceUrls(join(FIXTURES, 'empty'))).toEqual([])
    expect(collectResourceUrls(join(FIXTURES, 'no-such-folder'))).toEqual([])
  })

  it('reads the material of a concept that lives in its own file, once per URL', () => {
    const urls = collectResourceUrls(WARNINGS)

    expect(urls.map((entry) => entry.url)).toEqual([
      'https://example.com/delta-guide',
      'https://example.com/shared-guide',
    ])
    expect(urls[1].where).toEqual(['Alpha basics', 'Beta basics', 'Gamma basics'])
  })
})

describe('classifyStatus', () => {
  it('calls a success a success', () => {
    expect(classifyStatus(200)).toBe('ok')
    expect(classifyStatus(204)).toBe('ok')
    expect(classifyStatus(299)).toBe('ok')
  })

  it('asks for a hand check when the site refuses a robot', () => {
    expect(classifyStatus(403)).toBe('hand-check')
    expect(classifyStatus(429)).toBe('hand-check')
    expect(classifyStatus(999)).toBe('hand-check')
  })

  it('calls anything else broken, including no answer at all', () => {
    expect(classifyStatus(301)).toBe('broken')
    expect(classifyStatus(404)).toBe('broken')
    expect(classifyStatus(500)).toBe('broken')
    expect(classifyStatus(null)).toBe('broken')
    expect(classifyStatus(undefined)).toBe('broken')
  })
})

describe('extractTitle', () => {
  it('reads the title, decodes entities and collapses whitespace', () => {
    expect(
      extractTitle('<html><head><title>Paging &amp; \n  frames</title></head></html>', 'text/html')
    ).toBe('Paging & frames')
  })

  it('has no title to give for a page without one, or that is not HTML', () => {
    expect(extractTitle('<html><body>No title here</body></html>', 'text/html')).toBeNull()
    expect(extractTitle('{"title": "Not HTML"}', 'application/json')).toBeNull()
    expect(extractTitle('')).toBeNull()
    expect(extractTitle(null)).toBeNull()
  })

  it('keeps a title to a readable length', () => {
    const long = `<title>${'x'.repeat(500)}</title>`
    expect(extractTitle(long, 'text/html')).toHaveLength(200)
  })
})

describe('checkUrl', () => {
  it('reads the title of a page that answers', async () => {
    const result = await checkUrl('https://example.com/?pass', {
      fetchImpl: respond({ status: 200, body: '<title>Example page</title>' }),
    })

    expect(result).toEqual({
      url: 'https://example.com/?pass',
      status: 200,
      result: 'ok',
      title: 'Example page',
      error: null,
    })
  })

  it('reports a refusal as a hand check, without reading the body', async () => {
    const result = await checkUrl('https://example.com/?refused', {
      fetchImpl: respond({ status: 403, body: '<title>Nope</title>' }),
    })

    expect(result.result).toBe('hand-check')
    expect(result.title).toBeNull()
  })

  it('reports a missing page as broken', async () => {
    const result = await checkUrl('https://example.com/?gone', { fetchImpl: respond({ status: 404 }) })
    expect(result).toMatchObject({ status: 404, result: 'broken', error: null })
  })

  it('reports a network failure as broken, with the reason', async () => {
    const result = await checkUrl('https://example.com/?down', {
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      },
    })

    expect(result.result).toBe('broken')
    expect(result.status).toBeNull()
    expect(result.error).toContain('ENOTFOUND')
  })

  it('gives up on a request that never answers', async () => {
    const result = await checkUrl('https://example.com/?slow', {
      timeoutMs: 5,
      fetchImpl: (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    })

    expect(result).toMatchObject({ result: 'broken', status: null })
    expect(result.error).toContain('timed out after 5ms')
  })
})

describe('summarise', () => {
  it('counts each outcome', () => {
    expect(
      summarise([
        { result: 'ok' },
        { result: 'ok' },
        { result: 'hand-check' },
        { result: 'broken' },
      ])
    ).toEqual({ total: 4, ok: 2, handCheck: 1, broken: 1 })
    expect(summarise([])).toEqual({ total: 0, ok: 0, handCheck: 0, broken: 0 })
  })
})

describe('planImport', () => {
  const topic = { id: 'new-topic', title: 'New topic', concepts: { one: { id: 'one' } } }

  it('sends an object-style topic to topic.json in its own folder', () => {
    const plan = planImport({ data: topic, file: 'anywhere.json', courseId: 'os', rootDir: 'content' })
    expect(plan.problems).toEqual([])
    expect(plan.isFolder).toBe(true)
    expect(plan.target).toBe(join('content', 'os', 'new-topic', 'topic.json'))
  })

  it('sends a list-style topic to <topic-id>.json', () => {
    const plan = planImport({
      data: { id: 'flat-topic', title: 'Flat', concepts: ['one', 'two'] },
      file: 'flat-topic.json',
      courseId: 'os',
      rootDir: 'content',
    })
    expect(plan.problems).toEqual([])
    expect(plan.isFolder).toBe(false)
    expect(plan.target).toBe(join('content', 'os', 'flat-topic.json'))
  })

  it('takes the topic id from the file name, or from --topic when given', () => {
    expect(slugFromFile('C:\\authored\\Virtual Memory.json')).toBe('virtual memory')
    expect(
      planImport({ data: { concepts: {} }, file: 'memory-basics.json', courseId: 'os' }).topicId
    ).toBe('memory-basics')
    expect(
      planImport({
        data: { concepts: {} },
        file: 'memory-basics.json',
        courseId: 'os',
        topicId: 'chosen-topic',
      }).topicId
    ).toBe('chosen-topic')
  })

  it('refuses a lesson, a file with no concepts, a missing course and a bad id', () => {
    const lesson = planImport({
      data: { id: 'lesson', blocks: [] },
      file: 'lesson.json',
      courseId: 'os',
    })
    expect(lesson.problems[0]).toContain('is a lesson — only topic files are imported')

    const nothing = planImport({ data: { title: 'Nothing' }, file: 'nothing.json', courseId: 'os' })
    expect(nothing.problems[0]).toContain('has no "concepts"')

    const noCourse = planImport({ data: topic, file: 'new-topic.json', courseId: '' })
    expect(noCourse.problems[0]).toContain('a course id is required')

    const badId = planImport({ data: topic, file: 'new-topic.json', courseId: 'os', topicId: 'Not An Id' })
    expect(badId.problems[0]).toContain('must be lower-case words separated by dashes')
  })
})

describe('a file whose concepts are whole objects', () => {
  const plan = planImport({
    data: FAKE_TOPIC,
    file: 'fake-topic.json',
    courseId: 'os',
    rootDir: 'content',
  })

  it('lands as topic.json plus one file per concept', () => {
    expect(plan.problems).toEqual([])
    expect(plan.shape).toBe('concepts')
    expect(plan.isFolder).toBe(true)
    expect(plan.target).toBe(join('content', 'os', 'fake-topic', 'topic.json'))
    expect(plan.targets).toHaveLength(5)
    expect(plan.targets[1]).toBe(
      join('content', 'os', 'fake-topic', 'concepts', 'fake-topic-c1.json')
    )
  })

  it('keeps the concepts out of topic.json, in the order the file had them', () => {
    const { documents } = topicToFiles(FAKE_TOPIC, { courseId: 'os', topicId: 'fake-topic' })

    expect(documents[0].path).toBe('os/fake-topic/topic.json')
    expect(documents[0].data).toEqual({
      id: 'fake-topic',
      title: 'Fake topic for the importer tests',
      summary: 'Four fake concepts, six fake questions each.',
      conceptIds: ['fake-topic-c1', 'fake-topic-c2', 'fake-topic-c3', 'fake-topic-c4'],
    })
    expect(documents[0].data.questions).toBeUndefined()
    expect(documents[1].path).toBe('os/fake-topic/concepts/fake-topic-c1.json')
    expect(documents[1].data.id).toBe('fake-topic-c1')
    expect(documents).toHaveLength(5)
  })

  it('asks for a dashed id on every concept', () => {
    const noId = planImport({
      data: { topic: { id: 'fake-topic' }, concepts: [{ title: 'No id here' }] },
      file: 'fake-topic.json',
      courseId: 'os',
    })

    expect(noId.problems.join('\n')).toContain('concept 1 needs a lower-case dashed id, found ""')
  })
})

describe('the option shuffle', () => {
  it('carries the answer with its option and leaves short answers alone', () => {
    const question = {
      id: 'fake-topic-c1-q1',
      type: 'mcq',
      options: ['right', 'wrong one', 'wrong two', 'wrong three'],
      correctIndex: 0,
    }

    const shuffled = shuffleQuestion(question)

    expect(shuffled.options).toHaveLength(4)
    expect([...shuffled.options].sort()).toEqual([...question.options].sort())
    expect(shuffled.options[shuffled.correctIndex]).toBe('right')

    const short = { id: 'fake-topic-c1-q6', type: 'short', answerKey: 'A key' }
    expect(shuffleQuestion(short)).toBe(short)
  })

  it('is a seed, not a dice roll: the same question id always lands the same way', () => {
    const question = {
      id: 'fake-topic-c1-q1',
      type: 'mcq',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    }

    expect(seedFromId('fake-topic-c1-q1')).toBe(seedFromId('fake-topic-c1-q1'))
    expect(shuffleQuestion(question)).toEqual(shuffleQuestion(question))

    const first = seededRandom(seedFromId('x'))
    const second = seededRandom(seedFromId('x'))
    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it('spreads the 20 answers over the four indexes, none holding more than 8', () => {
    const { concepts } = topicToFiles(FAKE_TOPIC, { courseId: 'os', topicId: 'fake-topic' })
    const answers = mcqAnswers(concepts)

    expect(answers).toHaveLength(20)
    const distribution = indexDistribution(answers)
    expect(distribution).toHaveLength(4)

    for (const count of distribution) expect(count).toBeLessThanOrEqual(8)
    // The real rule behind the bound: an answer drift of at most one slot.
    expect(Math.max(...distribution) - Math.min(...distribution)).toBeLessThanOrEqual(1)
  })

  it('writes the same bytes twice, and leaves the authored order when told to', () => {
    const once = topicToFiles(FAKE_TOPIC, { courseId: 'os', topicId: 'fake-topic' })
    const twice = topicToFiles(FAKE_TOPIC, { courseId: 'os', topicId: 'fake-topic' })
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))

    const untouched = topicToFiles(FAKE_TOPIC, {
      courseId: 'os',
      topicId: 'fake-topic',
      shuffle: false,
    })
    expect(indexDistribution(mcqAnswers(untouched.concepts))).toEqual([20])
  })

  it('normalises the resource URLs and touches nothing else in them', () => {
    const { concepts } = topicToFiles(FAKE_TOPIC, { courseId: 'os', topicId: 'fake-topic' })

    expect(concepts[0].resources[0].url).toBe('https://example.com/fake-guide-1')
    expect(concepts[3].resources[0].url).toBe('https://example.com/fake-guide-4')
    expect(concepts[0].resources[0].title).toBe('Fake fixture guide 1')
    expect(concepts[0].questions).toHaveLength(6)
  })
})
