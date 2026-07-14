import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { calculateLearningStats, calculateQuestionStats, formatRate } from './learningStats'

const bank: QuestionBank = { id: 'bank', name: '题库', source: 'local', chapters: [{ id: 'chapter', name: '章', sections: [{ id: 'section', name: '节', questions: [
  { id: 'correct', number: 1, text: '', answer: '', analysis: '' },
  { id: 'vague', number: 2, text: '', answer: '', analysis: '' },
  { id: 'wrong', number: 3, text: '', answer: '', analysis: '' },
  { id: 'unmarked', number: 4, text: '', answer: '', analysis: '' },
] }] }] }

describe('learning stats', () => {
  it('calculates accuracy from marked questions only', () => {
    const stats = calculateLearningStats([bank], { correct: 'proficient', vague: 'vague', wrong: 'wrong', outside: 'proficient' })

    expect(stats).toMatchObject({ total: 4, marked: 3, unmarked: 1, proficient: 1, vague: 1, wrong: 1 })
    expect(stats.accuracy).toBeCloseTo(1 / 3)
    expect(stats.completion).toBeCloseTo(3 / 4)
  })

  it('does not report an accuracy before any question is marked', () => {
    expect(formatRate(calculateLearningStats([bank], {}).accuracy)).toBe('—')
  })

  it('calculates section-level stats from a question list', () => {
    const questions = bank.chapters[0].sections[0].questions.slice(0, 2)
    expect(calculateQuestionStats(questions, { correct: 'proficient', vague: 'vague', wrong: 'wrong' })).toMatchObject({ total: 2, marked: 2, proficient: 1, vague: 1, wrong: 0 })
  })
})
