import { describe, expect, it } from 'vitest'
import { assetKeysForBank, clearQuestionStatuses, orderedQuestionEntriesForBank, removeBank, resetBankData } from './bankManagement'
import type { QuestionBank } from './types'

const bank: QuestionBank = { id: 'b1', name: '题库', source: 'local', chapters: [{ id: 'c1', name: '章', sections: [{ id: 's1', name: '节', questions: [
  { id: 'q1', number: 1, type: '图片题', text: '', answer: 'a', analysis: 'a', imageKeys: ['q/1'], answerImageKeys: ['a/1', 'a/2'] },
  { id: 'q2', number: 2, type: '图片题', text: '', answer: 'a', analysis: 'a' }
] }] }] }

describe('bank management', () => {
  it('可按题库和状态批量清除标注', () => {
    const statuses = { q1: 'wrong', q2: 'vague', outside: 'wrong' } as const
    expect(clearQuestionStatuses(statuses, [bank], 'b1', 'wrong')).toEqual({ q2: 'vague', outside: 'wrong' })
    expect(clearQuestionStatuses(statuses, [bank], 'b1', 'all')).toEqual({ outside: 'wrong' })
  })

  it('枚举题库关联的全部图片键', () => { expect(assetKeysForBank(bank)).toEqual(['q/1', 'a/1', 'a/2']) })
  it('可删除或清空自建题库', () => {
    expect(removeBank([bank], 'b1')).toEqual([])
    expect(resetBankData([bank], 'b1')[0].chapters).toEqual([])
  })
  it('内置题库可恢复为基线副本', () => {
    const changed = { ...bank, name: '已修改', chapters: [] }
    const restored = resetBankData([changed], 'b1', bank)[0]
    expect(restored.name).toBe('题库'); expect(restored.chapters).toHaveLength(1); expect(restored).not.toBe(bank)
  })
  it('按章节顺序和题号升序生成题目列表', () => {
    const unsorted = structuredClone(bank)
    unsorted.chapters[0].sections[0].questions.reverse()
    unsorted.chapters[0].sections.push({ id: 's2', name: '第二节', questions: [
      { id: 'q3', number: 3, text: '', answer: 'a', analysis: 'a' },
    ] })
    const entries = orderedQuestionEntriesForBank(unsorted)
    expect(entries.map(entry => entry.question.number)).toEqual([1, 2, 3])
    expect(entries[0].chapterIndex).toBe(0)
    expect(entries[0].chapterName).toBe('章')
    expect(entries[2].sectionId).toBe('s2')
    expect(entries[2].sectionName).toBe('第二节')
  })
})
