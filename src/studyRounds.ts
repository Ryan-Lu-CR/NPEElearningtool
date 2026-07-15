import { loadStatuses, loadStudyActivities, validateStatuses } from './store'
import { validateStudyActivities, type StudyActivity } from './studyActivity'
import type { QuestionStatus } from './types'

const ROUNDS_KEY = 'npee:rounds:v1'
const LEGACY_STATUS_KEY = 'npee:status:v1'
const LEGACY_ACTIVITY_KEY = 'npee:activity:v1'

export interface StudyRoundData {
  statuses: Record<string, QuestionStatus>
  activities: StudyActivity[]
}

export type StudyRounds = Record<string, StudyRoundData>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyStudyRound(): StudyRoundData {
  return { statuses: {}, activities: [] }
}

export function validateStudyRounds(value: unknown, legacyStatuses: unknown = {}, legacyActivities: unknown = []): StudyRounds {
  const rounds: StudyRounds = {}
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const round = Number(key)
      if (!Number.isInteger(round) || round < 1 || round > 99 || !isRecord(item)) continue
      rounds[String(round)] = {
        statuses: validateStatuses(item.statuses),
        activities: validateStudyActivities(item.activities),
      }
    }
  }
  if (!rounds['1']) {
    rounds['1'] = {
      statuses: validateStatuses(legacyStatuses),
      activities: validateStudyActivities(legacyActivities),
    }
  }
  return rounds
}

export function getStudyRound(rounds: StudyRounds, round: number): StudyRoundData {
  return rounds[String(round)] || emptyStudyRound()
}

export function updateStudyRound(rounds: StudyRounds, round: number, statuses: Record<string, QuestionStatus>, activities: StudyActivity[]): StudyRounds {
  return { ...rounds, [String(round)]: { statuses, activities } }
}

export function saveStudyRounds(rounds: StudyRounds) {
  try { localStorage.setItem(ROUNDS_KEY, JSON.stringify(validateStudyRounds(rounds))); return true } catch { return false }
}

export function loadStudyRounds(): StudyRounds {
  try {
    const stored = localStorage.getItem(ROUNDS_KEY)
    if (stored) return validateStudyRounds(JSON.parse(stored))
    const migrated = validateStudyRounds(null, loadStatuses(), loadStudyActivities())
    if (saveStudyRounds(migrated)) {
      localStorage.removeItem(LEGACY_STATUS_KEY)
      localStorage.removeItem(LEGACY_ACTIVITY_KEY)
    }
    return migrated
  } catch {
    return validateStudyRounds(null, loadStatuses(), loadStudyActivities())
  }
}

export function countMarkedQuestions(round: StudyRoundData) {
  return Object.values(round.statuses).filter(status => status !== 'none').length
}
