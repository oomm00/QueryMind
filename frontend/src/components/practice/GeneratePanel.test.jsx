import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GeneratePanel simplified setup screen contract', () => {
  const source = readFileSync(
    path.resolve(process.cwd(), 'src/components/practice/GeneratePanel.jsx'),
    'utf8'
  )

  it('stores uploadedOnly flag in the adaptive session', () => {
    expect(source).toMatch(/newSession\(\{[\s\S]*?uploadedOnly,[\s\S]*?adaptive:\s*true/)
  })

  it('removes manual, difficulty, bloom and count toggles from UI', () => {
    expect(source).not.toMatch(/bloomsForDifficulty/)
    expect(source).not.toMatch(/GENERATE_DIFFICULTIES/)
    expect(source).not.toMatch(/GENERATE_COUNT_CHOICES/)
    expect(source).not.toMatch(/Adaptive \(recommended\)/)
    expect(source).not.toMatch(/setAdaptive/)
  })

  it('has Start practice as the primary action', () => {
    expect(source).toMatch(/Start practice/)
  })
})
