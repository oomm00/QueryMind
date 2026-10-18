/**
 * GenerateQuestionsPage — /generate.
 *
 * The page itself is a heading and the panel: every rule about topics, Bloom
 * levels, the generation loop and its failures lives in
 * components/practice/GeneratePanel.jsx, so the same panel can sit on /practice
 * as the "Any topic" tab without a second copy of any of it.
 */

import React from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { GeneratePanel } from '../components/practice/GeneratePanel.jsx'

export default function GenerateQuestionsPage() {
  return (
    <div>
      <PageHeader
        title="Generate questions"
        description="Practise a topic that has no course behind it, at the difficulty and Bloom levels you pick."
      />
      <GeneratePanel />
    </div>
  )
}
