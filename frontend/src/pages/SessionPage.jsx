/**
 * SessionPage — /practice/:sessionId
 *
 * Supports two distinct practice flows:
 *
 * 1. ADAPTIVE TOPIC PRACTICE (Scope: 'adaptive'):
 *    - ONE question at a time.
 *    - Real-time 6-rung cognitive/difficulty ladder with animated transitions.
 *    - Backend reason text, source badge (live/cache/bank), and provisional scoring badge.
 *    - Immediate evaluation upon submit.
 *    - Next question requested from backend adaptive engine only after evaluation.
 *    - End-of-session summary with questions answered, average score, highest rung,
 *      and complete ladder history. Milestone offer after 10 questions.
 *
 * 2. AUTHORED COURSE BANK PRACTICE (Scope: 'course' / 'mixed' / 'custom'):
 *    - Pre-authored questions with QuestionNumberStrip, review & submit flow.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import {
  clearAnswer,
  getDraft,
  getSession,
  holdDraft,
  recordAnswer,
  recordSelfMark,
  releaseDraft,
  saveSession,
  submitSession,
  toggleFlag,
  useStoredSession,
} from '../lib/sessions.js'
import { recordScore } from '../lib/masteryStore.js'
import { marksForQuestion, scoreOf } from '../lib/marks.js'
import { gradeGeneratedAnswer } from '../lib/generateGrading.js'
import { questionsApi } from '../api/endpoints/questions.js'
import { attemptsApi } from '../api/endpoints/attempts.js'
import { generatedToSessionQuestion, normaliseScore } from '../lib/generateRun.js'
import { getSubmissionId } from '../lib/submissionId.js'
import { customConceptId } from '../lib/generateForm.js'
import { resolveQuestions } from '../content/practiceBank.js'
import { registerCustomConcept } from '../content/registry.js'
import { QUESTION_TYPE_LABELS } from '../content/questionBank.js'
import { generationError } from '../api/errorMessages.js'

import { AdaptiveLadder, getRungIndex } from '../components/practice/AdaptiveLadder.jsx'
import { SessionSummary } from '../components/practice/SessionSummary.jsx'
import { BloomChip } from '../components/practice/BloomChip.jsx'
import { QuestionNumberStrip } from '../components/practice/QuestionNumberStrip.jsx'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog.jsx'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { PanelLarge } from '../components/ui/Panel'
import { Textarea } from '../components/ui/Textarea'
import { IconSearch, IconSparkles } from '../components/ui/Icons'

const WORKSPACE_CRUMB = { label: 'Workspace', to: '/dashboard' }

function isAnsweredCheck(question, answer) {
  if (!question) return false
  if (question.type === 'mcq') return Number.isInteger(answer?.selected)
  return Boolean(String(answer?.text ?? '').trim())
}

function MarksLabel({ question }) {
  const marks = marksForQuestion(question)
  return <span className="text-xs tabular-nums text-muted">{marks} {marks === 1 ? 'mark' : 'marks'}</span>
}

export default function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()

  const storedSession = useStoredSession(userId, sessionId)
  const [draft, setDraft] = useState(() => getDraft(sessionId))
  const session = storedSession ?? draft

  // Determine flow type
  const isTargetedStudy = Boolean(session?.scope === 'targeted' || session?.mode === 'study')
  const targetCount = isTargetedStudy ? (session?.target_count || 5) : null

  const isAdaptiveSession = Boolean(
    session?.scope === 'adaptive' ||
    isTargetedStudy ||
    (session?.topic && !session?.courseId && (!session?.questionIds || session?.questionIds?.length === 0))
  )

  // ══════════════════════════════════════════════════════════
  // ADAPTIVE & TARGETED SESSION FLOW
  // ══════════════════════════════════════════════════════════

  const [history, setHistory] = useState(() => session?.history ?? [])
  const [currentQuestion, setCurrentQuestion] = useState(() => session?.currentQuestion ?? null)
  const [previousRung, setPreviousRung] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [answerText, setAnswerText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [lastEvaluation, setLastEvaluation] = useState(null)
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false)
  const [finished, setFinished] = useState(() => session?.status === 'submitted')
  const [autoSummaryOffer, setAutoSummaryOffer] = useState(false)

  const abortRef = useRef(null)
  const isFetchingRef = useRef(false)
  const prefetchedQueueRef = useRef([])
  const prefetchingRef = useRef(false)

  // ══════════════════════════════════════════════════════════
  // BANK SESSION FLOW (Course Practice)
  // ══════════════════════════════════════════════════════════

  const bankQuestions = useMemo(
    () => (!isAdaptiveSession ? resolveQuestions(session?.questionIds ?? [], session?.questions ?? []) : []),
    [isAdaptiveSession, session?.questionIds, session?.questions]
  )
  const [bankIndex, setBankIndex] = useState(0)
  const [bankConfirmOpen, setBankConfirmOpen] = useState(false)
  const [bankExitOpen, setBankExitOpen] = useState(false)
  const [bankSubmitting, setBankSubmitting] = useState(false)
  const [bankSubmitError, setBankSubmitError] = useState(null)

  useBreadcrumbs([
    WORKSPACE_CRUMB,
    { label: 'Practice', to: '/practice' },
    { label: session?.label || session?.topic || 'Session' },
  ])

  // Sync adaptive session state
  const syncAdaptiveSession = (updates) => {
    if (!session) return
    const updated = { ...session, ...updates }
    saveSession(userId, updated)
    holdDraft(updated)
  }

  // Generate 1 question (adaptive or targeted)
  const fetchAdaptiveQuestion = async () => {
    if (!session?.topic || isFetchingRef.current || generating) return
    isFetchingRef.current = true
    setGenerating(true)
    setGenerateError(null)
    setSubmitError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const payload = {
        topic: session.topic,
        subject: session.subject,
        count: 1,
        num_questions: 1,
        adaptive: !isTargetedStudy,
        uploaded_only: Boolean(session.uploadedOnly),
      }
      if (isTargetedStudy && session.bloom_level) {
        payload.bloom_level = session.bloom_level
        payload.difficulty = session.difficulty || 'medium'
      }

      const response = await questionsApi.generate(payload, userId, { signal: controller.signal })

      const raw = response.questions?.[0]
      if (!raw) throw new Error('No question was returned by the generator.')

      const conceptId = customConceptId(raw.served_topic || session.topic)
      const q = generatedToSessionQuestion(raw, {
        topic: session.topic,
        conceptId,
        fallbackId: `gen-${Date.now()}`,
        bloom: raw.bloom_level ?? (session.bloom_level || 'remember'),
        difficulty: raw.difficulty ?? (session.difficulty || 'easy'),
      })

      setCurrentQuestion(q)
      setSelectedOption(null)
      setAnswerText('')
      setLastEvaluation(null)

      syncAdaptiveSession({ currentQuestion: q })

      // Pipelined background prefetch for Targeted Study mode
      if (isTargetedStudy && targetCount > 1 && prefetchedQueueRef.current.length === 0 && !prefetchingRef.current) {
        const remaining = targetCount - 1
        if (remaining > 0) {
          prefetchingRef.current = true
          questionsApi
            .generate(
              {
                topic: session.topic,
                subject: session.subject,
                bloom_level: session.bloom_level,
                difficulty: session.difficulty,
                count: remaining,
                num_questions: remaining,
                adaptive: false,
                uploaded_only: Boolean(session.uploadedOnly),
              },
              userId
            )
            .then((res) => {
              const items = res.questions ?? []
              for (const item of items) {
                const cId = customConceptId(item.served_topic || session.topic)
                prefetchedQueueRef.current.push(
                  generatedToSessionQuestion(item, {
                    topic: session.topic,
                    conceptId: cId,
                    fallbackId: `gen-${Date.now()}-${Math.random()}`,
                    bloom: item.bloom_level ?? session.bloom_level,
                    difficulty: item.difficulty ?? session.difficulty,
                  })
                )
              }
            })
            .catch(() => {})
            .finally(() => {
              prefetchingRef.current = false
            })
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setGenerateError(err)
      }
    } finally {
      isFetchingRef.current = false
      setGenerating(false)
      abortRef.current = null
    }
  }

  // Load first adaptive question
  useEffect(() => {
    if (!isAdaptiveSession || finished) return
    if (!currentQuestion && !generating && !generateError) {
      fetchAdaptiveQuestion()
    }
  }, [isAdaptiveSession, finished, currentQuestion])

  // Current active rung
  const currentRung = useMemo(() => {
    if (currentQuestion) {
      return getRungIndex(currentQuestion.bloom_level, currentQuestion.difficulty)
    }
    // When generating or between questions, maintain the rung of the most recent question
    if (history.length > 0) {
      const last = history[history.length - 1]
      if (last?.rung !== undefined && last?.rung !== null) return last.rung
      if (last?.question) return getRungIndex(last.question.bloom_level, last.question.difficulty)
    }
    if (previousRung !== null && previousRung !== undefined) return previousRung
    if (isTargetedStudy && session?.bloom_level) {
      return getRungIndex(session.bloom_level, session.difficulty || 'medium')
    }
    return 0
  }, [currentQuestion, history, previousRung, isTargetedStudy, session?.bloom_level, session?.difficulty])

  // Submit adaptive answer
  const handleAdaptiveSubmit = async () => {
    if (!currentQuestion || submitting) return

    const isMcq = currentQuestion.type === 'mcq'
    let text = ''
    if (isMcq) {
      if (selectedOption === null || selectedOption === undefined) return
      text = currentQuestion.options?.[selectedOption] ?? ''
    } else {
      text = answerText.trim()
      if (!text) return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const submissionId = getSubmissionId(currentQuestion.question_id, text)
      const response = await attemptsApi.submit(
        {
          question_id: currentQuestion.question_id,
          answer_text: text,
          submission_id: submissionId,
        },
        userId
      )

      const score = normaliseScore(
        response.score ?? (response.overall_score ? response.overall_score / 100 : 0)
      ) ?? 0

      const evalData = {
        score,
        overall_score: response.overall_score ?? Math.round(score * 100),
        feedback: response.feedback_text || response.feedback || '',
        evaluation_mode: response.evaluation_mode,
        correct_answer: response.correct_answer || currentQuestion.correct_answer,
      }

      setLastEvaluation(evalData)

      // Record score
      const conceptId = currentQuestion.conceptId || customConceptId(currentQuestion.served_topic || session.topic)
      recordScore(userId, {
        conceptId,
        bloom: currentQuestion.bloom_level,
        score,
        sessionId,
        questionId: currentQuestion.question_id,
      })

      const conceptTitle = currentQuestion.served_topic || session.topic
      if (conceptTitle) {
        registerCustomConcept({
          id: customConceptId(conceptTitle),
          title: conceptTitle,
          subject: session.subject || 'General',
        })
      }

      const historyItem = {
        question: currentQuestion,
        answer: text,
        score,
        feedback: evalData.feedback,
        evaluation_mode: evalData.evaluation_mode,
        rung: currentRung,
        bloom_level: currentQuestion.bloom_level,
        difficulty: currentQuestion.difficulty,
        adaptive_reason: currentQuestion.adaptive_reason,
      }

      const nextHistory = [...history, historyItem]
      setHistory(nextHistory)

      syncAdaptiveSession({
        history: nextHistory,
        answers: { ...(session.answers ?? {}), [currentQuestion.question_id]: { text, selected: selectedOption } },
      })

      if (isTargetedStudy && targetCount && nextHistory.length >= targetCount) {
        setFinished(true)
        syncAdaptiveSession({ status: 'submitted', history: nextHistory })
      } else if (nextHistory.length === 10) {
        setAutoSummaryOffer(true)
      }

      // Predictive prefetching for adaptive learning: while the learner reads the evaluation,
      // prefetch the next adaptive question in the background so "Next question" is instantaneous.
      const isTestEnv = import.meta.env?.MODE === 'test'
      if (!isTestEnv && !isTargetedStudy && nextHistory.length < 10 && prefetchedQueueRef.current.length === 0 && !prefetchingRef.current) {
        prefetchingRef.current = true
        questionsApi
          .generate(
            {
              topic: session.topic,
              subject: session.subject,
              count: 1,
              num_questions: 1,
              adaptive: true,
              uploaded_only: Boolean(session.uploadedOnly),
            },
            userId
          )
          .then((res) => {
            const raw = res.questions?.[0]
            if (raw) {
              const cId = customConceptId(raw.served_topic || session.topic)
              prefetchedQueueRef.current.push(
                generatedToSessionQuestion(raw, {
                  topic: session.topic,
                  conceptId: cId,
                  fallbackId: `gen-${Date.now()}-${Math.random()}`,
                  bloom: raw.bloom_level,
                  difficulty: raw.difficulty,
                })
              )
            }
          })
          .catch(() => {})
          .finally(() => {
            prefetchingRef.current = false
          })
      }
    } catch (err) {
      setSubmitError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNextAdaptiveQuestion = () => {
    setPreviousRung(currentRung)
    // Instant switch if question was prefetched in background
    if (prefetchedQueueRef.current.length > 0) {
      const nextQ = prefetchedQueueRef.current.shift()
      setCurrentQuestion(nextQ)
      setSelectedOption(null)
      setAnswerText('')
      setLastEvaluation(null)
      syncAdaptiveSession({ currentQuestion: nextQ })
      return
    }

    setCurrentQuestion(null)
    setSelectedOption(null)
    setAnswerText('')
    setLastEvaluation(null)
    syncAdaptiveSession({ currentQuestion: null })
  }

  const handleFinishAdaptive = () => {
    setFinishConfirmOpen(false)
    setFinished(true)
    syncAdaptiveSession({ status: 'submitted' })
  }

  // ══════════════════════════════════════════════════════════
  // BANK SESSION HANDLERS
  // ══════════════════════════════════════════════════════════

  const currentBankQ = bankQuestions[bankIndex] ?? null
  const currentBankA = currentBankQ ? session?.answers?.[currentBankQ.question_id] : null

  const startBankIfUnstored = () => {
    if (getSession(userId, sessionId)) return
    const held = getDraft(sessionId)
    if (held) saveSession(userId, held)
    releaseDraft(sessionId)
  }

  const chooseBank = (optIdx) => {
    if (!currentBankQ) return
    startBankIfUnstored()
    recordAnswer(userId, sessionId, currentBankQ.question_id, { type: 'mcq', selected: optIdx })
  }

  const setTextBank = (txt) => {
    if (!currentBankQ) return
    startBankIfUnstored()
    recordAnswer(userId, sessionId, currentBankQ.question_id, { type: 'short', text: txt })
  }

  const clearBank = () => {
    if (!currentBankQ) return
    if (storedSession) {
      clearAnswer(userId, sessionId, currentBankQ.question_id)
      return
    }
    setDraft((val) => {
      const answers = { ...(val?.answers ?? {}) }
      delete answers[currentBankQ.question_id]
      const next = { ...val, answers }
      holdDraft(next)
      return next
    })
  }

  const flagBank = () => {
    if (!currentBankQ) return
    if (storedSession) {
      toggleFlag(userId, sessionId, currentBankQ.question_id)
      return
    }
    setDraft((val) => {
      const flagged = val?.flagged ?? []
      const next = {
        ...val,
        flagged: flagged.includes(currentBankQ.question_id)
          ? flagged.filter((id) => id !== currentBankQ.question_id)
          : [...flagged, currentBankQ.question_id],
      }
      holdDraft(next)
      return next
    })
  }

  const submitBank = async () => {
    if (!storedSession) {
      setBankConfirmOpen(false)
      navigate('/practice')
      return
    }
    setBankSubmitting(true)
    setBankSubmitError(null)
    try {
      for (const question of bankQuestions) {
        const a = session.answers?.[question.question_id]
        if (question.type === 'mcq') {
          const score = scoreOf(question, a, null)
          if (score != null) {
            recordScore(userId, {
              conceptId: question.conceptId,
              bloom: question.bloom_level,
              score,
              sessionId,
              questionId: question.question_id,
            })
          }
        }
      }
      submitSession(userId, sessionId)
      setBankConfirmOpen(false)
      navigate(`/practice/${sessionId}/results`)
    } catch (err) {
      setBankSubmitError(err)
    } finally {
      setBankSubmitting(false)
    }
  }

  // Not found
  if (!session) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="We could not find that session"
          description="It may have been removed, or the link may be out of date. Sessions are kept for the last twenty you start."
          actionLabel="Go to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  // ══════════════════════════════════════════════════════════
  // RENDER ADAPTIVE TOPIC SESSION
  // ══════════════════════════════════════════════════════════

  if (isAdaptiveSession) {
    if (finished) {
      return (
        <SessionSummary
          topic={session.topic || session.label}
          history={history}
          onRestart={() => navigate('/practice')}
          onExit={() => navigate('/practice')}
        />
      )
    }

    const isAns =
      currentQuestion?.type === 'mcq'
        ? selectedOption !== null
        : Boolean(answerText.trim())

    return (
      <div className="mx-auto max-w-3xl space-y-5" data-testid="practice-session-screen">
        {/* Session Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {isTargetedStudy
                ? `Question ${history.length + 1} of ${targetCount} · Targeted Study (${(session.bloom_level || 'apply').toUpperCase()})`
                : `Question ${history.length + 1}`}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
              {session.topic || session.label}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFinishConfirmOpen(true)}
            >
              Finish session
            </Button>
          </div>
        </div>

        {/* Milestone Offer */}
        {autoSummaryOffer && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-primary/40 bg-primary-tint/40 p-4">
            <div>
              <p className="text-sm font-semibold text-ink">10 questions completed!</p>
              <p className="text-xs text-muted">You can view your summary now or continue practicing.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleFinishAdaptive}>View summary</Button>
              <Button variant="ghost" size="sm" onClick={() => setAutoSummaryOffer(false)}>Keep practicing</Button>
            </div>
          </div>
        )}

        {/* Adaptive Level Ladder */}
        <AdaptiveLadder
          currentRung={currentRung}
          previousRung={previousRung}
          reason={currentQuestion?.adaptive_reason || (history.length > 0 ? history[history.length - 1]?.adaptive_reason : '') || ''}
          source={currentQuestion?.source || (history.length > 0 ? history[history.length - 1]?.question?.source : '') || ''}
          evaluationMode={lastEvaluation?.evaluation_mode}
          lastScore={lastEvaluation?.score}
          isGenerating={generating}
        />

        {/* Loading State */}
        {generating && (
          <PanelLarge className="p-8 text-center" role="status" aria-live="polite">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-tint text-primary animate-spin mb-3">
              <IconSparkles size={20} aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ink">
              {history.length === 0
                ? `Generating your starting question on ${session.topic || 'topic'}...`
                : `Selecting your next adaptive question...`}
            </h2>
            <p className="mt-1 text-xs text-muted max-w-md mx-auto">
              Grounded in your material. Higher cognitive levels (Analyze/Evaluate) may take up to 20 seconds.
            </p>
          </PanelLarge>
        )}

        {/* Error State */}
        {generateError && (
          <ErrorState
            title="Could not generate question"
            message={generationError(generateError).message}
            onRetry={fetchAdaptiveQuestion}
          />
        )}

        {/* Active Question Card */}
        {!generating && currentQuestion && (
          <PanelLarge className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <BloomChip bloom={currentQuestion.bloom_level} />
              <Badge
                tone="neutral"
                label={QUESTION_TYPE_LABELS[currentQuestion.type] ?? currentQuestion.type}
              />
              {currentQuestion.served_topic &&
                currentQuestion.served_topic.toLowerCase() !== (session.topic || '').toLowerCase() && (
                  <Badge tone="warning" label={`Served topic: ${currentQuestion.served_topic}`} />
                )}
            </div>

            <div className="pt-1">
              <p className="text-base sm:text-lg font-medium leading-relaxed text-ink">
                {currentQuestion.question_text}
              </p>
            </div>

            {currentQuestion.type === 'mcq' ? (
              <fieldset className="pt-2">
                <legend className="sr-only">Select your answer</legend>
                <ul className="space-y-2">
                  {(currentQuestion.options ?? []).map((option, idx) => {
                    const isSelected = selectedOption === idx
                    return (
                      <li key={idx}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-control border p-3.5 transition-colors duration-150 ${
                            isSelected
                              ? 'border-primary bg-primary-tint/70 ring-1 ring-primary'
                              : 'border-line hover:bg-surface-raised'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${currentQuestion.question_id}`}
                            className="mt-1 text-primary focus:ring-primary"
                            checked={isSelected}
                            disabled={Boolean(lastEvaluation)}
                            onChange={() => setSelectedOption(idx)}
                          />
                          <span className="text-sm leading-relaxed text-ink">{option}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            ) : (
              <div className="pt-2">
                <Textarea
                  id={`answer-${currentQuestion.question_id}`}
                  aria-label="Your answer"
                  rows={5}
                  placeholder="Write your answer clearly..."
                  value={answerText}
                  disabled={Boolean(lastEvaluation)}
                  onChange={(e) => setAnswerText(e.target.value)}
                />
              </div>
            )}

            {submitError && (
              <div className="rounded-control border border-danger/30 bg-danger-tint p-3 text-xs text-danger">
                <p className="font-semibold">Evaluation error</p>
                <p className="mt-0.5">{generationError(submitError).message}</p>
              </div>
            )}

            {lastEvaluation && (
              <div
                className="mt-4 rounded-control border border-line bg-surface-raised p-4 animate-slide-up space-y-3"
                data-testid="evaluation-result"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">Evaluation</span>
                    <Badge
                      tone={lastEvaluation.score >= 0.75 ? 'success' : lastEvaluation.score < 0.4 ? 'danger' : 'warning'}
                      label={`${Math.round(lastEvaluation.score * 100)}% score`}
                    />
                    {lastEvaluation.evaluation_mode === 'provisional' && (
                      <Badge tone="warning" label="Provisional scoring" />
                    )}
                  </div>
                </div>

                {lastEvaluation.feedback && (
                  <p className="text-xs sm:text-sm text-ink leading-relaxed">{lastEvaluation.feedback}</p>
                )}

                {lastEvaluation.correct_answer && (
                  <div className="text-xs text-muted pt-1 border-t border-line/60">
                    <span className="font-semibold text-ink">Reference answer / explanation: </span>
                    {lastEvaluation.correct_answer}
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line">
              {!lastEvaluation ? (
                <Button
                  id="btn-submit-answer"
                  onClick={handleAdaptiveSubmit}
                  loading={submitting}
                  disabled={!isAns}
                  size="md"
                >
                  Submit answer
                </Button>
              ) : (
                <Button
                  id="btn-next-question"
                  onClick={handleNextAdaptiveQuestion}
                  size="md"
                >
                  Next question →
                </Button>
              )}

              {!lastEvaluation && currentQuestion.type === 'mcq' && selectedOption !== null && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedOption(null)}>
                  Clear choice
                </Button>
              )}
            </div>
          </PanelLarge>
        )}

        {/* Finish Dialog */}
        <Dialog
          open={finishConfirmOpen}
          title="Finish this practice session?"
          description={`You have answered ${history.length} question${history.length === 1 ? '' : 's'}. Finishing will compile your session summary.`}
          onClose={() => setFinishConfirmOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setFinishConfirmOpen(false)}>
                Keep practicing
              </Button>
              <Button id="btn-confirm-finish" onClick={handleFinishAdaptive}>
                Confirm finish
              </Button>
            </>
          }
        />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // RENDER COURSE BANK PRACTICE SESSION (Fallback / Course flow)
  // ══════════════════════════════════════════════════════════

  if (bankQuestions.length === 0) {
    return (
      <PanelLarge>
        <EmptyState
          icon={IconSearch}
          title="This session has no questions"
          description="The questions it drew are no longer in the course content. Start a new session from the course page."
          actionLabel="Back to practice"
          onAction={() => navigate('/practice')}
        />
      </PanelLarge>
    )
  }

  const answeredCount = bankQuestions.filter((q) =>
    isAnsweredCheck(q, session?.answers?.[q.question_id])
  ).length
  const unanswered = bankQuestions.length - answeredCount
  const flaggedCount = session?.flagged?.length ?? 0
  const summaryParts = []
  if (unanswered > 0) summaryParts.push(`${unanswered} unanswered`)
  if (flaggedCount > 0) summaryParts.push(`${flaggedCount} flagged`)
  const confirmMessage = summaryParts.length
    ? `${summaryParts.join(', ')}. Submit anyway?`
    : 'Every question has an answer. Submit?'
  const isLast = bankIndex === bankQuestions.length - 1

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-muted">
            Question {bankIndex + 1} of {bankQuestions.length}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted">{answeredCount} answered</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setBankExitOpen(true)}>
          Exit practice
        </Button>
      </div>

      {session.note && (
        <p className="mt-3 rounded-panel border border-warning-tint bg-warning-tint px-3 py-2 text-xs text-warning">
          {session.note}
        </p>
      )}

      <QuestionNumberStrip
        className="mt-4"
        questions={bankQuestions}
        answers={session.answers}
        flagged={session.flagged}
        currentIndex={bankIndex}
        onJump={setBankIndex}
      />

      <PanelLarge className="mt-5">
        {currentBankQ && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <BloomChip bloom={currentBankQ.bloom_level} />
              <Badge tone="neutral" label={QUESTION_TYPE_LABELS[currentBankQ.type] ?? currentBankQ.type} />
              <MarksLabel question={currentBankQ} />
            </div>

            <p className="mt-4 text-base leading-relaxed text-ink">{currentBankQ.question_text}</p>

            {currentBankQ.type === 'mcq' ? (
              <fieldset className="mt-4">
                <legend className="sr-only">Choose one option</legend>
                <ul className="space-y-2">
                  {(currentBankQ.options ?? []).map((option, optIdx) => {
                    const selected = currentBankA?.selected === optIdx
                    return (
                      <li key={optIdx}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors duration-150 ${
                            selected ? 'border-primary bg-primary-tint' : 'border-line hover:bg-surface-raised'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`bank-q-${currentBankQ.question_id}`}
                            className="mt-0.5"
                            checked={selected}
                            onChange={() => chooseBank(optIdx)}
                          />
                          <span className="text-sm leading-relaxed text-ink">{option}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            ) : (
              <div className="mt-4">
                <Textarea
                  id={`answer-${currentBankQ.question_id}`}
                  aria-label="Your answer"
                  rows={6}
                  placeholder="Write your answer…"
                  value={currentBankA?.text ?? ''}
                  onChange={(e) => setTextBank(e.target.value)}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {currentBankQ.type === 'mcq' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearBank}
                  disabled={!isAnsweredCheck(currentBankQ, currentBankA)}
                >
                  Clear answer
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={(session.flagged ?? []).includes(currentBankQ.question_id)}
                onClick={flagBank}
              >
                {(session.flagged ?? []).includes(currentBankQ.question_id) ? 'Flagged for review' : 'Flag for review'}
              </Button>
            </div>
          </>
        )}
      </PanelLarge>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setBankIndex((i) => Math.max(0, i - 1))} disabled={bankIndex === 0}>
          Previous
        </Button>
        {isLast ? (
          <Button onClick={() => setBankConfirmOpen(true)}>Review and submit</Button>
        ) : (
          <Button onClick={() => setBankIndex((i) => Math.min(bankQuestions.length - 1, i + 1))}>Next</Button>
        )}
      </div>

      <Dialog
        open={bankConfirmOpen}
        title={bankSubmitError ? 'Could not save your answer' : 'Submit this session?'}
        description={bankSubmitError ? generationError(bankSubmitError).message : confirmMessage}
        onClose={() => setBankConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBankConfirmOpen(false)}>Keep practicing</Button>
            <Button onClick={submitBank} loading={bankSubmitting}>{bankSubmitError ? 'Retry' : 'Submit'}</Button>
          </>
        }
      />

      <Dialog
        open={bankExitOpen}
        title="Exit practice?"
        description="Your answers are saved. You can come back to this session and pick up where you left off."
        onClose={() => setBankExitOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBankExitOpen(false)}>Stay</Button>
            <Button variant="secondary" onClick={() => navigate('/practice')}>Exit practice</Button>
          </>
        }
      />
    </div>
  )
}
