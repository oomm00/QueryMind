/**
 * Documents Endpoints
 * ===================
 * Upload plus the two reads the Upload page builds on: the caller's document
 * table (GET /documents) and the distinct subject/topic pairs that both the
 * Upload and Generate pages suggest from (GET /documents/topics) — retrieval
 * filters on an exact subject/topic match, so free text would typo itself
 * into an empty context.
 *
 * Every call carries a deadline: an upload that hangs inside the extractor,
 * or a picker waiting on a silent server, must become an explained TIMEOUT
 * rather than a spinner that never ends.
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { mockDocumentUploadResponse } from '../mocks/data/extended.mock.js'

/** Extraction + embedding of a 10 MB file can genuinely take a while. */
export const UPLOAD_TIMEOUT_MS = 120_000

/** Small reads over an authenticated endpoint should never dangle. */
export const READ_TIMEOUT_MS = 30_000

/** Mock rows keep the shape of the real responses (newest first). */
const MOCK_DOCUMENTS = [
  {
    document_id: 'doc-2',
    filename: 'dbms_transactions.md',
    subject: 'DBMS',
    topic: 'Transactions',
    source_type: 'public',
    course: null,
    status: 'ready',
    chunk_count: 5,
    created_at: '2026-01-02T12:00:00.000Z',
  },
  {
    document_id: 'doc-1',
    filename: 'os_deadlocks.md',
    subject: 'OS',
    topic: 'Deadlocks',
    source_type: 'college',
    course: null,
    status: 'ready',
    chunk_count: 6,
    created_at: '2026-01-01T12:00:00.000Z',
  },
]

const MOCK_TOPICS = [
  { subject: 'DBMS', topics: ['Transactions'] },
  { subject: 'OS', topics: ['Deadlocks'] },
]

export const documentsEndpoints = {
  /**
   * Uploads a document via multipart/form-data
   * @param {FormData|File} fileData
   * @param {{timeout?: number}} [options] - deadline in ms (default 120s)
   * @returns {Promise<{ document_id: string, status: string }>}
   */
  async upload(fileData, { timeout = UPLOAD_TIMEOUT_MS } = {}) {
    if (isMocked('documents')) {
      await delay(250)
      return mockDocumentUploadResponse
    }

    const body = fileData instanceof FormData ? fileData : (() => {
      const fd = new FormData()
      fd.append('file', fileData)
      return fd
    })()

    return apiFetch('/documents/upload', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(timeout),
    })
  },

  /**
   * The caller's own documents, newest first.
   * @returns {Promise<Array<{document_id, filename, subject, topic, source_type, course, status, chunk_count, created_at}>>}
   */
  async list({ timeout = READ_TIMEOUT_MS } = {}) {
    if (isMocked('documents')) {
      await delay(250)
      return MOCK_DOCUMENTS
    }

    return apiFetch('/documents', { signal: AbortSignal.timeout(timeout) })
  },

  /**
   * Distinct subject/topic pairs from the caller's documents, A-Z.
   * @returns {Promise<Array<{subject: string, topics: string[]}>>}
   */
  async topics({ timeout = READ_TIMEOUT_MS } = {}) {
    if (isMocked('documents')) {
      await delay(250)
      return MOCK_TOPICS
    }

    return apiFetch('/documents/topics', { signal: AbortSignal.timeout(timeout) })
  },
}

export const documentsApi = documentsEndpoints
