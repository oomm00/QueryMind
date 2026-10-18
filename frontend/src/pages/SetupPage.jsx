/**
 * SetupPage — /practice/new
 *
 * The form draws a practice session from the course bank: the questions the
 * content files already hold. So it offers what the bank can actually ask — how
 * many questions a topic or a concept has, and which Bloom levels they sit at —
 * instead of filters that could come back empty.
 *
 * Nothing is generated here. A course with no questions says so, the session
 * cannot start until there is something real to ask, and the count never
 * pretends to be larger than the bank.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../context/SessionContext.jsx'
import { useCourseBank } from '../hooks/useCourseBank.js'
import { DEFAULT_COURSE_ID } from '../hooks/useCourse.js'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { BLOOM_LEVELS, DIFFICULTIES } from '../constants/bloomTaxonomy.js'
import {
  ANY_DIFFICULTY,
  BANK_SOURCE_LABEL,
  bloomMix,
  choiceLabel,
  difficultyFit,
  pickBank,
  questionsForChoice,
  resolveChoice,
} from '../content/questionBank.js'
import { sentenceCase } from '../lib/text'
import { clampPracticeCount, MAX_PRACTICE_COUNT } from '../lib/practiceLink'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Panel } from '../components/ui/Panel'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconLearning, IconSettings, IconTarget } from '../components/ui/Icons'

const BLOOM_LABELS = Object.fromEntries(BLOOM_LEVELS.map((level) => [level.value, level.label]))

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function bloomLabel(level) {
  return BLOOM_LABELS[level] ?? sentenceCase(level)
}

function SectionHeading({ icon: Icon, children }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted">
      <Icon size={15} />
      {children}
    </h2>
  )
}

export default function SetupPage() {
  const navigate = useNavigate()
  const { initSession } = useSession()
  const [searchParams] = useSearchParams()
  const { data, isLoading, isError, error, refetch } = useCourseBank(DEFAULT_COURSE_ID)

  useBreadcrumbs([
    { label: 'Workspace', to: '/dashboard' },
    { label: 'Practice', to: '/practice/new' },
    { label: 'New session' },
  ])

  const topics = data?.topics ?? []
  const [choice, setChoice] = useState('')
  const [goal, setGoal] = useState('')
  const [difficulty, setDifficulty] = useState(ANY_DIFFICULTY)
  const [count, setCount] = useState(() =>
    searchParams.has('count') ? clampPracticeCount(searchParams.get('count')) : 5
  )
  const [errorMessage, setErrorMessage] = useState(null)

  // A link can name a topic or a concept; resolve it against the bank once,
  // when the bank is here.
  useEffect(() => {
    if (isLoading || choice) return
    setChoice(
      resolveChoice(topics, {
        topic: searchParams.get('topic') ?? '',
        concept: searchParams.get('concept') ?? '',
      })
    )
  }, [isLoading, topics, choice, searchParams])

  const questions = useMemo(() => questionsForChoice(topics, choice), [topics, choice])
  const mix = bloomMix(questions)
  const asked = Math.min(count, questions.length)
  const fit = difficultyFit(questions, { count: asked, difficulty })
  const label = choiceLabel(topics, choice)
  const courseTotal = topics.reduce((sum, topic) => sum + topic.questions.length, 0)

  const handleSubmit = (event) => {
    event.preventDefault()
    const picked = pickBank(questions, { count: asked, difficulty })
    if (picked.length === 0) {
      setErrorMessage('This bank has no questions to ask yet.')
      return
    }
    initSession(
      {
        goal: goal.trim(),
        topic: label,
        choice,
        difficulty,
        count: picked.length,
        source: BANK_SOURCE_LABEL,
      },
      picked
    )
    navigate('/practice/session')
  }

  const header = (
    <PageHeader
      title="Practice setup"
      description={
        courseTotal > 0
          ? `Questions come from the ${BANK_SOURCE_LABEL.toLowerCase()} — ${plural(courseTotal, 'question')} written for this course.`
          : 'Questions come from the course bank, which is built from the content files.'
      }
    />
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <Skeleton className="h-44 w-full" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <ErrorState
          title="Could not read the course bank"
          message={error?.message || 'The course content is unavailable right now.'}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  if (topics.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <Panel>
          <EmptyState
            icon={IconLearning}
            title="No questions written yet"
            description="The course bank is empty: no concept has questions or a study-notes check. Practice starts working as soon as questions are authored — nothing is invented to fill the gap."
            action={
              <Link
                to={`/course/${DEFAULT_COURSE_ID}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                See the course
              </Link>
            }
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      {header}

      {errorMessage && (
        <ErrorState className="mb-4" title="Could not start the session" message={errorMessage} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Panel className="p-5">
          <SectionHeading icon={IconTarget}>Learning objective</SectionHeading>

          <div className="space-y-3">
            <Input
              id="goal"
              name="goal"
              type="text"
              label="Goal (optional)"
              placeholder="e.g. Technical interview prep, pass the OS exam"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />

            <Select
              id="bank"
              label="What to practise"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              hint={`${plural(questions.length, 'question')} in this bank${
                label ? ` — ${sentenceCase(label)}` : ''
              }`}
            >
              {topics.map((topic) => (
                <optgroup
                  key={topic.id}
                  label={`${sentenceCase(topic.title)} — ${plural(topic.questions.length, 'question')}`}
                >
                  <option value={`topic:${topic.id}`}>
                    Whole topic — {plural(topic.questions.length, 'question')}
                  </option>
                  {topic.concepts.map((concept) => (
                    <option key={concept.id} value={`concept:${concept.id}`}>
                      {sentenceCase(concept.title)} — {plural(concept.questions.length, 'question')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeading icon={IconLearning}>Cognitive level</SectionHeading>

          <p className="text-sm leading-relaxed text-muted">
            Sessions are mixed across Bloom levels: consecutive questions come from different levels
            wherever the bank has them, so a session never drills one level on end.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {mix.length > 0 ? (
              mix.map((entry) => (
                <Badge
                  key={entry.level}
                  variant="neutral"
                  label={`${bloomLabel(entry.level)} × ${entry.count}`}
                />
              ))
            ) : (
              <span className="text-xs text-muted">No questions in this bank.</span>
            )}
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeading icon={IconSettings}>Session scope</SectionHeading>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="difficulty"
              name="difficulty"
              label="Difficulty preference"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              options={[{ value: ANY_DIFFICULTY, label: 'Any' }, ...DIFFICULTIES]}
              hint={
                difficulty === ANY_DIFFICULTY
                  ? 'Every question in the bank is fair game.'
                  : fit.used
                    ? `The bank has ${plural(fit.matching, difficulty)} question${
                        fit.matching === 1 ? '' : 's'
                      }, enough for all ${plural(asked, 'question')}.`
                    : `Only ${plural(fit.matching, difficulty)} question${
                        fit.matching === 1 ? '' : 's'
                      } — the session will also cover the rest of the bank.`
              }
            />

            <Input
              id="count"
              name="count"
              type="number"
              label={`Number of questions (1–${Math.min(MAX_PRACTICE_COUNT, questions.length) || 1})`}
              min={1}
              max={Math.max(1, Math.min(MAX_PRACTICE_COUNT, questions.length))}
              value={count}
              onChange={(event) => setCount(clampPracticeCount(event.target.value, 1))}
              hint={
                count > questions.length
                  ? `Only ${plural(questions.length, 'question')} in this bank — the session will ask all of them.`
                  : `Up to ${plural(questions.length, 'question')} available.`
              }
            />
          </div>
        </Panel>

        <Button
          id="btn-start-session"
          type="submit"
          fullWidth
          size="lg"
          disabled={asked === 0}
        >
          {asked > 0 ? `Start practice · ${plural(asked, 'question')}` : 'No questions to practise'}
        </Button>
      </form>
    </div>
  )
}
