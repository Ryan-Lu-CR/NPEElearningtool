import { describe, expect, it } from 'vitest'
import { filterQuestionsForExport, splitPages } from './ExportDialog'
import type { Question } from './types'
import { isImageAnswerPlaceholder } from './questionPresentation'

const questions: Question[] = Array.from({ length: 5 }, (_, index) => ({
  id: `q-${index + 1}`, number: index + 1, type: '图片题', text: '', answer: '答案', analysis: '解析'
}))

describe('export selection', () => {
  it('识别答案图的无效占位文字', () => {
    expect(isImageAnswerPlaceholder('见答案图片')).toBe(true)
    expect(isImageAnswerPlaceholder('见答案图片。')).toBe(true)
    expect(isImageAnswerPlaceholder('A. 真实答案')).toBe(false)
  })

  it('支持每页一题或两题', () => {
    expect(splitPages(questions, 1).map(page => page.length)).toEqual([1, 1, 1, 1, 1])
    expect(splitPages(questions, 2).map(page => page.length)).toEqual([2, 2, 1])
  })

  it('按学习状态筛选并把缺省状态视为未标记', () => {
    const statuses = { 'q-1': 'wrong', 'q-2': 'proficient' } as const
    expect(filterQuestionsForExport(questions, 'wrong', statuses).map(question => question.id)).toEqual(['q-1'])
    expect(filterQuestionsForExport(questions, 'none', statuses)).toHaveLength(3)
    expect(filterQuestionsForExport(questions, 'all', statuses)).toHaveLength(5)
  })
})
