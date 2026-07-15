import { describe, expect, it } from 'vitest'
import payload from '../默认题库/题库数据.json'
import type { QuestionBank } from './types'

describe('English exam bank data', () => {
  const banks = (payload.banks as unknown as QuestionBank[]).filter(bank => bank.id.startsWith('english-'))
  const bank = banks[0]
  const sections = bank.chapters.flatMap(chapter => chapter.sections.map(section => ({ chapter, section }))).filter(({ section }) => section.questions.some(question => question.type === '阅读理解 Part B'))
  const yearOf = (chapter: QuestionBank['chapters'][number]) => Number(chapter.id.split('-').at(-1))

  it('uses one bank with one chapter per exam year', () => {
    expect(banks).toHaveLength(1)
    expect(bank.id).toBe('english-exams')
    expect(bank.name).toBe('英语一真题')
    expect(bank.chapters).toHaveLength(23)
    expect(bank.chapters.map(chapter => chapter.id)).toEqual(Array.from({ length: 23 }, (_, index) => `english-exams-${2004 + index}`))
    bank.chapters.forEach(chapter => expect(chapter.sections.length).toBeGreaterThanOrEqual(6))
  })

  it('stores every English resource under the shared default bank folder', () => {
    const resources = bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => [
      ...(section.passageImageUrls || []),
      ...section.questions.flatMap(question => [question.imageUrl, question.answerImageUrl].filter((url): url is string => Boolean(url)))
    ]))
    expect(new Set(resources).size).toBeGreaterThanOrEqual(504)
    resources.forEach(url => {
      expect(url).toMatch(/^\/api\/default-workspace\/file\?path=/)
      const relative = new URL(url, 'http://localhost').searchParams.get('path') || ''
      expect(relative.startsWith('英语一真题/')).toBe(true)
    })
  })

  it('keeps original answer analysis images for every supplied analysis PDF', () => {
    bank.chapters.filter(chapter => yearOf(chapter) <= 2025).forEach(chapter => {
      chapter.sections.flatMap(section => section.questions).forEach(question => {
        expect(question.answerImageUrl || question.answerImageKeys?.length).toBeTruthy()
      })
    })
  })

  it('uses per-question analysis crops for 2005-2009 standard reading questions', () => {
    bank.chapters.filter(chapter => {
      const year = yearOf(chapter)
      return year >= 2005 && year <= 2009
    }).forEach(chapter => {
      chapter.sections.flatMap(section => section.questions).filter(question =>
        (question.number >= 21 && question.number <= 40) || (question.number >= 46 && question.number <= 50)
      ).forEach(question => {
        expect(question.answerImageUrl).toContain(`q${String(question.number).padStart(2, '0')}.webp`)
      })
    })
  })

  it('uses complete per-question PDF crops for 2010-2024', () => {
    bank.chapters.filter(chapter => {
      const year = yearOf(chapter)
      return year >= 2010 && year <= 2024
    }).forEach(chapter => {
      const year = yearOf(chapter)
      const questions = chapter.sections.flatMap(section => section.questions)
      const independent = questions.filter(question =>
        (question.number >= 1 && question.number <= 40) ||
        (question.number >= 46 && question.number <= 50)
      )
      expect(independent).toHaveLength(45)
      expect(new Set(independent.map(question => question.answerImageUrl))).toHaveLength(45)
      independent.forEach(question => {
        expect(question.answerImageUrl).toContain(`analysis-${year}-q${String(question.number).padStart(2, '0')}.webp`)
      })
    })
  })

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
      if (match) expect(Number(match[1])).toBeGreaterThanOrEqual(41)
    }))
  })

  it('uses the real Part B subtype for every year that has Part B', () => {
    const expected = new Map<number, string>([
      ...[2005, 2006, 2008, 2009, 2012, 2013, 2015, 2021].map(year => [year, 'sentence'] as const),
      ...[2010, 2011, 2014, 2017, 2018, 2019, 2023, 2025, 2026].map(year => [year, 'ordering'] as const),
      ...[2007, 2016, 2020, 2022].map(year => [year, 'subheading'] as const),
      [2024, 'viewpoint'],
    ])
    sections.forEach(({ chapter, section }) => expect(section.partBKind).toBe(expected.get(yearOf(chapter))))
    expect(sections.some(({ chapter }) => yearOf(chapter) === 2004)).toBe(false)
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

  it('includes all eight ordering paragraphs in years with fixed paragraphs', () => {
    for (const year of [2023, 2025, 2026]) {
      const section = sections.find(({ chapter }) => yearOf(chapter) === year)?.section
      expect(section?.questions[0].options).toHaveLength(8)
      expect(section?.questions[0].options?.[7]).toMatch(/^H\./)
    }
  })
})
