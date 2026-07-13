import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { isGeneratedChapterName, isGeneratedSectionName, mergeImageEntries } from './imageImport'

vi.mock('./assets', async importOriginal => ({ ...(await importOriginal<typeof import('./assets')>()), putAssets: vi.fn().mockResolvedValue(undefined) }))

describe('image directory display names', () => {
  it('识别可自动升级的通用章节名', () => {
    expect(isGeneratedChapterName('第 01 章', '01')).toBe(true)
    expect(isGeneratedSectionName('第 7 节', '7')).toBe(true)
  })

  it('不覆盖真实目录名或用户自定义名', () => {
    expect(isGeneratedChapterName('高数18讲', '01')).toBe(false)
    expect(isGeneratedSectionName('第1讲 函数极限与连续', '1')).toBe(false)
  })

  it('只把实际新建的题目计入新建数量', async () => {
    const bank = { id: 'bank', name: '题库', source: 'local' as const, chapters: [{ id: 'bank-chapter-01', name: '第一章', sections: [{ id: 'bank-chapter-01-section-1', name: '第一节', questions: [{ id: 'bank-01-1-01', number: 1, text: '已有题目', answer: 'A', analysis: '解析' }] }] }] }
    const file = new File(['image'], 'Q-01-1-01.png', { type: 'image/png' })
    const result = await mergeImageEntries([bank], [{ bankId: 'bank', file, relativePath: file.name }])
    expect(result.matchedQuestions).toBe(1)
    expect(result.createdQuestions).toBe(0)
  })
})
