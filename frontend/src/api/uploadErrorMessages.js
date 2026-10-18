/**
 * uploadErrorMessages — one actionable sentence per way an upload can fail.
 *
 * POST /documents/upload answers `{ detail, code }`; detail is written for the
 * logs (and varies per validation), so the page maps the stable code — or the
 * status when the body never arrived — to a sentence a student can act on.
 * Never a raw code, never the backend's detail.
 */

/** The backend's codes, verbatim, plus the two that need no body. */
export const UPLOAD_ERROR_MESSAGES = Object.freeze({
  FILE_TOO_LARGE: 'That file is over the 10 MB limit. Upload a smaller file.',
  VALIDATION_ERROR:
    "The server rejected that file. Use a PDF, DOCX, TXT or MD that isn't empty.",
  AUTHENTICATION_ERROR: 'Your session has expired. Sign in again, then retry the upload.',
  RATE_LIMIT_EXCEEDED: 'Too many uploads in a row. Wait a moment, then try again.',
  TIMEOUT: 'The upload took too long. Check your connection and try again.',
  INTERNAL_ERROR: 'Something went wrong on the server. Try again in a moment.',
})

/**
 * The sentence for this failure.
 * @param {{status?: number, data?: {code?: string}}} error - an ApiError from apiFetch
 * @returns {string}
 */
export function uploadErrorMessage(error) {
  const code = error?.data?.code
  if (code && UPLOAD_ERROR_MESSAGES[code]) return UPLOAD_ERROR_MESSAGES[code]

  const status = error?.status
  if (status === 401) return UPLOAD_ERROR_MESSAGES.AUTHENTICATION_ERROR
  if (status === 413) return UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE
  if (status === 0) return "We couldn't reach the server. Check your connection and try again."
  if (typeof status === 'number' && status >= 500) return UPLOAD_ERROR_MESSAGES.INTERNAL_ERROR

  return 'Something went wrong. Try again.'
}
