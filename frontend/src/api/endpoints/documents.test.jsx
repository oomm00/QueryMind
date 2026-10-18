/**
 * The document endpoints carry a deadline with every call: uploads to the
 * extractor and small reads to the picker both refuse to dangle silently.
 * What the backend answers passes through untouched — the shapes are the
 * backend's contract (backend/tests/test_documents_api.py pins them there).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, apiFetch: vi.fn() }
})

import { apiFetch } from '../client.js'
import { documentsApi } from './documents.js'

beforeEach(() => {
  vi.stubEnv('VITE_MOCK_DOCUMENTS', 'false')
  apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('documentsApi.list', () => {
  it('GETs /documents with a deadline signal and returns the rows as-is', async () => {
    const rows = [
      {
        document_id: 'doc-1',
        filename: 'deadlocks.md',
        subject: 'OS',
        topic: 'Deadlocks',
        source_type: 'college',
        course: null,
        status: 'ready',
        chunk_count: 6,
        created_at: '2026-01-01T12:00:00.000Z',
      },
    ]
    apiFetch.mockResolvedValue(rows)

    const result = await documentsApi.list()

    expect(result).toEqual(rows)
    const [path, options] = apiFetch.mock.calls[0]
    expect(path).toBe('/documents')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('documentsApi.topics', () => {
  it('GETs /documents/topics with a deadline signal and returns the rows as-is', async () => {
    const rows = [{ subject: 'OS', topics: ['Deadlocks', 'Paging'] }]
    apiFetch.mockResolvedValue(rows)

    const result = await documentsApi.topics()

    expect(result).toEqual(rows)
    const [path, options] = apiFetch.mock.calls[0]
    expect(path).toBe('/documents/topics')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('documentsApi.upload', () => {
  it('POSTs the FormData to /documents/upload with the upload deadline', async () => {
    apiFetch.mockResolvedValue({ document_id: 'doc-9', status: 'ready' })
    const body = new FormData()

    await documentsApi.upload(body)

    const [path, options] = apiFetch.mock.calls[0]
    expect(path).toBe('/documents/upload')
    expect(options.method).toBe('POST')
    expect(options.body).toBe(body)
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('wraps a bare File into multipart form data', async () => {
    apiFetch.mockResolvedValue({ document_id: 'doc-10', status: 'ready' })
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' })

    await documentsApi.upload(file)

    const [, options] = apiFetch.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file')).toBe(file)
  })

  it('honours an explicit timeout override', async () => {
    apiFetch.mockResolvedValue({ document_id: 'doc-11', status: 'ready' })

    await documentsApi.upload(new FormData(), { timeout: 5_000 })

    const [, options] = apiFetch.mock.calls[0]
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)
  })
})

describe('the mocked documents domain', () => {
  it('serves the mock list without touching the network', async () => {
    vi.stubEnv('VITE_MOCK_DOCUMENTS', 'true')

    const rows = await documentsApi.list()

    expect(apiFetch).not.toHaveBeenCalled()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0]).toHaveProperty('filename')
  })

  it('serves mock topic suggestions without touching the network', async () => {
    vi.stubEnv('VITE_MOCK_DOCUMENTS', 'true')

    const rows = await documentsApi.topics()

    expect(apiFetch).not.toHaveBeenCalled()
    expect(rows[0]).toHaveProperty('subject')
    expect(rows[0]).toHaveProperty('topics')
  })
})
