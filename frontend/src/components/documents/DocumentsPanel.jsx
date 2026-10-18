/**
 * DocumentsPanel — get a student's notes into the knowledge base, and show what
 * is already there.
 *
 * One panel, two jobs that belong together: the dropzone queues files with the
 * client-side type/10 MB checks (a rejection costs no upload), Subject and
 * Topic tag the batch — retrieval filters on an exact match, so both are
 * suggested from what has been uploaded before — and the table below lists
 * GET /documents. Files upload one at a time so every row carries its own
 * outcome; a failure never blocks the rows behind it.
 *
 * This is the Documents tab of My notes. It used to be a page of its own; the
 * heading belongs to the page now, so the panel starts at the form.
 */

import React, { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { documentsApi } from '../../api/endpoints/documents.js'
import { uploadErrorMessage } from '../../api/uploadErrorMessages.js'
import { useDocuments, useDocumentTopics } from '../../hooks/useDocuments.js'
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  formatMegabytes,
  validateFile,
} from '../../lib/uploadValidation.js'
import { subjectList, topicsFor } from '../../lib/topicSuggestions.js'
import { Button, buttonClasses } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { IconAlert, IconCheck, IconClose, IconDocs, IconUpload } from '../ui/Icons'
import { Input } from '../ui/Input'
import { Panel, PanelLarge, PanelSmall } from '../ui/Panel'
import { Select } from '../ui/Select'
import { Toast } from '../ui/Toast'
import { cx } from '../../lib/cx'

const SOURCE_OPTIONS = [
  { value: 'college', label: 'College material' },
  { value: 'public', label: 'Public reference' },
]

const SOURCE_LABELS = Object.fromEntries(SOURCE_OPTIONS.map((opt) => [opt.value, opt.label]))

