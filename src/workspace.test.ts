import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { createWorkspaceManifest, createWorkspaceUserData } from './workspace'

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

  it('writes statuses only to user data', () => {
    const userData = createWorkspaceUserData({ 'question-1': 'wrong' })
    expect(userData.statuses).toEqual({ 'question-1': 'wrong' })
    expect(userData).not.toHaveProperty('banks')
    expect(userData).not.toHaveProperty('folders')
  })
})
