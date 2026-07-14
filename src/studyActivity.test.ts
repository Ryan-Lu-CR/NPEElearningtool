import { describe, expect, it } from 'vitest'
import { calculateDailyActivity, localDateKey, mergeStudyActivities, updateStudyActivity, validateStudyActivities } from './studyActivity'

describe('study activity', () => {
  const now = new Date(2026, 6, 14, 10, 30)

  it('按本地日期记录同一道题当天的最终状态', () => {
    const first = updateStudyActivity([], { questionId: 'q1', bankId: 'math', status: 'wrong', previousStatus: 'none' }, now)
    const updated = updateStudyActivity(first, { questionId: 'q1', bankId: 'math', status: 'proficient', previousStatus: 'wrong' }, new Date(2026, 6, 14, 11, 30))
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({
      schemaVersion: 2,
      date: '2026-07-14',
      questionId: 'q1',
      initialStatus: 'none',
      status: 'proficient',
      firstUpdatedAt: now.toISOString(),
      updatedAt: new Date(2026, 6, 14, 11, 30).toISOString(),
      changeCount: 2,
    })
    expect(localDateKey(now)).toBe('2026-07-14')
  })

  it('取消标记时保留当天最终的未标记状态', () => {
    const activities = [
      { date: '2026-07-13', questionId: 'q1', bankId: 'math', status: 'wrong' as const, updatedAt: '2026-07-13T02:00:00.000Z' },
      { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'wrong' as const, updatedAt: '2026-07-14T02:00:00.000Z' },
    ]
    expect(updateStudyActivity(activities, { questionId: 'q1', bankId: 'math', status: 'none', previousStatus: 'wrong' }, now)).toEqual([
      activities[0],
      expect.objectContaining({ date: '2026-07-14', initialStatus: 'wrong', status: 'none', changeCount: 1 }),
    ])
  })

  it('保存以后分析所需的题目上下文', () => {
    const [record] = updateStudyActivity([], {
      questionId: 'q1', bankId: 'math', status: 'vague', previousStatus: 'none',
      chapterId: 'c1', sectionId: 's1', questionNumber: 7, questionType: '选择题',
      subject: 'math', source: 'dashboard', answerRevealed: true,
    }, now)
    expect(record).toMatchObject({ chapterId: 'c1', sectionId: 's1', questionNumber: 7, questionType: '选择题', subject: 'math', source: 'dashboard', answerRevealed: true })
    expect(validateStudyActivities([record])).toEqual([record])
  })

  it('统计每日题量和正确率', () => {
    expect(calculateDailyActivity([
      { date: '2026-07-14', questionId: 'q0', bankId: 'math', status: 'none', updatedAt: '' },
      { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'proficient', updatedAt: '' },
      { date: '2026-07-14', questionId: 'q2', bankId: 'math', status: 'vague', updatedAt: '' },
      { date: '2026-07-14', questionId: 'q3', bankId: 'math', status: 'wrong', updatedAt: '' },
    ])).toEqual({ total: 3, proficient: 1, vague: 1, wrong: 1, accuracy: 1 / 3 })
  })

  it('过滤损坏的活动数据', () => {
    expect(validateStudyActivities([{ date: 'bad', questionId: 'q1' }, { date: '2026-07-14', questionId: 'q2', bankId: 'math', status: 'wrong', updatedAt: 'now' }])).toHaveLength(1)
  })

  it('合并备份时同一天同一道题只保留最新状态', () => {
    const oldEntry = { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'wrong' as const, updatedAt: '2026-07-14T02:00:00.000Z' }
    const newEntry = { ...oldEntry, status: 'proficient' as const, updatedAt: '2026-07-14T03:00:00.000Z' }
    expect(mergeStudyActivities([oldEntry], [newEntry])).toEqual([newEntry])
  })
})
