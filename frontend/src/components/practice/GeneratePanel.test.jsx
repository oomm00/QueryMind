import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GeneratePanel request contract', () => {
  it('passes the uploaded-only toggle into runGeneration', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/components/practice/GeneratePanel.jsx'),
      'utf8'
    )
    expect(source).toMatch(/runGeneration\(\{[\s\S]*?uploaded_only:\s*uploadedOnly,[\s\S]*?\}\)/)
  })
})
