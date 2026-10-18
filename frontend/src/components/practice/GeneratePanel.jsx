/**
 * GeneratePanel — "Pick a topic": questions about whatever the student names.
 *
 * This is the form that used to live on /generate, rebuilt around the way a
 * student actually arrives: knowing the topic, not the course code. Topic is
 * free text with suggestions from the material they uploaded and the concept
 * titles the library already knows; subject is never asked for, because it is
 * looked up from the document the topic matched (or "general"). Difficulty is a
 * Bloom band, and the six chips under it start from that band and can be moved.
 * The length is the student's to set: a free number capped at ten.
 *
 * Question generation answers one question per call, so a run of ten is ten
 * calls, two in flight at a time. While it runs the page says how many are
 * ready, how long it has been, and that an analyze question can take half a
 * minute; Cancel stops the calls that are still out. Whatever arrived is kept -
 * the student can start with fewer questions rather than lose the run.
 *
 * Nothing technical reaches the screen: a failure arrives from
 * api/errorMessages.js already written as a sentence.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext.jsx'
import { useDocumentTopics } from '../../hooks/useDocuments.js'
import { questionsApi } from '../../api/endpoints/questions.js'
import { generationError } from '../../api/errorMessages.js'
import { useCatalog } from '../../hooks/useCatalog'
import { usePracticeData } from '../../hooks/usePracticeData.js'
import { contentCourseIds } from '../../content/practiceBank.js'
import { createRegistry, registerCustomConcept } from '../../content/registry.js'
import { BLOOM_COLORS, BLOOM_LEVELS } from '../../constants/bloomTaxonomy.js'
import { holdDraft, newSession, saveSession } from '../../lib/sessions.js'
import {
  GENERATE_DIFFICULTIES,
  GENERAL_SUBJECT,
  MAX_GENERATE_COUNT,
  MIN_GENERATE_COUNT,
  bloomsForDifficulty,
  clampCount,
  customConceptId,
  difficultyLabel,
  findTopicSuggestion,
  matchingSuggestions,
  subjectForTopic,
  topicSuggestions,
} from '../../lib/generateForm.js'
import { ANALYZE_HINT, runGeneration } from '../../lib/generateRun.js'
import { sentenceCase } from '../../lib/text.js'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Input } from '../ui/Input'
import { Panel, PanelLarge } from '../ui/Panel.jsx'
import { BloomChip } from './BloomChip.jsx'
import { IconSparkles } from '../ui/Icons'

/** The default length, in step with the rest of the app's sessions. */
const DEFAULT_COUNT = 6

