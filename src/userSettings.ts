import { parseExamDateValue } from './examCountdown'

const SETTINGS_KEY = 'npee:settings:v1'
const LEGACY_EXAM_DATE_KEY = 'npee:exam-date:v1'

export interface UserSettings {
  examDate?: string
  activeRound: number
  roundCount: number
}

export const DEFAULT_USER_SETTINGS: UserSettings = { activeRound: 1, roundCount: 5 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateUserSettings(value: unknown): UserSettings {
  if (!isRecord(value)) return { ...DEFAULT_USER_SETTINGS }
  const examDate = typeof value.examDate === 'string' && parseExamDateValue(value.examDate) ? value.examDate : undefined
  const requestedRound = Number.isInteger(value.activeRound) && Number(value.activeRound) > 0 ? Math.min(99, Number(value.activeRound)) : 1
  const requestedCount = Number.isInteger(value.roundCount) && Number(value.roundCount) > 0 ? Math.min(99, Number(value.roundCount)) : 5
  const roundCount = Math.max(5, requestedRound, requestedCount)
  return { ...(examDate ? { examDate } : {}), activeRound: requestedRound, roundCount }
}

export function saveUserSettings(settings: UserSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(validateUserSettings(settings))); return true } catch { return false }
}

export function loadUserSettings(): UserSettings {
  try {
    const stored = validateUserSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))
    if (stored.examDate) return stored
    const legacyExamDate = localStorage.getItem(LEGACY_EXAM_DATE_KEY)
    if (!legacyExamDate || !parseExamDateValue(legacyExamDate)) return stored
    const migrated = { ...stored, examDate: legacyExamDate }
    saveUserSettings(migrated)
    localStorage.removeItem(LEGACY_EXAM_DATE_KEY)
    return migrated
  } catch { return { ...DEFAULT_USER_SETTINGS } }
}
