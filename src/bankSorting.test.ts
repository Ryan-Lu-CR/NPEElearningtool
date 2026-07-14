import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { sortBanksForDisplay } from './bankSorting'

const bank = (id: string, name: string): QuestionBank => ({
  id,
  name,
  source: 'local',
  chapters: [],
})

describe('sortBanksForDisplay', () => {
  it('uses natural numeric order and keeps related series together', () => {
    const input = [
      bank('880-linear', '880线代'),
      bank('basic-linear', '27基础30讲线代'),
      bank('1000-advanced', '27版1000题数二强化篇'),
      bank('basic-calculus', '27基础30讲高数'),
      bank('1000-basic', '27版1000题数二基础篇'),
      bank('880-calculus', '880高数'),
    ]

    expect(sortBanksForDisplay(input).map(item => item.name)).toEqual([
      '27版1000题数二基础篇',
      '27版1000题数二强化篇',
      '27基础30讲高数',
      '27基础30讲线代',
      '880高数',
      '880线代',
    ])
  })

  it('does not mutate the stored bank order', () => {
    const input = [bank('later', '2026年考研英语一真题'), bank('earlier', '2004年考研英语真题')]

    sortBanksForDisplay(input)

    expect(input.map(item => item.id)).toEqual(['later', 'earlier'])
  })
})
