import { beforeEach, describe, expect, it } from 'vitest'
import { countMarkedQuestions, getStudyRound, loadStudyRounds, saveStudyRounds, updateStudyRound, validateStudyRounds } from './studyRounds'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

describe('学习轮次', () => {
  it('将旧版当前记录迁移为第 1 轮', () => {
    localStorage.setItem('npee:status:v1', JSON.stringify({ q1: 'wrong' }))
    localStorage.setItem('npee:activity:v1', JSON.stringify([{ date: '2026-07-15', questionId: 'q1', bankId: 'b1', status: 'wrong', updatedAt: '2026-07-15T01:00:00.000Z' }]))
    const rounds = loadStudyRounds()
    expect(rounds['1'].statuses).toEqual({ q1: 'wrong' })
    expect(rounds['1'].activities).toHaveLength(1)
    expect(localStorage.getItem('npee:status:v1')).toBeNull()
    expect(localStorage.getItem('npee:rounds:v1')).toContain('q1')
  })

  it('轮次之间的标记和每日记录相互隔离', () => {
    const first = validateStudyRounds(null, { q1: 'proficient' })
    const rounds = updateStudyRound(first, 2, { q2: 'wrong' }, [])
    expect(getStudyRound(rounds, 1).statuses).toEqual({ q1: 'proficient' })
    expect(getStudyRound(rounds, 2).statuses).toEqual({ q2: 'wrong' })
    expect(countMarkedQuestions(getStudyRound(rounds, 1))).toBe(1)
    expect(saveStudyRounds(rounds)).toBe(true)
  })
})
