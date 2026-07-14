import type { Question, QuestionBank, QuestionStatus } from './types'

export interface LearningStats {
  total: number
  marked: number
  unmarked: number
  proficient: number
  vague: number
  wrong: number
  accuracy: number | null
  completion: number
}

export function calculateQuestionStats(questions: Question[], statuses: Record<string, QuestionStatus>): LearningStats {
  const counts = { proficient: 0, vague: 0, wrong: 0 }

  for (const question of questions) {
    const status = statuses[question.id]
    if (status === 'proficient' || status === 'vague' || status === 'wrong') counts[status]++
  }

  const marked = counts.proficient + counts.vague + counts.wrong
  return {
    total: questions.length,
    marked,
    unmarked: questions.length - marked,
    ...counts,
    accuracy: marked ? counts.proficient / marked : null,
    completion: questions.length ? marked / questions.length : 0,
  }
}

export function calculateLearningStats(banks: QuestionBank[], statuses: Record<string, QuestionStatus>): LearningStats {
  return calculateQuestionStats(banks.flatMap(bank => bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions))), statuses)
}

export function formatRate(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
