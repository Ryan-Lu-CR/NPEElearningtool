import { beforeEach, describe, expect, it } from 'vitest'
import englishPayload from './englishBanks.json'
import { initializeBuiltInBanks } from './data'
import { loadBanks, loadNavigation, loadStatuses, renameBank, renameChapter, saveBanks, saveNavigation, saveStatuses, validateBanks, validateStatuses } from './store'
import type { QuestionBank } from './types'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  get length() { return this.data.size }
}

const validBank = {
  id: 'bank-1', name: '测试题库', chapters: [{ id: 'chapter-1', name: '第一章', sections: [{
    id: 'section-1', name: '选择题', questions: [{ id: 'question-1', number: 1, type: '选择题', text: '题目', answer: 'A', analysis: '解析' }]
  }]}]
}

beforeEach(() => {
  initializeBuiltInBanks(englishPayload.banks as unknown as QuestionBank[])
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

describe('validateBanks', () => {
  it('归一化缺省来源并保留完整层级', () => {
    const result = validateBanks({ banks: [validBank] })
    expect(result[0].source).toBe('local')
    expect(result[0].chapters[0].sections[0].questions[0].text).toBe('题目')
  })

  it('拒绝深层缺失字段', () => {
    const invalid = structuredClone(validBank)
    Reflect.deleteProperty(invalid.chapters[0].sections[0].questions[0], 'answer')
    expect(() => validateBanks([invalid])).toThrow('answer 必须是非空文本')
  })

  it('拒绝跨层级重复 ID', () => {
    const invalid = structuredClone(validBank)
    invalid.chapters[0].id = 'bank-1'
    expect(() => validateBanks([invalid])).toThrow('重复')
  })

  it('保留多张题目图和答案图的素材键', () => {
    const withImages = structuredClone(validBank)
    Object.assign(withImages.chapters[0].sections[0].questions[0], { imageKeys: ['q/1', 'q/2'], answerImageKeys: ['a/1', 'a/2', 'a/3'] })
    const question = validateBanks([withImages])[0].chapters[0].sections[0].questions[0]
    expect(question.imageKeys).toHaveLength(2)
    expect(question.answerImageKeys).toHaveLength(3)
  })

  it('允许纯图片题不显示重复的占位正文', () => {
    const imageOnly = structuredClone(validBank)
    Object.assign(imageOnly.chapters[0].sections[0].questions[0], { type: '图片题', text: '', imageKeys: ['q/1'] })
    expect(validateBanks([imageOnly])[0].chapters[0].sections[0].questions[0].text).toBe('')
  })

  it('允许只有答案图的待补全题目保留空题干', () => {
    const answerImageOnly = structuredClone(validBank)
    Object.assign(answerImageOnly.chapters[0].sections[0].questions[0], { text: '', imageKeys: [], answerImageKeys: ['a/1'] })
    const question = validateBanks([answerImageOnly])[0].chapters[0].sections[0].questions[0]
    expect(question.text).toBe('')
    expect(question.answerImageKeys).toEqual(['a/1'])
  })

  it('题型字段可以完全省略', () => {
    const withoutType = structuredClone(validBank)
    Reflect.deleteProperty(withoutType.chapters[0].sections[0].questions[0], 'type')
    expect(validateBanks([withoutType])[0].chapters[0].sections[0].questions[0].type).toBeUndefined()
  })

  it('保留小节共用的英语原文', () => {
    const withPassage = structuredClone(validBank)
    Object.assign(withPassage.chapters[0].sections[0], { passage: 'First paragraph.\n\nSecond paragraph.' })
    expect(validateBanks([withPassage])[0].chapters[0].sections[0].passage).toContain('Second paragraph')
  })

  it('保留合法的阅读题型标注并过滤非法值', () => {
    const marked = structuredClone(validBank)
    Object.assign(marked.chapters[0].sections[0].questions[0], { readingType: 'inference' })
    expect(validateBanks([marked])[0].chapters[0].sections[0].questions[0].readingType).toBe('inference')
    Object.assign(marked.chapters[0].sections[0].questions[0], { readingType: 'invalid' })
    expect(validateBanks([marked])[0].chapters[0].sections[0].questions[0].readingType).toBeUndefined()
  })
})

describe('local storage recovery', () => {
  it('缓存损坏时恢复内置题库', () => {
    localStorage.setItem('npee:banks:v1', '{broken')
    expect(loadBanks().length).toBeGreaterThan(0)
  })

  it('只加载合法学习状态', () => {
    localStorage.setItem('npee:status:v1', JSON.stringify({ q1: 'wrong', q2: 'invalid', q3: 'proficient' }))
    expect(loadStatuses()).toEqual({ q1: 'wrong', q3: 'proficient' })
  })

  it('为已有缓存一次性补入英语真题内置题库', () => {
    localStorage.setItem('npee:banks:v1', JSON.stringify([validBank]))
    const firstLoad = loadBanks()
    expect(firstLoad.some(bank => bank.id === 'bank-1')).toBe(true)
    expect(firstLoad.filter(bank => /^english-200[4-9]$/.test(bank.id))).toHaveLength(6)

    saveBanks(firstLoad.filter(bank => bank.id !== 'english-2004'))
    expect(loadBanks().some(bank => bank.id === 'english-2004')).toBe(false)
  })

  it('导入备份时过滤非法学习状态', () => {
    expect(validateStatuses({ q1: 'wrong', q2: 'hacked', q3: 1 })).toEqual({ q1: 'wrong' })
  })

  it('可以往返保存题库和状态', () => {
    const banks = validateBanks([validBank])
    saveBanks(banks); saveStatuses({ 'question-1': 'vague' })
    expect(loadBanks()).toEqual(banks)
    expect(loadStatuses()).toEqual({ 'question-1': 'vague' })
  })

  it('内置题库使用紧凑缓存，避免重复占用 localStorage', () => {
    const banks = loadBanks()
    expect(saveBanks(banks)).toBe(true)
    const raw = localStorage.getItem('npee:banks:v1') || ''
    expect(raw.length).toBeLessThan(2_000)
    expect(loadBanks()).toEqual(banks)
  })

  it('紧凑缓存保留内置题库删除和自定义修改', () => {
    const banks = loadBanks()
    const changed = banks.filter(bank => bank.id !== 'english-2004')
    changed[0] = { ...changed[0], name: '用户重命名' }
    saveBanks(changed)
    const restored = loadBanks()
    expect(restored.some(bank => bank.id === 'english-2004')).toBe(false)
    expect(restored[0].name).toBe('用户重命名')
  })
})

describe('rename', () => {
  it('重命名题库但保持 ID 和题目关联', () => {
    const banks = validateBanks([validBank])
    const renamed = renameBank(banks, 'bank-1', '  新题库名称  ')
    expect(renamed[0].name).toBe('新题库名称')
    expect(renamed[0].id).toBe('bank-1')
    expect(renamed[0].chapters[0].sections[0].questions[0].id).toBe('question-1')
  })

  it('重命名指定章节且不影响其他层级 ID', () => {
    const banks = validateBanks([validBank])
    const renamed = renameChapter(banks, 'bank-1', 'chapter-1', '极限专题')
    expect(renamed[0].chapters[0].name).toBe('极限专题')
    expect(renamed[0].chapters[0].id).toBe('chapter-1')
    expect(renamed[0].chapters[0].sections[0].id).toBe('section-1')
  })
})

describe('navigation recovery', () => {
  it('保存并恢复最后学习位置', () => {
    saveNavigation({ bankId: 'bank-1', sectionId: 'section-1', questionId: 'question-1', view: 'section' })
    expect(loadNavigation()).toEqual({ bankId: 'bank-1', sectionId: 'section-1', questionId: 'question-1', view: 'section' })
  })

  it('损坏的位置记录会被安全忽略', () => {
    localStorage.setItem('npee:navigation:v1', JSON.stringify({ bankId: 1, sectionId: null }))
    expect(loadNavigation()).toBeNull()
  })
})
