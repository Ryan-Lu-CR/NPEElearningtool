import { describe, expect, it } from 'vitest'
import payload from './englishBanks.json'
import type { QuestionBank } from './types'

describe('English Part B bank data', () => {
  const banks = payload.banks as unknown as QuestionBank[]
  const sections = banks.flatMap(bank => bank.chapters.flatMap(chapter => chapter.sections.map(section => ({ bank, section })))).filter(({ section }) => section.questions.some(question => question.type === '阅读理解 Part B'))

  it('does not append the source passage to a short option bank', () => {
    sections.forEach(({ section }) => {
      const options = section.questions[0].options || []
      const firstSixLongest = Math.max(...options.slice(0, 6).map(option => option.length))
      if (firstSixLongest < 120) expect(options[6]?.length).toBeLessThan(180)
    })
  })

  it('keeps shared options and answers consistent', () => {
    sections.forEach(({ section }) => {
      const shared = section.questions[0].options
      section.questions.forEach(question => {
        expect(question.options).toEqual(shared)
        const letter = question.answer[0]
        expect(question.answer).toBe(shared?.[letter.charCodeAt(0) - 65])
      })
    })
  })

  it('does not attach fallback crops from earlier questions', () => {
    sections.forEach(({ section }) => section.questions.forEach(question => {
      if (!question.answerImageUrl) return
      const match = question.answerImageUrl.match(/-(\d{2})\.webp$/)
      expect(Number(match?.[1])).toBeGreaterThanOrEqual(41)
    }))
  })

  it('uses the real Part B subtype for every year that has Part B', () => {
    const expected = new Map<number, string>([
      ...[2005, 2006, 2008, 2009, 2012, 2013, 2015, 2021].map(year => [year, 'sentence'] as const),
      ...[2010, 2011, 2014, 2017, 2018, 2019, 2023].map(year => [year, 'ordering'] as const),
      ...[2007, 2016, 2020, 2022].map(year => [year, 'subheading'] as const),
      [2024, 'viewpoint'],
    ])
    sections.forEach(({ bank, section }) => {
      const year = Number(bank.id.split('-')[1])
      expect(section.partBKind).toBe(expected.get(year))
    })
    expect(sections.some(({ bank }) => bank.id === 'english-2004')).toBe(false)
  })

  it('keeps ordering frames separate from option text and does not invent a source article', () => {
    sections.filter(({ section }) => section.partBKind === 'ordering').forEach(({ section }) => {
      expect(section.passage).toBeUndefined()
      expect(section.partBSequence).toMatch(/41.*45/)
      section.questions[0].options?.forEach(option => expect(option).not.toMatch(/41\.?\s*→.*45/))
    })
  })

  it('has a valid source for source-based Part B formats', () => {
    sections.filter(({ section }) => section.partBKind !== 'ordering').forEach(({ section }) => {
      expect(Boolean(section.passage?.length || section.passageImageUrls?.length)).toBe(true)
      expect(section.passage || '').not.toContain('Underlined segment (50)')
    })
  })

  it('includes all eight 2023 ordering paragraphs, including fixed paragraph H', () => {
    const section = sections.find(({ bank }) => bank.id === 'english-2023')?.section
    expect(section?.questions[0].options).toHaveLength(8)
    expect(section?.questions[0].options?.[7]).toMatch(/^H\./)
  })
})
