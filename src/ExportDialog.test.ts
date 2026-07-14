import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { dateFolderName, ExportPage, filterQuestionsForExport, imageExportFolderName, originalAssetName, splitPages } from './ExportDialog'
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

  it('为原图复制生成稳定的日期目录和原始文件名', () => {
    expect(dateFolderName(new Date(2026, 6, 14))).toBe('2026-07-14')
    expect(originalAssetName('bank/question/1-Q-02-3-06.png')).toBe('Q-02-3-06.png')
    expect(imageExportFolderName('880/线代', '02 矩阵', '综合', new Date(2026, 6, 14))).toBe('2026-07-14-880-线代-02 矩阵-综合')
  })

  it('按学习状态筛选并把缺省状态视为未标记', () => {
    const statuses = { 'q-1': 'wrong', 'q-2': 'proficient', 'q-3': 'vague' } as const
    expect(filterQuestionsForExport(questions, 'wrong', statuses).map(question => question.id)).toEqual(['q-1'])
    expect(filterQuestionsForExport(questions, 'review', statuses).map(question => question.id)).toEqual(['q-1', 'q-3'])
    expect(filterQuestionsForExport(questions, 'none', statuses)).toHaveLength(2)
    expect(filterQuestionsForExport(questions, 'all', statuses)).toHaveLength(5)
  })

  it('导出页面只包含题目，不包含答案与解析', () => {
    const markup = renderToStaticMarkup(createElement(ExportPage, { questions: [{ ...questions[0], text: '题目正文', answer: '秘密答案', analysis: '秘密解析' }], statuses: { 'q-1': 'vague' }, pageNumber: 1 }))
    expect(markup).toContain('题目正文')
    expect(markup).toContain('模糊')
    expect(markup).not.toContain('秘密答案')
    expect(markup).not.toContain('秘密解析')
  })
})