function Segmented({ label, options, value, onChange, className }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-control border border-line bg-surface-raised p-1 ${className ?? ''}`}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              active ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** One Bloom level the student can keep or drop; the dot carries its colour. */
function BloomToggle({ level, active, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(level.value)}
      title={level.desc}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        active
          ? 'border-primary bg-primary-tint text-ink'
          : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: BLOOM_COLORS[level.value] }}
      />
      {level.label}
    </button>
  )
}

function elapsedLabel(ms) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function GeneratePanel() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const topicsQuery = useDocumentTopics()

  const { data: catalog } = useCatalog()
  const { data: courses = [] } = usePracticeData(contentCourseIds())

  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [blooms, setBlooms] = useState(() => bloomsForDifficulty('medium'))
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [uploadedOnly, setUploadedOnly] = useState(false)
  const [touchedUploadedOnly, setTouchedUploadedOnly] = useState(false)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ ready: 0, target: DEFAULT_COUNT, skipped: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [noContext, setNoContext] = useState(false)
  const [ready, setReady] = useState([])

  const abortRef = useRef(null)
  const startedAtRef = useRef(0)

  const rows = topicsQuery.data ?? []
  const hasDocuments = topicsQuery.isSuccess && rows.length > 0

  // The box starts on for a student who has material, because that is the
  // honest default: a question about their own notes is grounded in something.
  useEffect(() => {
    if (hasDocuments && !touchedUploadedOnly) setUploadedOnly(true)
  }, [hasDocuments, touchedUploadedOnly])

  // The suggestions: what the student uploaded, then what the library knows.
  const documentTopics = useMemo(() => rows.flatMap((row) => row.topics ?? []), [rows])

  const candidates = useMemo(() => {
    const library = createRegistry(courses)
    const conceptTitles = library.allConcepts().map((concept) => concept.title)
    return topicSuggestions({ documentTopics, conceptTitles })
  }, [courses, documentTopics])

  const shownSuggestions = useMemo(() => matchingSuggestions(topic, candidates), [topic, candidates])

  // How long the run has been going, so a 30-second analyze question is not a
  // blank page.
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 1000)
    return () => clearInterval(timer)
  }, [running])

  // Leaving the panel cancels the calls that are still out.
  useEffect(() => () => abortRef.current?.abort(), [])

  const chooseDifficulty = (value) => {
    setDifficulty(value)
    setBlooms(bloomsForDifficulty(value))
  }

  const toggleBloom = (level) => {
    setBlooms((current) =>
      current.includes(level) ? current.filter((value) => value !== level) : [...current, level]
    )
  }

  const reset = () => {
    setError(null)
    setNoContext(false)
    setReady([])
    setProgress({ ready: 0, target: count, skipped: 0 })
  }

  const generate = async () => {
    const trimmed = topic.trim()
    if ((!trimmed && !uploadedOnly) || blooms.length === 0 || running) return

    reset()
    setRunning(true)
    setElapsed(0)
    startedAtRef.current = Date.now()

    const generationTopic = trimmed || 'Uploaded notes'
    const subject = trimmed && hasDocuments ? subjectForTopic(trimmed, rows) : GENERAL_SUBJECT

    // "Use only my uploaded material" is checked before a call is made: if the
    // topic matches nothing the student uploaded, no prompt will find material
    // for it either, and the honest answer is the closest topic they do have.
    if (uploadedOnly && trimmed && subject === GENERAL_SUBJECT) {
      setRunning(false)
      setNoContext(true)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const outcome = await runGeneration({
        generate: (payload, options) => questionsApi.generate(payload, userId, options),
        topic: generationTopic,
        subject,
        uploaded_only: uploadedOnly,
        difficulty,
        blooms,
        count,
        signal: controller.signal,
        onProgress: setProgress,
      })

      if (outcome.noContext) {
        setNoContext(true)
        return
      }
      if (outcome.error) {
        setError(outcome.error)
        return
      }
      setReady(outcome.questions)
      // A topic the student typed becomes a concept of its own, so the answers
      // to its questions move mastery like any other concept's and the number
      // shows up in the library beside the authored ones.
      registerCustomConcept({
        id: customConceptId(generationTopic),
        title: generationTopic,
        subject,
      })
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  // The suggestion is drawn from the student's own documents, not from the
  // library: "Deadlock" should suggest the "Deadlocks" they uploaded, and a
  // concept title they have no notes on would only fail the same way again.
  const suggestion = noContext ? findTopicSuggestion(topic.trim(), documentTopics) : null

  // The generated questions become a session exactly like one drawn from the
  // bank does: the same strip, the same flags, the same results page. The only
  // difference is that it carries its own questions, because nothing else has
  // them.
  const startPractice = () => {
    if (ready.length === 0) return
    const trimmed = topic.trim()
    const session = newSession({
      scope: 'generated',
      subject: hasDocuments ? subjectForTopic(trimmed, rows) : GENERAL_SUBJECT,
      level: difficulty,
      label: topic.trim() || 'Uploaded notes',
      questionIds: ready.map((question) => question.question_id),
      questions: ready,
    })
    // Written now, not with the first answer: these questions exist nowhere but
    // this record, so a refresh before the first answer would throw the run
    // away. The draft is still held, for the one case where storage is refused.
    saveSession(userId, session)
    holdDraft(session)
    navigate(`/practice/${session.id}`)
  }

  return (
    <div className="space-y-4">
      <PanelLarge>
        <h2 className="text-sm font-semibold text-ink">Pick a topic</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-muted">
          Name a topic and the questions are written for it. Nothing is set up in advance and
          nothing is enrolled: the questions start a practice session like any other.
        </p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            generate()
          }}
        >
          <div className="max-w-md">
            <Input
              id="generate-topic"
              label="Topic"
              placeholder="For example: Deadlocks"
              value={topic}
              autoComplete="off"
              onChange={(event) => {
                setTopic(event.target.value)
                setNoContext(false)
                setError(null)
              }}
            />
            {shownSuggestions.length > 0 && (
              <ul aria-label="Topic suggestions" className="mt-1.5 flex flex-wrap gap-1.5">
                {shownSuggestions.map((value) => (
                  <li key={value}>
                    <button
                      type="button"
                      onClick={() => setTopic(value)}
                      className="rounded-full border border-line bg-surface-raised px-2.5 py-1 text-xs text-muted transition-colors duration-150 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {value}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-[13px] font-medium text-ink">Difficulty</h3>
            <Segmented
              className="mt-1.5"
              label="Difficulty"
              options={GENERATE_DIFFICULTIES}
              value={difficulty}
              onChange={chooseDifficulty}
            />
          </div>

          <div>
            <h3 className="text-[13px] font-medium text-ink">Bloom levels</h3>
            <p className="mt-0.5 text-xs text-muted">
              {difficultyLabel(difficulty)} starts with these; keep or drop any of them.
            </p>
            <div role="group" aria-label="Bloom levels" className="mt-1.5 flex flex-wrap gap-1.5">
              {BLOOM_LEVELS.map((level) => (
                <BloomToggle
                  key={level.value}
                  level={level}
                  active={blooms.includes(level.value)}
                  onToggle={toggleBloom}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[13px] font-medium text-ink">Number of questions</h3>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              <span>Choose any number</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_GENERATE_COUNT}
                max={MAX_GENERATE_COUNT}
                step={1}
                aria-label="Number of questions"
                value={count}
                onChange={(event) => {
                  const next = clampCount(event.target.value)
                  if (next != null) setCount(next)
                }}
                className="w-20 rounded-control border border-line bg-surface px-2 py-1.5 text-[13px] tabular-nums text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
            </label>
          </div>

          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={uploadedOnly}
              onChange={(event) => {
                setTouchedUploadedOnly(true)
                setUploadedOnly(event.target.checked)
              }}
            />
            Use only my uploaded material
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              loading={running}
              disabled={(!topic.trim() && !uploadedOnly) || blooms.length === 0}
            >
              Generate questions
            </Button>
            {!topic.trim() && uploadedOnly && (
              <p className="text-xs text-muted">Questions will be made from your uploaded notes.</p>
            )}
            {!topic.trim() && !uploadedOnly && <p className="text-xs text-muted">Name a topic first.</p>}
            {topic.trim() && blooms.length === 0 && (
              <p className="text-xs text-muted">Keep at least one Bloom level.</p>
            )}
          </div>
          <p className="text-xs text-muted">
            Need to add material? <Link className="font-medium text-primary hover:underline" to="/notes">Upload your notes</Link>.
          </p>
        </form>
      </PanelLarge>

      {running && (
        <Panel className="p-5" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {progress.ready} of {progress.target} ready
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {elapsedLabel(elapsed)} · {ANALYZE_HINT}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {error && (
        <ErrorState
          title="Could not generate questions"
          message={generationError(error).message}
          onRetry={generationError(error).retryable ? generate : undefined}
        />
      )}

      {noContext && (
        <Panel className="p-5">
          {suggestion ? (
            <>
              <p className="text-sm text-ink">
                No material found for &lsquo;{topic.trim()}&rsquo;. Did you mean &lsquo;{suggestion}&rsquo;?
              </p>
              <Button className="mt-3" size="sm" onClick={() => setTopic(suggestion)}>
                Use &lsquo;{suggestion}&rsquo;
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink">
              No uploaded material covers this topic. Add notes in My notes &gt; Documents.
            </p>
          )}
        </Panel>
      )}

      {!running && ready.length > 0 && (
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                {ready.length} question{ready.length === 1 ? '' : 's'} ready
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {ready.length < count
                  ? `Asked for ${count}; the rest did not come back.`
                  : `${sentenceCase(topic.trim())} · ${difficultyLabel(difficulty)}`}
              </p>
            </div>
            <Button onClick={startPractice}>
              {ready.length < count
                ? `Start with ${ready.length} question${ready.length === 1 ? '' : 's'}`
                : 'Start practice'}
            </Button>
          </div>

          <ul className="mt-4 space-y-2">
            {ready.map((question, index) => (
              <li
                key={`${question.question_id ?? 'generated-question'}-${index}`}
                className="flex flex-wrap items-center gap-2"
              >
                <BloomChip bloom={question.bloom_level} />
                <Badge tone="neutral" label={question.originLabel} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {question.question_text}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!running && ready.length === 0 && noContext === false && error === null && !topic.trim() && (
        <Panel className="p-5">
          <EmptyState
            icon={IconSparkles}
            title="Ask about anything you are studying"
            description="Type a topic above and the questions are written for it, at the levels you keep."
          />
        </Panel>
      )}
    </div>
  )
}

export default GeneratePanel
