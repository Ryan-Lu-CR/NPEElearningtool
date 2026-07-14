import { orderedQuestionEntriesForBank } from './bankManagement'
import type { QuestionBank, QuestionStatus } from './types'

export interface SavedNavigation {
  bankId: string
  sectionId: string
  questionId: string
  view: 'section' | 'wrong'
}

export interface ResolvedNavigation {
  bankId: string
  chapterId: string
  sectionId: string
  questionIndex: number
  view: 'section' | 'wrong'
}

export function resolveNavigation(
  banks: QuestionBank[],
  statuses: Record<string, QuestionStatus>,
  saved: SavedNavigation | null,
): ResolvedNavigation | null {
  if (!saved) return null
  const bank = banks.find(item => item.id === saved.bankId)
    || banks.find(item => item.chapters.some(chapter => chapter.sections.some(section => section.id === saved.sectionId)))
  if (!bank) return null
  const chapter = bank.chapters.find(item => item.sections.some(section => section.id === saved.sectionId))
  const section = chapter?.sections.find(item => item.id === saved.sectionId)
  if (!chapter || !section) return null
  const questions = saved.view === 'wrong'
    ? orderedQuestionEntriesForBank(bank).map(entry => entry.question).filter(question => statuses[question.id] === 'wrong')
    : section.questions
  return {
    bankId: bank.id,
    chapterId: chapter.id,
    sectionId: section.id,
    questionIndex: Math.max(0, questions.findIndex(question => question.id === saved.questionId)),
    view: saved.view,
  }
}
