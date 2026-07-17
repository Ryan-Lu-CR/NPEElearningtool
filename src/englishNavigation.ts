import type { Section } from './types'

export type EnglishSectionGroupKey = 'section-i' | 'section-ii' | 'section-iii'

export interface EnglishSectionGroup {
  key: EnglishSectionGroupKey
  label: string
  sections: Section[]
}

const groupMeta: Array<{ key: EnglishSectionGroupKey; label: string }> = [
  { key: 'section-i', label: 'Section I 完形填空' },
  { key: 'section-ii', label: 'Section II 阅读理解' },
  { key: 'section-iii', label: 'Section III 写作' },
]

function sectionGroupKey(section: Section): EnglishSectionGroupKey {
  const name = section.name
  const types = new Set(section.questions.map(question => question.type))
  if (/^Section I\b/i.test(name) || types.has('完形填空')) return 'section-i'
  if (/写作|应用文|短文写作/i.test(name) || types.has('写作') || types.has('应用文写作') || types.has('短文写作')) return 'section-iii'
  return 'section-ii'
}

export function groupEnglishSections(sections: Section[]): EnglishSectionGroup[] {
  return groupMeta.map(meta => ({
    ...meta,
    sections: sections.filter(section => sectionGroupKey(section) === meta.key),
  })).filter(group => group.sections.length)
}

export function englishSectionLabel(section: Section, groupKey: EnglishSectionGroupKey) {
  if (groupKey === 'section-i') return section.name.replace(/^Section I\s*/i, '') || section.name
  return section.name
}
