import { beforeEach, describe, expect, it } from 'vitest'
import { loadUserSettings, saveUserSettings, validateUserSettings } from './userSettings'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

describe('用户设置', () => {
  it('只保留合法设置并可往返保存', () => {
    expect(validateUserSettings({ examDate: '2026-12-19', unknown: true })).toEqual({ examDate: '2026-12-19' })
    expect(validateUserSettings({ examDate: '2026-02-29' })).toEqual({})
    expect(saveUserSettings({ examDate: '2026-12-25' })).toBe(true)
    expect(loadUserSettings()).toEqual({ examDate: '2026-12-25' })
  })

  it('自动迁移旧版单独的考试日期', () => {
    localStorage.setItem('npee:exam-date:v1', '2026-12-20')
    expect(loadUserSettings()).toEqual({ examDate: '2026-12-20' })
    expect(localStorage.getItem('npee:exam-date:v1')).toBeNull()
    expect(localStorage.getItem('npee:settings:v1')).toContain('2026-12-20')
  })
})
