import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('GeneratePanel request contract', () => {
  it('passes the uploaded-only toggle into runGeneration', () => {
    const source = readFileSync(fileURLToPath(new URL('./GeneratePanel.jsx', import.meta.url)), 'utf8')
    expect(source).toMatch(/runGeneration\(\{[\s\S]*?uploaded_only:\s*uploadedOnly,[\s\S]*?\}\)/)
  })
})
