import type { QuestionStatus } from './types'
import { localDateKey, updateStudyActivity, type QuestionReviewEvent, type StudyActivity, type StudyActivityUpdate } from './studyActivity'

export interface QuestionReviewMark {
  date: string
  markedAt: string
  status: QuestionStatus
}

export interface QuestionReviewEntry extends QuestionReviewMark {
  attempt: number
  daysAfterFirst: number
  daysAfterPrevious: number
}

export interface QuestionReviewTimeline {
  initialMark: QuestionReviewMark | null
  reviews: QuestionReviewEntry[]
}

function utcDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function daysBetween(left: string, right: string) {
  return Math.round((utcDay(right) - utcDay(left)) / 86_400_000)
}

function reviewEvents(activities: StudyActivity[], questionId: string) {
  return activities
    .filter(item => item.questionId === questionId)
    .flatMap(item => (item.reviews || []).map(review => ({ ...review, date: localDateKey(new Date(review.reviewedAt)) })))
    .sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
}

function activityMarkedAt(activity: StudyActivity) {
  return activity.firstUpdatedAt !== undefined ? activity.firstUpdatedAt : activity.updatedAt
}

export function buildQuestionReviewTimeline(activities: StudyActivity[], questionId: string): QuestionReviewTimeline {
  const questionActivities = activities
    .filter(item => item.questionId === questionId)
    .sort((left, right) => left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt))
  const explicitReviews = reviewEvents(activities, questionId)
  const records = questionActivities.filter(item => item.status !== 'none')
  if (!records.length && !explicitReviews.length) return { initialMark: null, reviews: [] }

  const firstRecord = records[0] || questionActivities.find(item => item.reviews?.length)
  if (!firstRecord) return { initialMark: null, reviews: [] }
  const hasLegacyBaseline = Boolean(firstRecord.initialStatus && firstRecord.initialStatus !== 'none')
  const firstExplicit = explicitReviews[0]
  const initialStatus = hasLegacyBaseline
    ? firstRecord.initialStatus as QuestionStatus
    : firstExplicit?.date === firstRecord.date ? firstExplicit.previousStatus : firstRecord.status
  const initialMark: QuestionReviewMark = {
    date: firstRecord.date,
    markedAt: hasLegacyBaseline ? '' : activityMarkedAt(firstRecord),
    status: initialStatus,
  }

  const inferredRecords = (hasLegacyBaseline ? records : records.slice(1))
    .filter(item => !firstExplicit || item.date < firstExplicit.date)
    .map(item => ({ date: item.date, markedAt: activityMarkedAt(item), status: item.status }))
  const reviewMarks: QuestionReviewMark[] = [
    ...inferredRecords,
    ...explicitReviews.map(item => ({ date: item.date, markedAt: item.reviewedAt, status: item.status })),
  ].sort((left, right) => left.markedAt.localeCompare(right.markedAt))

  return {
    initialMark,
    reviews: reviewMarks.map((item, index) => ({
      ...item,
      attempt: index + 1,
      daysAfterFirst: daysBetween(initialMark.date, item.date),
      daysAfterPrevious: daysBetween(index ? reviewMarks[index - 1].date : initialMark.date, item.date),
    })),
  }
}

export function updateQuestionReview(
  activities: StudyActivity[],
  entry: Omit<StudyActivityUpdate, 'status'>,
  selectedStatus: QuestionStatus,
  now = new Date(),
) {
  const today = localDateKey(now)
  const reviewedAt = now.toISOString()
  const latestActivity = [...activities]
    .filter(item => item.questionId === entry.questionId)
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt))[0]
  const currentStatus = latestActivity?.status ?? entry.previousStatus ?? 'none'
  const allReviews = activities
    .flatMap(item => (item.reviews || []).map(review => ({ activity: item, review })))
    .filter(item => item.activity.questionId === entry.questionId)
    .sort((left, right) => right.review.reviewedAt.localeCompare(left.review.reviewedAt))
  const latestReview = allReviews[0]
  const latestIsToday = latestReview && localDateKey(new Date(latestReview.review.reviewedAt)) === today

  if (latestIsToday) {
    const nextStatus = selectedStatus === 'none' ? latestReview.review.previousStatus : selectedStatus
    return {
      status: nextStatus,
      activities: activities.map(item => item === latestReview.activity ? {
        ...item,
        status: nextStatus,
        updatedAt: reviewedAt,
        reviews: selectedStatus === 'none'
          ? (item.reviews || []).filter(review => review !== latestReview.review)
          : (item.reviews || []).map(review => review === latestReview.review ? { ...review, status: selectedStatus, reviewedAt } : review),
      } : item),
    }
  }

  if (selectedStatus === 'none') return { status: currentStatus, activities }
  const baseActivities = updateStudyActivity(activities, { ...entry, status: selectedStatus, previousStatus: currentStatus }, now)
  const event: QuestionReviewEvent = { status: selectedStatus, previousStatus: currentStatus, reviewedAt }
  return {
    status: selectedStatus,
    activities: baseActivities.map(item => item.questionId === entry.questionId && item.date === today
      ? { ...item, reviews: [...(item.reviews || []), event] }
      : item),
  }
}

export function resetQuestionReview(activities: StudyActivity[], questionId: string) {
  const timeline = buildQuestionReviewTimeline(activities, questionId)
  if (!timeline.initialMark || !timeline.reviews.length) {
    return { status: timeline.initialMark?.status || 'none' as QuestionStatus, activities, reset: false }
  }

  const questionActivities = activities
    .filter(item => item.questionId === questionId)
    .sort((left, right) => left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt))
  const baselineActivity = questionActivities.find(item => item.date === timeline.initialMark?.date)
  if (!baselineActivity) return { status: timeline.initialMark.status, activities, reset: false }

  // A legacy activity may carry the initial status on the same record as the
  // first review. Normalize that record so removing reviews does not make the
  // activity reappear as a review the next time the timeline is built.
  const { initialStatus: _initialStatus, reviews: _reviews, ...baselineFields } = baselineActivity
  const retainedBaseline: StudyActivity = {
    ...baselineFields,
    status: timeline.initialMark.status,
    firstUpdatedAt: timeline.initialMark.markedAt,
    changeCount: 0,
  }

  let retainedBaselineAdded = false
  const nextActivities = activities
    .filter(item => {
      if (item.questionId !== questionId) return true
      if (item.date < timeline.initialMark!.date) return true
      if (item !== baselineActivity || retainedBaselineAdded) return false
      retainedBaselineAdded = true
      return true
    })
    .map(item => item === baselineActivity ? retainedBaseline : item)

  return { status: timeline.initialMark.status, activities: nextActivities, reset: true }
}
