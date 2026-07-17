import { describe, expect, it } from 'vitest'
import payload from '../默认题库/题库数据.json'
import { englishSectionLabel, groupEnglishSections } from './englishNavigation'
import type { QuestionBank } from './types'

describe('English section navigation', () => {
  const bank = (payload.banks as unknown as QuestionBank[]).find(item => item.id === 'english-exams')!
  const chapter2005 = bank.chapters.find(chapter => chapter.id === 'english-exams-2005')!

  it('groups a yearly English exam into its three original Sections', () => {
    const groups = groupEnglishSections(chapter2005.sections)
    expect(groups.map(group => group.label)).toEqual(['Section I 完形填空', 'Section II 阅读理解', 'Section III 写作'])
    expect(groups.map(group => group.sections.length)).toEqual([1, 6, 2])
    expect(groups.flatMap(group => group.sections).map(section => section.id)).toEqual(chapter2005.sections.map(section => section.id))
  })

  it('removes the redundant Section I prefix from its only child', () => {
    const group = groupEnglishSections(chapter2005.sections)[0]
    expect(englishSectionLabel(group.sections[0], group.key)).toBe('Use of English')
  })
})
