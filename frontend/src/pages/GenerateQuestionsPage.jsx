/**
 * GenerateQuestionsPage — ask for questions about material that exists.
 *
 * Subject and Topic are dropdowns built from GET /documents/topics, not free
 * text: retrieval filters on an exact (subject, topic) match, so a typo would
 * silently come back as "no context". With nothing uploaded yet the page says
 * so and links to the Upload page instead of offering a form that cannot
 * succeed. The request carries a 60s deadline (api/endpoints/questions.js),
 * and every backend code arrives as the sentence in api/errorMessages.js.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { questionsApi } from '../api/endpoints/questions.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useDocumentTopics } from '../hooks/useDocuments.js'
import { subjectList, topicsFor } from '../lib/topicSuggestions.js'
import { BLOOM_LEVELS, DIFFICULTIES } from '../constants/bloomTaxonomy.js'
import { BloomChip } from '../components/practice/BloomChip'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { IconSparkles } from '../components/ui/Icons'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, PanelSmall } from '../components/ui/Panel'
import { Select } from '../components/ui/Select'

const COUNT_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({
  value: String(value),
  label: `${value} question${value === 1 ? '' : 's'}`,
}))

/** Stable fallback so `rows` keeps one identity while suggestions load. */
const NO_TOPIC_ROWS = []

function difficultyLabel(value) {
  return DIFFICULTIES.find((option) => option.value === value)?.label ?? value
}

export default function GenerateQuestionsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const topicsQuery = useDocumentTopics()

  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [bloomLevel, setBloomLevel] = useState('understand')
  const [difficulty, setDifficulty] = useState('medium')
  const [count, setCount] = useState('1')
  const [questions, setQuestions] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const rows = topicsQuery.data ?? NO_TOPIC_ROWS
  const subjects = useMemo(() => subjectList(rows), [rows])
  const topicOptions = useMemo(() => topicsFor(rows, subject), [rows, subject])

  // Land on a valid pair as soon as suggestions arrive, so the first click works.
  useEffect(() => {
    if (!rows.length) return
    setSubject((prev) => prev || rows[0].subject)
    setTopic((prev) => prev || topicsFor(rows, rows[0].subject)[0] || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows is derived from topicsQuery.data
  }, [topicsQuery.data])

  const handleSubjectChange = (value) => {
    setSubject(value)
    const options = topicsFor(rows, value)
    if (!options.includes(topic)) setTopic(options[0] ?? '')
  }

  const generate = async () => {
    if (!subject || !topic || loading) return

    setLoading(true)
    setError(null)
    try {
      const result = await questionsApi.generate(
        {
          subject,
          topic,
          bloom_level: bloomLevel,
          difficulty,
          count: Number(count),
        },
        user?.user_id
      )
      setQuestions(result.questions ?? [])
    } catch (err) {
      setQuestions([])
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    generate()
  }

  const hasNothingUploaded = topicsQuery.isSuccess && rows.length === 0

  return (
    <div>
      <PageHeader
        title="Generate questions"
        description="Practice questions grounded in your uploaded material, at the Bloom level and difficulty you pick."
      />

      {topicsQuery.isLoading ? (
        <Panel>
          <p role="status" className="p-4 text-sm text-muted">
            Loading your subjects and topics…
          </p>
        </Panel>
      ) : topicsQuery.isError ? (
        <ErrorState
          title="Could not load your subjects"
          message={topicsQuery.error?.message || 'The topic list is unavailable right now.'}
          onRetry={() => topicsQuery.refetch()}
        />
      ) : hasNothingUploaded ? (
        <EmptyState
          icon={IconSparkles}
          title="Upload a document first"
          description="Questions are grounded in material you upload. Add a document and its subject and topic will show up here."
          actionLabel="Upload a document"
          onAction={() => navigate('/upload')}
        />
      ) : (
        <>
          <Panel className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Subject"
                  options={subjects.map((name) => ({ value: name, label: name }))}
                  value={subject}
                  onChange={(event) => handleSubjectChange(event.target.value)}
                />
                <Select
                  label="Topic"
                  options={topicOptions.map((name) => ({ value: name, label: name }))}
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                />
                <Select
                  label="Bloom level"
                  options={BLOOM_LEVELS.map((level) => ({ value: level.value, label: level.label }))}
                  value={bloomLevel}
                  onChange={(event) => setBloomLevel(event.target.value)}
                />
                <Select
                  label="Difficulty"
                  options={DIFFICULTIES}
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                />
                <Select
                  label="Number of questions"
                  options={COUNT_OPTIONS}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  hint="Each question is grounded in your uploaded material."
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={loading} disabled={!subject || !topic}>
                  {loading ? 'Generating…' : 'Generate questions'}
                </Button>
                {(!subject || !topic) && (
                  <p className="text-xs text-muted">Choose a subject and topic first.</p>
                )}
              </div>

              <span role="status" className="sr-only">
                {loading ? 'Generating questions. This can take up to a minute.' : ''}
              </span>
            </form>
          </Panel>

          {error && (
            <ErrorState
              className="mt-6"
              title="Could not generate questions"
              message={error.message}
              onRetry={error.retryable ? generate : undefined}
            />
          )}

          {questions.length > 0 && (
            <section aria-labelledby="generated-questions-heading" className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="generated-questions-heading" className="text-sm font-semibold text-ink">
                  Generated questions
                </h2>
                <span className="text-xs text-muted">
                  {questions.length} {questions.length === 1 ? 'question' : 'questions'} · {subject} / {topic}
                </span>
              </div>
              <ul className="space-y-3">
                {questions.map((question, index) => (
                  <li key={question.question_id ?? `q-${index}`}>
                    <PanelSmall>
                      <div className="flex flex-wrap items-center gap-2">
                        <BloomChip bloom={question.bloom_level} />
                        <span className="text-xs text-muted">
                          {difficultyLabel(question.difficulty)}
                          {question.topic ? ` · ${question.topic}` : ''}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink">{question.question_text}</p>
                    </PanelSmall>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
