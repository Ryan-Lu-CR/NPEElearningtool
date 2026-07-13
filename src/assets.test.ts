import { describe, expect, it } from 'vitest'
import { parseImageFilename } from './assets'

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
