/**
 * uploadValidation — the client-side half of the upload contract.
 *
 * The backend rejects the same things (extension, empty body, 10 MB cap), but
 * only after the bytes have travelled: checking first means the student reads
 * the reason next to the file instead of watching a spinner fail. Messages
 * stay specific — which file, which limit — because a queue can hold several.
 */

/** Mirrors ingestion_service's accepted extensions, lowercase with the dot. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']

/** Mirrors ingestion_service.MAX_FILE_SIZE_BYTES (10 MB). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** "1048576" -> "1.0 MB" */
export function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Lowercased extension including the dot ('' when the name has no dot). */
export function fileExtension(name = '') {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Why this file cannot be uploaded, or null when it can.
 * @param {File} file
 * @returns {string|null}
 */
export function validateFile(file) {
  if (!file) return 'No file selected.'

  const ext = fileExtension(file.name)
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return ext
      ? `${file.name}: ${ext} files aren't supported. Use PDF, DOCX, TXT or MD.`
      : `${file.name}: that file has no extension. Use PDF, DOCX, TXT or MD.`
  }

  if (file.size === 0) return `${file.name} is empty. Add content before uploading.`

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name} is ${formatMegabytes(file.size)} — the limit is ${formatMegabytes(MAX_FILE_SIZE_BYTES)}.`
  }

  return null
}
