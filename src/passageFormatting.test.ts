import { describe, expect, it } from 'vitest'
import { formatPassageParagraphs } from './passageFormatting'

describe('formatPassageParagraphs', () => {
  it('保留 PDF 中已识别的真实段落', () => {
    expect(formatPassageParagraphs('First paragraph.\n\nSecond paragraph.')).toEqual(['First paragraph.', 'Second paragraph.'])
  })

  it('在完整句子边界切分超长单段文本', () => {
    const sentence = 'This is a complete sentence with enough words to represent a normal line in an English reading passage.'
    const paragraphs = formatPassageParagraphs(Array.from({ length: 24 }, () => sentence).join(' '))
    expect(paragraphs.length).toBeGreaterThan(2)
    expect(paragraphs.every(paragraph => paragraph.endsWith('.'))).toBe(true)
  })

  it('不在常见英文缩写处错误分段', () => {
    const text = Array.from({ length: 20 }, (_, index) => `Dr. Smith described the U.S. study in complete sentence number ${index + 1}.`).join(' ')
    expect(formatPassageParagraphs(text).join(' ')).toBe(text)
  })
})
