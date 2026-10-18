/**
 * InterviewPrepPage — /interview
 * Technical assessment & interview simulator grounded in technical fundamentals.
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBreadcrumbs } from '../hooks/useBreadcrumbs'
import { PageHeader } from '../components/ui/PageHeader'
import { PanelLarge } from '../components/ui/Panel'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { IconInterview, IconClock, IconSparkles } from '../components/ui/Icons'

const INTERVIEW_TRACKS = [
  {
    id: 'os-systems',
    title: 'Operating Systems & Concurrency',
    description: 'Processes, threads, synchronization primitives, deadlocks, and virtual memory.',
    timeEstimate: '45 mins',
    level: 'Hard',
    topic: 'Concurrency & Deadlocks',
  },
  {
    id: 'dbms-transactions',
    title: 'Database Transactions & Internals',
    description: 'ACID properties, serializability, 2PL, WAL logging, and query indexing.',
    timeEstimate: '40 mins',
    level: 'Hard',
    topic: 'Transactions',
  },
  {
    id: 'system-design',
    title: 'System Design & Distributed Data',
    description: 'Partitioning, caching strategies, replication algorithms, and consensus.',
    timeEstimate: '60 mins',
    level: 'Expert',
    topic: 'System Design',
  },
]

export default function InterviewPrepPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  useBreadcrumbs([{ label: 'Workspace', to: '/dashboard' }, { label: 'Interview Prep' }])

  const [activeTrack, setActiveTrack] = useState(null)

  const startTrack = (track) => {
    // Navigate straight to practice generator pre-focused on the track topic
    navigate(`/practice`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Technical Interview Simulator"
        description="Rigorous, timed question sets designed to mirror technical assessments at leading software organizations."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {INTERVIEW_TRACKS.map((track) => (
          <PanelLarge key={track.id} className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge tone="primary" label={track.level} />
                <span className="flex items-center gap-1 text-xs text-muted">
                  <IconClock size={13} />
                  {track.timeEstimate}
                </span>
              </div>
              <h3 className="text-base font-semibold text-ink">{track.title}</h3>
              <p className="text-xs leading-relaxed text-muted">{track.description}</p>
            </div>

            <Button
              className="w-full"
              icon={<IconInterview size={16} />}
              onClick={() => startTrack(track)}
            >
              Start Simulator
            </Button>
          </PanelLarge>
        ))}
      </div>

      <PanelLarge>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold text-ink">Custom Assessment via AI</h2>
            <p className="mt-1 text-xs text-muted">
              Have a specific interview coming up? Name any technical domain or architecture topic, and QueryMind will generate an adaptive mock session using Bloom's Taxonomy.
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<IconSparkles size={16} />}
            onClick={() => navigate('/practice')}
          >
            Create Custom Interview
          </Button>
        </div>
      </PanelLarge>
    </div>
  )
}
