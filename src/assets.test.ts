import { describe, expect, it } from 'vitest'
import { parseImageFilename, parseStructuredImagePath } from './assets'

const ids = new Set(['question-1', 'math-limit-002'])

describe('parseImageFilename', () => {
  it('解析推荐格式及多图顺序', () => {
    expect(parseImageFilename('q__question-1__2.jpg', ids)).toEqual({ questionId: 'question-1', kind: 'question', order: 2 })
    expect(parseImageFilename('a__question-1__12.png', ids)).toEqual({ questionId: 'question-1', kind: 'answer', order: 12 })
  })

  it('兼容中文和简写命名', () => {
    expect(parseImageFilename('math-limit-002_答案_3.webp', ids)).toEqual({ questionId: 'math-limit-002', kind: 'answer', order: 3 })
    expect(parseImageFilename('question-1.jpg', ids)).toEqual({ questionId: 'question-1', kind: 'question', order: 1 })
  })

  it('安全跳过未知题目和非约定文件名', () => {
    expect(parseImageFilename('a__unknown__1.jpg', ids)).toBeNull()
    expect(parseImageFilename('随手截图.png', ids)).toBeNull()
  })

  it('可处理大批量文件名', () => {
    const results = Array.from({ length: 5000 }, (_, index) => parseImageFilename(`a__question-1__${index + 1}.jpg`, ids))
    expect(results).toHaveLength(5000)
    expect(results[4999]?.order).toBe(5000)
  })
})

describe('parseStructuredImagePath', () => {
  it('识别 Q/A 前缀和点号分片格式', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础.assets/Q-01-1-01.2.png', 'Q-01-1-01.2.png')).toMatchObject({ chapterCode: '01', sectionCode: '1', questionCode: '01', kind: 'question', order: 2 })
    expect(parseStructuredImagePath('01 行列式 1-基础.assets/A-01-1-01.png', 'A-01-1-01.png')).toMatchObject({ kind: 'answer', order: 1 })
  })

  it('识别用户现有的三段数字文件名和 assets 文件夹标题', () => {
    expect(parseStructuredImagePath('题库/01 行列式 1-基础.assets/01-1-01.png', '01-1-01.png')).toEqual({
      chapterCode: '01', chapterName: '行列式', sectionCode: '1', sectionName: '基础', questionCode: '01', kind: 'question', order: 1
    })
  })

  it('识别多张答案图和顺序', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础.assets/01-1-03-A-2.png', '01-1-03-A-2.png')).toMatchObject({ questionCode: '03', kind: 'answer', order: 2 })
  })

  it('没有文件夹标题时生成安全的默认名称', () => {
    expect(parseStructuredImagePath('导入/02-3-08-Q-2.jpg', '02-3-08-Q-2.jpg')).toMatchObject({ chapterName: '第 02 章', sectionName: '第 3 节', kind: 'question', order: 2 })
  })
})
