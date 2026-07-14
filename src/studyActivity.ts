import type { QuestionStatus } from './types'

export type MarkedQuestionStatus = Exclude<QuestionStatus, 'none'>

export interface StudyActivity {
  date: string
  questionId: string
  bankId: string
  status: MarkedQuestionStatus
  updatedAt: string
}

export interface DailyActivityStats {
  total: number
  proficient: number
  vague: number
  wrong: number
  accuracy: number | null
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validateStudyActivities(value: unknown): StudyActivity[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is StudyActivity => {
    if (!item || typeof item !== 'object') return false
    const activity = item as Partial<StudyActivity>
    return /^\d{4}-\d{2}-\d{2}$/.test(activity.date || '')
      && typeof activity.questionId === 'string'
      && typeof activity.bankId === 'string'
      && typeof activity.updatedAt === 'string'
      && (activity.status === 'proficient' || activity.status === 'vague' || activity.status === 'wrong')
  })
}

export function mergeStudyActivities(...groups: StudyActivity[][]) {
  const merged = new Map<string, StudyActivity>()
  groups.flat().forEach(item => {
    const key = `${item.date}\u0000${item.questionId}`
    const previous = merged.get(key)
    if (!previous || item.updatedAt >= previous.updatedAt) merged.set(key, item)
  })
  return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt))
}

export function updateStudyActivity(
  activities: StudyActivity[],
  entry: { questionId: string; bankId: string; status: QuestionStatus },
  now = new Date(),
) {
  const date = localDateKey(now)
  const remaining = activities.filter(item => item.date !== date || item.questionId !== entry.questionId)
  if (entry.status === 'none') return remaining
  return [...remaining, { ...entry, status: entry.status, date, updatedAt: now.toISOString() }]
}

export function calculateDailyActivity(activities: StudyActivity[]): DailyActivityStats {
  const proficient = activities.filter(item => item.status === 'proficient').length
  const vague = activities.filter(item => item.status === 'vague').length
  const wrong = activities.filter(item => item.status === 'wrong').length
  const total = proficient + vague + wrong
  return { total, proficient, vague, wrong, accuracy: total ? proficient / total : null }
}