/** "2026-01-01T12:00:00Z" -> "Jan 1, 2026"; anything unparseable -> "—". */
function formatDate(iso) {
  const time = Date.parse(iso ?? '')
  if (Number.isNaN(time)) return '—'
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function QueueIcon({ status }) {
  if (status === 'uploading') {
    return (
      <span
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden="true"
      />
    )
  }
  if (status === 'done') return <IconCheck size={16} className="mt-0.5 shrink-0 text-success" />
  if (status === 'error') return <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
  return <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
}

function queueDetail(item) {
  if (item.status === 'error') return item.message
  if (item.status === 'uploading') return 'Uploading…'
  if (item.status === 'done') {
    const chunks = `${item.chunks ?? 0} chunk${item.chunks === 1 ? '' : 's'}`
    return `${item.resultSubject} / ${item.resultTopic} — ${chunks}`
  }
  return `${formatMegabytes(item.size)} — ready`
}

export function DocumentsPanel() {
  const queryClient = useQueryClient()
  const documents = useDocuments()
  const topicsQuery = useDocumentTopics()

  const nextId = useRef(1)
  const inputRef = useRef(null)

  const [queue, setQueue] = useState([])
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [sourceType, setSourceType] = useState('college')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [toast, setToast] = useState(null)

  const subjects = useMemo(() => subjectList(topicsQuery.data), [topicsQuery.data])
  const topicSuggestions = useMemo(
    () => topicsFor(topicsQuery.data, subject),
    [topicsQuery.data, subject]
  )

  const pendingCount = queue.filter((item) => item.status !== 'done').length
  const doneCount = queue.length - pendingCount

  const addFiles = (fileList) => {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setQueue((prev) => [
      ...prev,
      ...files.map((file) => {
        const problem = validateFile(file)
        return {
          id: nextId.current++,
          file,
          name: file.name,
          size: file.size,
          status: problem ? 'error' : 'ready',
          message: problem,
          chunks: null,
          resultSubject: null,
          resultTopic: null,
        }
      }),
    ])
    // Reset so choosing the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = ''
  }

  const removeFile = (id) => setQueue((prev) => prev.filter((item) => item.id !== id))

  const clearFinished = () =>
    setQueue((prev) => prev.filter((item) => item.status !== 'done'))

  const handleSubmit = async (event) => {
    event.preventDefault()

    const errors = {}
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const pending = queue.filter((item) => item.status !== 'done')
    if (pending.length === 0 || uploading) return

    setUploading(true)
    setProgress({ done: 0, total: pending.length })

    let succeeded = 0
    let done = 0
    try {
      for (const item of pending) {
        setQueue((prev) =>
          prev.map((row) => (row.id === item.id ? { ...row, status: 'uploading', message: null } : row))
        )

        try {
          const body = new FormData()
          body.append('file', item.file)
          if (subject.trim()) body.append('subject', subject.trim())
          if (topic.trim()) body.append('topic', topic.trim())
          body.append('source_type', sourceType)

          const result = await documentsApi.upload(body)
          succeeded += 1
          setQueue((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    status: 'done',
                    message: null,
                    chunks: result.chunks_ingested ?? result.chunks_count ?? 0,
                    resultSubject: result.subject ?? subject.trim(),
                    resultTopic: result.topic ?? topic.trim(),
                  }
                : row
            )
          )
        } catch (err) {
          setQueue((prev) =>
            prev.map((row) =>
              row.id === item.id ? { ...row, status: 'error', message: uploadErrorMessage(err) } : row
            )
          )
        }

        done += 1
        setProgress({ done, total: pending.length })
      }

      await queryClient.invalidateQueries({ queryKey: ['documents'] })

      if (succeeded > 0) {
        setToast({
          variant: 'success',
          title: `${succeeded} file${succeeded === 1 ? '' : 's'} uploaded`,
          description: 'Your notes are ready for question generation. You can generate from all uploaded notes without naming a topic.',
        })
      }
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  return (
    <div>
      <PanelLarge>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Dropzone ─────────────────────────────────────── */}
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              addFiles(event.dataTransfer?.files)
            }}
            className={cx(
              'flex flex-col items-center gap-3 rounded-panel border-2 border-dashed px-6 py-9 text-center transition-colors duration-150',
              dragging ? 'border-primary bg-primary-tint' : 'border-line'
            )}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-tint text-primary">
              <IconUpload size={20} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">Drag files here</p>
              <p className="mt-1 text-xs text-muted">
                PDF, DOCX, TXT or MD — up to {formatMegabytes(MAX_FILE_SIZE_BYTES)} each
              </p>
            </div>
            <input
              ref={inputRef}
              id="qm-upload-input"
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              className="peer sr-only"
              onChange={(event) => addFiles(event.target.files)}
            />
            <label
              htmlFor="qm-upload-input"
              className={cx(
                buttonClasses({ variant: 'secondary', size: 'md' }),
                'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'
              )}
            >
              Choose files
            </label>
          </div>

          {/* ── Queue, one row per file, its own outcome ─────── */}
          {queue.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-ink">
                  Files {doneCount > 0 ? 'in this batch' : 'to upload'}
                </h2>
                {doneCount > 0 && !uploading && (
                  <button
                    type="button"
                    onClick={clearFinished}
                    className="rounded text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Clear uploaded
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-2">
                {queue.map((item) => (
                  <li key={item.id}>
                    <PanelSmall className="flex items-start gap-3">
                      <QueueIcon status={item.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                        <p
                          className={cx(
                            'mt-0.5 text-xs',
                            item.status === 'error' ? 'text-danger' : 'text-muted'
                          )}
                        >
                          {queueDetail(item)}
                        </p>
                      </div>
                      {!uploading && (
                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <IconClose size={14} />
                        </button>
                      )}
                    </PanelSmall>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Filing metadata ──────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Input
                label="Subject (optional)"
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value)
                  setFieldErrors((prev) => ({ ...prev, subject: undefined }))
                }}
                list="qm-upload-subjects"
                placeholder="Optional"
                autoComplete="off"
                error={fieldErrors.subject}
              />
              <datalist id="qm-upload-subjects">
                {subjects.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <Input
                label="Topic (optional)"
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value)
                  setFieldErrors((prev) => ({ ...prev, topic: undefined }))
                }}
                list="qm-upload-topics"
                placeholder="Optional — notes can be used without one"
                autoComplete="off"
                error={fieldErrors.topic}
              />
              <datalist id="qm-upload-topics">
                {topicSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <Select
              label="Source type"
              options={SOURCE_OPTIONS}
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
            />
          </div>

          {/* ── Submit ───────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              loading={uploading}
              disabled={pendingCount === 0 || !subject.trim() || !topic.trim()}
            >
              {uploading
                ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? 0}…`
                : `Upload ${pendingCount} file${pendingCount === 1 ? '' : 's'}`}
            </Button>
            {(!subject.trim() || !topic.trim()) && (
              <p className="text-xs text-muted">
                Subject and topic are required — question retrieval filters on them.
              </p>
            )}
            <span role="status" className="sr-only">
              {uploading && progress
                ? `Uploading file ${Math.min(progress.done + 1, progress.total)} of ${progress.total}.`
                : ''}
            </span>
          </div>
        </form>
      </PanelLarge>

      {/* ── The caller's documents ───────────────────────────── */}
      <section aria-labelledby="uploaded-documents-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="uploaded-documents-heading" className="text-sm font-semibold text-ink">
            Your documents
          </h2>
          {(documents.data?.length ?? 0) > 0 && (
            <span className="text-xs text-muted">{documents.data.length} uploaded</span>
          )}
        </div>

        {documents.isLoading ? (
          <Panel>
            <p role="status" className="p-4 text-sm text-muted">
              Loading documents…
            </p>
          </Panel>
        ) : documents.isError ? (
          <ErrorState
            title="Could not load your documents"
            message={documents.error?.message || 'The document list is unavailable right now.'}
            onRetry={() => documents.refetch()}
          />
        ) : (documents.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={IconDocs}
            title="No documents yet"
            description="Upload PDF, DOCX, TXT or MD notes above — they become the material question generation reads."
          />
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-medium text-muted">File</th>
                    <th className="px-4 py-2.5 font-medium text-muted">Subject</th>
                    <th className="px-4 py-2.5 font-medium text-muted">Topic</th>
                    <th className="px-4 py-2.5 font-medium text-muted">Source</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted">Chunks</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.data.map((doc) => (
                    <tr key={doc.document_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <span
                          className="block max-w-[240px] truncate font-medium text-ink"
                          title={doc.filename}
                        >
                          {doc.filename}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink">{doc.subject ?? 'General'}</td>
                      <td className="px-4 py-2.5 text-ink">{doc.topic ?? 'General'}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {SOURCE_LABELS[doc.source_type] ?? doc.source_type}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {doc.chunk_count ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatDate(doc.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </section>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}

export default DocumentsPanel
