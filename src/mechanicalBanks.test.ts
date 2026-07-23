import { describe, expect, it } from 'vitest'
import manifest from '../默认题库/题库数据.json'
import type { QuestionBank } from './types'
import { bankSubject } from './subjects'

const mechanicalBankIds = new Set([
  'default-mechanical-theory-lecture-exercises',
  'default-mechanical-design-lecture-exercises',
  'default-mechanical-theory-basic-450',
  'default-mechanical-theory-intensive-220',
  'default-mechanical-design-basic-600',
  'default-mechanical-design-pass-680',
  'default-mechanical-design-intensive-notes',
])

const mechanicalBanks = (manifest.banks as unknown as QuestionBank[]).filter(bank => mechanicalBankIds.has(bank.id))

describe('mechanical professional banks', () => {
  it('includes all seven repaired books in the professional subject', () => {
    expect(mechanicalBanks).toHaveLength(7)
    expect(mechanicalBanks.map(bank => bank.name)).toEqual([
      '机械原理-讲义课后习题',
      '机械设计-讲义课后习题',
      '机械原理-基础过关450题',
      '机械原理-强化冲关220题',
      '机械设计-基础过关600题',
      '机械设计-考研通关680题',
      '机械设计-强化班补充讲义',
    ])
    expect(mechanicalBanks.every(bank => bank.subject === 'professional')).toBe(true)
    expect(mechanicalBanks.every(bank => bankSubject(bank) === 'professional')).toBe(true)
  })

  it('keeps every question backed by at least one full-width source image', () => {
    const questions = mechanicalBanks.flatMap(bank => bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions)))
    expect(questions).toHaveLength(2414)
    expect(questions.every(question => question.imageKeys?.length)).toBe(true)
    expect(questions.every(question => question.answerImageKeys?.length)).toBe(true)
    expect(new Set(questions.map(question => question.id)).size).toBe(questions.length)
  })
})
