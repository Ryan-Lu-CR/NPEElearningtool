import { describe, expect, it } from 'vitest'
import { buildQuestionReviewTimeline, resetQuestionReview, updateQuestionReview } from './questionReview'

describe('question review timeline', () => {
  it('separates the initial mark from later daily review records', () => {
    const timeline = buildQuestionReviewTimeline([
      { date: '2026-07-16', questionId: 'q1', bankId: 'math', status: 'proficient', firstUpdatedAt: '2026-07-16T02:00:00.000Z', updatedAt: '2026-07-16T03:00:00.000Z' },
      { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'wrong', updatedAt: '2026-07-14T02:00:00.000Z' },
      { date: '2026-07-15', questionId: 'other', bankId: 'math', status: 'vague', updatedAt: '2026-07-15T02:00:00.000Z' },
    ], 'q1')
    expect(timeline.initialMark).toEqual({ date: '2026-07-14', markedAt: '2026-07-14T02:00:00.000Z', status: 'wrong' })
    expect(timeline.reviews).toEqual([
      { attempt: 1, date: '2026-07-16', markedAt: '2026-07-16T02:00:00.000Z', daysAfterFirst: 2, daysAfterPrevious: 2, status: 'proficient' },
    ])
  })

  it('keeps a same-day explicit review separate from the initial mark', () => {
    const timeline = buildQuestionReviewTimeline([
      {
        date: '2026-07-16', questionId: 'q1', bankId: 'math', initialStatus: 'none', status: 'proficient',
        firstUpdatedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T02:00:00.000Z',
        reviews: [{ previousStatus: 'wrong', status: 'proficient', reviewedAt: '2026-07-16T02:00:00.000Z' }],
      },
    ], 'q1')
    expect(timeline.initialMark?.status).toBe('wrong')
    expect(timeline.reviews).toMatchObject([{ attempt: 1, status: 'proficient', daysAfterFirst: 0, daysAfterPrevious: 0 }])
  })

  it('adds, updates and cancels the latest same-day review', () => {
    const initial = [{
      date: '2026-07-16', questionId: 'q1', bankId: 'math', initialStatus: 'none' as const, status: 'wrong' as const,
      firstUpdatedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z',
    }]
    const entry = { questionId: 'q1', bankId: 'math', previousStatus: 'wrong' as const, source: 'dashboard' as const }
    const added = updateQuestionReview(initial, entry, 'proficient', new Date(2026, 6, 16, 10, 0))
    expect(added.status).toBe('proficient')
    expect(added.activities[0].reviews).toHaveLength(1)
    const changed = updateQuestionReview(added.activities, entry, 'vague', new Date(2026, 6, 16, 10, 5))
    expect(changed.activities[0].reviews?.[0].status).toBe('vague')
    const cancelled = updateQuestionReview(changed.activities, entry, 'none', new Date(2026, 6, 16, 10, 10))
    expect(cancelled.status).toBe('wrong')
    expect(cancelled.activities[0].reviews).toEqual([])
  })

  it('keeps explicit review history when the current mastery mark is cleared later', () => {
    const timeline = buildQuestionReviewTimeline([{
      date: '2026-07-16', questionId: 'q1', bankId: 'math', initialStatus: 'none', status: 'none',
      firstUpdatedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T03:00:00.000Z',
      reviews: [{ previousStatus: 'wrong', status: 'proficient', reviewedAt: '2026-07-16T02:00:00.000Z' }],
    }], 'q1')
    expect(timeline.initialMark?.status).toBe('wrong')
    expect(timeline.reviews).toMatchObject([{ attempt: 1, status: 'proficient' }])
  })

  it('ignores an unmarked-only activity', () => {
    expect(buildQuestionReviewTimeline([
      { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'none', updatedAt: '2026-07-14T02:00:00.000Z' },
    ], 'q1')).toEqual({ initialMark: null, reviews: [] })
  })

  it('resets later review records while keeping the initial mark', () => {
    const activities = [
      { date: '2026-07-14', questionId: 'q1', bankId: 'math', status: 'wrong' as const, updatedAt: '2026-07-14T02:00:00.000Z' },
      { date: '2026-07-16', questionId: 'q1', bankId: 'math', status: 'proficient' as const, updatedAt: '2026-07-16T02:00:00.000Z', reviews: [{ previousStatus: 'wrong' as const, status: 'proficient' as const, reviewedAt: '2026-07-16T02:00:00.000Z' }] },
      { date: '2026-07-18', questionId: 'q1', bankId: 'math', status: 'vague' as const, updatedAt: '2026-07-18T02:00:00.000Z', reviews: [{ previousStatus: 'proficient' as const, status: 'vague' as const, reviewedAt: '2026-07-18T02:00:00.000Z' }] },
      { date: '2026-07-18', questionId: 'other', bankId: 'math', status: 'wrong' as const, updatedAt: '2026-07-18T02:00:00.000Z' },
    ]

    const result = resetQuestionReview(activities, 'q1')

    expect(result.reset).toBe(true)
    expect(result.status).toBe('wrong')
    expect(result.activities).toHaveLength(2)
    expect(result.activities.find(item => item.questionId === 'q1')).toMatchObject({ date: '2026-07-14', status: 'wrong' })
    expect(buildQuestionReviewTimeline(result.activities, 'q1')).toEqual({
      initialMark: { date: '2026-07-14', markedAt: '2026-07-14T02:00:00.000Z', status: 'wrong' },
      reviews: [],
    })
  })

  it('normalizes a legacy same-day baseline when resetting its review', () => {
    const activities = [{
      date: '2026-07-16', questionId: 'q1', bankId: 'math', initialStatus: 'vague' as const, status: 'vague' as const,
      firstUpdatedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T02:00:00.000Z',
      reviews: [{ previousStatus: 'vague' as const, status: 'vague' as const, reviewedAt: '2026-07-16T02:00:00.000Z' }],
    }]

    const result = resetQuestionReview(activities, 'q1')

    expect(result.reset).toBe(true)
    expect(result.activities[0]).not.toHaveProperty('initialStatus')
    expect(buildQuestionReviewTimeline(result.activities, 'q1')).toEqual({
      initialMark: { date: '2026-07-16', markedAt: '', status: 'vague' },
      reviews: [],
    })
  })
})
