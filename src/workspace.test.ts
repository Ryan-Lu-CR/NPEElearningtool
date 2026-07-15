import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { createWorkspaceManifest, createWorkspaceUserData, resolveWorkspaceImagePath } from './workspace'

const bank: QuestionBank = {
  id: 'bank-1',
  name: '题库',
  source: 'local',
  chapters: [],
}

describe('workspace data separation', () => {
  it('keeps project data free of user statuses', () => {
    const manifest = createWorkspaceManifest([bank], { 'bank-1': '题库' })
    expect(manifest.banks).toEqual([bank])
    expect(manifest.folders).toEqual({ 'bank-1': '题库' })
    expect(manifest).not.toHaveProperty('statuses')
  })

  it('writes isolated study rounds only to user data', () => {
    const activities = [{ date: '2026-07-14', questionId: 'question-1', bankId: 'bank-1', status: 'wrong' as const, updatedAt: '2026-07-14T02:00:00.000Z' }]
    const userData = createWorkspaceUserData({ '1': { statuses: { 'question-1': 'wrong' }, activities } }, { examDate: '2026-12-19', activeRound: 1, roundCount: 5 })
    expect(userData.version).toBe(3)
    expect(userData.rounds?.['1'].statuses).toEqual({ 'question-1': 'wrong' })
    expect(userData.rounds?.['1'].activities).toEqual(activities)
    expect(userData.settings).toEqual({ examDate: '2026-12-19', activeRound: 1, roundCount: 5 })
    expect(userData).not.toHaveProperty('statuses')
    expect(userData).not.toHaveProperty('activities')
    expect(userData).not.toHaveProperty('banks')
    expect(userData).not.toHaveProperty('folders')
  })

  it('recognizes a bank stored below a grouping folder', () => {
    expect(resolveWorkspaceImagePath(
      '英语一真题/2024年考研英语一真题/资源/analysis.webp',
      ['英语一真题/2024年考研英语一真题'],
    )).toEqual({
      bankFolder: '英语一真题/2024年考研英语一真题',
      relativePath: '资源/analysis.webp',
    })
  })
})
