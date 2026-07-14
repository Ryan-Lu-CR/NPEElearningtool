import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { resolveNavigation } from './navigationRestore'

const bank: QuestionBank = { id: 'math', name: '数学', source: 'local', chapters: [{ id: 'chapter', name: '章', sections: [
  { id: 'first-section', name: '第一节', questions: [{ id: 'q1', number: 1, text: '1', answer: '1', analysis: '1' }] },
  { id: 'saved-section', name: '第二节', questions: [
    { id: 'q2', number: 1, text: '2', answer: '2', analysis: '2' },
    { id: 'q3', number: 2, text: '3', answer: '3', analysis: '3' },
  ] },
] }] }

describe('navigation restore', () => {
  it('restores the exact math section and question', () => {
    expect(resolveNavigation([bank], {}, { bankId: 'math', sectionId: 'saved-section', questionId: 'q3', view: 'section' })).toEqual({
      bankId: 'math', chapterId: 'chapter', sectionId: 'saved-section', questionIndex: 1, view: 'section',
    })
  })

  it('restores a question in the bank-wide wrong-book order', () => {
    expect(resolveNavigation([bank], { q1: 'wrong', q3: 'wrong' }, { bankId: 'math', sectionId: 'saved-section', questionId: 'q3', view: 'wrong' })?.questionIndex).toBe(1)
  })

  it('finds a migrated bank by its preserved section id', () => {
    expect(resolveNavigation([{ ...bank, id: 'english-exams' }], {}, { bankId: 'english-2024', sectionId: 'saved-section', questionId: 'q2', view: 'section' })?.bankId).toBe('english-exams')
  })

  it('falls back to the first question if the saved question no longer exists', () => {
    expect(resolveNavigation([bank], {}, { bankId: 'math', sectionId: 'saved-section', questionId: 'missing', view: 'section' })?.questionIndex).toBe(0)
  })
})
