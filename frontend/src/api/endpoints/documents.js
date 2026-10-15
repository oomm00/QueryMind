/**
 * Documents Endpoints
 */

import { apiFetch } from '../client.js'
import { isMocked, delay } from '../mocks/config.js'
import { mockDocumentUploadResponse } from '../mocks/data/extended.mock.js'

export const documentsEndpoints = {
  /**
   * Uploads a document via multipart/form-data
   * @param {FormData|File} fileData
   * @returns {Promise<{ document_id: string, status: string }>}
   */
  async upload(fileData) {
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
    })
  },
}
