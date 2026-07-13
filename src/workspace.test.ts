import { describe, expect, it } from 'vitest'
import { safeFolderName } from './workspace'

describe('safeFolderName', () => {
  it('removes characters forbidden in local folder names', () => {
    expect(safeFolderName('高数/强化:2027?')).toBe('高数-强化-2027-')
  })

  it('provides a readable fallback', () => {
    expect(safeFolderName('   ')).toBe('未命名题库')
  })
})
