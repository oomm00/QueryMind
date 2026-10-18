/**
 * uploadValidation — the browser-side half of the upload contract. The limits
 * mirror ingestion_service (extension list, 10 MB cap); a rejection here
 * costs no bytes, so every message names the file it is about.
 */

import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  fileExtension,
  formatMegabytes,
  validateFile,
} from './uploadValidation.js'

function file(name, size = 1024) {
  return { name, size }
}

describe('fileExtension', () => {
  it('lowercases the extension after the last dot', () => {
    expect(fileExtension('Notes.PDF')).toBe('.pdf')
    expect(fileExtension('a.b.docx')).toBe('.docx')
  })

  it('answers empty for names without a dot', () => {
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('')).toBe('')
    expect(fileExtension(undefined)).toBe('')
  })
})

describe('validateFile', () => {
  it('accepts each documented type at the size limit', () => {
    for (const ext of ACCEPTED_EXTENSIONS) {
      expect(validateFile(file(`notes${ext}`, MAX_FILE_SIZE_BYTES))).toBeNull()
    }
  })

  it('names the file and the alternatives for an unsupported type', () => {
    const message = validateFile(file('slides.pptx'))

    expect(message).toContain('slides.pptx')
    expect(message).toContain('.pptx')
    expect(message).toContain('PDF, DOCX, TXT or MD')
  })

  it('reports a file with no extension', () => {
    expect(validateFile(file('NOTES'))).toContain('no extension')
  })

  it('rejects an empty file', () => {
    expect(validateFile(file('notes.txt', 0))).toContain('empty')
  })

  it('rejects over the 10 MB cap with both sizes in the message', () => {
    const message = validateFile(file('huge.md', MAX_FILE_SIZE_BYTES + 128 * 1024))

    expect(message).toContain('huge.md')
    expect(message).toContain('10.0 MB')
    expect(message).toContain('10.1 MB')
  })

  it('rejects a missing file', () => {
    expect(validateFile(null)).toBeTruthy()
  })
})

describe('formatMegabytes', () => {
  it('reads bytes as MB with one decimal', () => {
    expect(formatMegabytes(MAX_FILE_SIZE_BYTES)).toBe('10.0 MB')
    expect(formatMegabytes(0)).toBe('0.0 MB')
  })
})
