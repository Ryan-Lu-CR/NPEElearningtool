import type { QuestionStatus, ReadingQuestionType, Subject } from './types'

export type StudyActivitySource = 'study' | 'wrong-book' | 'dashboard' | 'bulk-clear'

export interface QuestionReviewEvent {
  status: Exclude<QuestionStatus, 'none'>
  previousStatus: QuestionStatus
  reviewedAt: string
}

export interface StudyActivity {
  /** Version 2 records contain a daily mastery transition and collection context. */
  schemaVersion?: 2
  date: string
  questionId: string
  bankId: string
  /** Final mastery status for this question on this local calendar day. */
  status: QuestionStatus
  /** Mastery status immediately before the first change recorded on this day. */
  initialStatus?: QuestionStatus
  firstUpdatedAt?: string
  updatedAt: string
  /** Number of actual status transitions made during this day, without storing every click. */
  changeCount?: number
  chapterId?: string
  sectionId?: string
  questionNumber?: number
  questionType?: string
  readingType?: ReadingQuestionType
  subject?: Subject
  source?: StudyActivitySource
  answerRevealed?: boolean
  /** Explicit review attempts remain independent from the once-per-day activity summary. */
  reviews?: QuestionReviewEvent[]
}

export type StudyActivityUpdate = Pick<StudyActivity, 'questionId' | 'bankId' | 'status'>
  & Partial<Pick<StudyActivity, 'chapterId' | 'sectionId' | 'questionNumber' | 'questionType' | 'readingType' | 'subject' | 'source' | 'answerRevealed'>>
  & { previousStatus?: QuestionStatus }

export interface ActivityOutcomeStats {
  total: number
  proficient: number
  vague: number
  wrong: number
  accuracy: number | null
}

export interface DailyActivityStats extends ActivityOutcomeStats {
  newQuestions: number
  reviewQuestions: number
  newStats: ActivityOutcomeStats
  reviewStats: ActivityOutcomeStats
}

const readingTypes = new Set<ReadingQuestionType>(['detail', 'example', 'main-idea', 'attitude', 'inference', 'vocabulary'])

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
    return (activity.schemaVersion === undefined || activity.schemaVersion === 2)
      && /^\d{4}-\d{2}-\d{2}$/.test(activity.date || '')
      && typeof activity.questionId === 'string'
      && typeof activity.bankId === 'string'
      && typeof activity.updatedAt === 'string'
      && (activity.status === 'none' || activity.status === 'proficient' || activity.status === 'vague' || activity.status === 'wrong')
      && (activity.initialStatus === undefined || activity.initialStatus === 'none' || activity.initialStatus === 'proficient' || activity.initialStatus === 'vague' || activity.initialStatus === 'wrong')
      && (activity.firstUpdatedAt === undefined || typeof activity.firstUpdatedAt === 'string')
      && (activity.changeCount === undefined || Number.isInteger(activity.changeCount) && activity.changeCount >= 0)
      && (activity.chapterId === undefined || typeof activity.chapterId === 'string')
      && (activity.sectionId === undefined || typeof activity.sectionId === 'string')
      && (activity.questionNumber === undefined || Number.isFinite(activity.questionNumber))
      && (activity.questionType === undefined || typeof activity.questionType === 'string')
      && (activity.readingType === undefined || readingTypes.has(activity.readingType))
      && (activity.subject === undefined || activity.subject === 'math' || activity.subject === 'english' || activity.subject === 'professional')
      && (activity.source === undefined || activity.source === 'study' || activity.source === 'wrong-book' || activity.source === 'dashboard' || activity.source === 'bulk-clear')
      && (activity.answerRevealed === undefined || typeof activity.answerRevealed === 'boolean')
      && (activity.reviews === undefined || Array.isArray(activity.reviews) && activity.reviews.every(review => review
        && (review.status === 'proficient' || review.status === 'vague' || review.status === 'wrong')
        && (review.previousStatus === 'none' || review.previousStatus === 'proficient' || review.previousStatus === 'vague' || review.previousStatus === 'wrong')
        && typeof review.reviewedAt === 'string'
        && !Number.isNaN(Date.parse(review.reviewedAt))))
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
  entry: StudyActivityUpdate,
  now = new Date(),
) {
  const date = localDateKey(now)
  const existing = activities.find(item => item.date === date && item.questionId === entry.questionId)
  const previousDayStatus = [...activities]
    .filter(item => item.questionId === entry.questionId && item.date < date)
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt))[0]?.status
  const initialStatus = existing?.initialStatus
    ?? (existing ? previousDayStatus ?? entry.previousStatus ?? 'none' : entry.previousStatus ?? previousDayStatus ?? 'none')
  const statusBeforeUpdate = existing?.status ?? entry.previousStatus ?? previousDayStatus ?? 'none'
  const existingChangeCount = existing?.changeCount
    ?? (existing && existing.status !== initialStatus ? 1 : 0)
  const updatedAt = now.toISOString()
  const remaining = activities.filter(item => item.date !== date || item.questionId !== entry.questionId)
  const record: StudyActivity = {
    ...existing,
    ...entry,
    schemaVersion: 2,
    date,
    initialStatus,
    firstUpdatedAt: existing?.firstUpdatedAt || existing?.updatedAt || updatedAt,
    updatedAt,
    changeCount: existingChangeCount + (statusBeforeUpdate === entry.status ? 0 : 1),
  }
  delete (record as StudyActivity & { previousStatus?: QuestionStatus }).previousStatus
  return [...remaining, record]
}

function activityKey(activity: StudyActivity) {
  return `${activity.bankId}\u0000${activity.questionId}`
}

function hasReviewOnDate(activity: StudyActivity, date: string) {
  return activity.reviews?.some(review => localDateKey(new Date(review.reviewedAt)) === date) || false
}

export function calculateDailyActivity(activities: StudyActivity[], allActivities = activities): DailyActivityStats {
  const summarize = (items: StudyActivity[]): ActivityOutcomeStats => {
    const proficient = items.filter(item => item.status === 'proficient').length
    const vague = items.filter(item => item.status === 'vague').length
    const wrong = items.filter(item => item.status === 'wrong').length
    const total = proficient + vague + wrong
    return { total, proficient, vague, wrong, accuracy: total ? proficient / total : null }
  }
  const overallStats = summarize(activities)
  const firstActivityDate = new Map<string, string>()
  allActivities.filter(item => item.status !== 'none').forEach(item => {
    const key = activityKey(item)
    const previousDate = firstActivityDate.get(key)
    if (!previousDate || item.date < previousDate) firstActivityDate.set(key, item.date)
  })
  const newActivities: StudyActivity[] = []
  const reviewActivities: StudyActivity[] = []
  activities.filter(item => item.status !== 'none').forEach(item => {
    const key = activityKey(item)
    const isNewQuestion = firstActivityDate.get(key) === item.date && !hasReviewOnDate(item, item.date)
    if (isNewQuestion) newActivities.push(item)
    else reviewActivities.push(item)
  })
  const newStats = summarize(newActivities)
  const reviewStats = summarize(reviewActivities)
  return {
    ...overallStats,
    newQuestions: newStats.total,
    reviewQuestions: reviewStats.total,
    newStats,
    reviewStats,
  }
}
