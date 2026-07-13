import type { QuestionBank, QuestionStatus } from './types'

export function questionIdsForBank(bank: QuestionBank) {
  return new Set(bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions.map(question => question.id))))
}

export function orderedQuestionEntriesForBank(bank: QuestionBank) {
  return bank.chapters.flatMap((chapter, chapterIndex) => chapter.sections.flatMap(section => [...section.questions]
    .sort((left, right) => left.number - right.number)
    .map(question => ({ question, chapterId: chapter.id, chapterName: chapter.name, chapterIndex, sectionId: section.id, sectionName: section.name }))))
}

export function assetKeysForBank(bank: QuestionBank) {
  return bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions.flatMap(question => [...(question.imageKeys || []), ...(question.answerImageKeys || [])])))
}

export function clearQuestionStatuses(
  statuses: Record<string, QuestionStatus>,
  banks: QuestionBank[],
  bankId: string | 'all',
  status: QuestionStatus | 'all'
) {
  const targetIds = bankId === 'all'
    ? new Set(banks.flatMap(bank => [...questionIdsForBank(bank)]))
    : questionIdsForBank(banks.find(bank => bank.id === bankId) || { id: '', name: '', source: 'local', chapters: [] })
  return Object.fromEntries(Object.entries(statuses).filter(([questionId, value]) => !targetIds.has(questionId) || (status !== 'all' && value !== status)))
}

export function removeBank(banks: QuestionBank[], bankId: string) { return banks.filter(bank => bank.id !== bankId) }

export function resetBankData(banks: QuestionBank[], bankId: string, baseline?: QuestionBank) {
  return banks.map(bank => bank.id !== bankId ? bank : baseline ? structuredClone(baseline) : { ...bank, chapters: [] })
}
