import { parseExamDateValue } from './examCountdown'

const SETTINGS_KEY = 'npee:settings:v1'
const LEGACY_EXAM_DATE_KEY = 'npee:exam-date:v1'

export interface UserSettings {
  examDate?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateUserSettings(value: unknown): UserSettings {
  if (!isRecord(value)) return {}
  const examDate = typeof value.examDate === 'string' && parseExamDateValue(value.examDate) ? value.examDate : undefined
  return examDate ? { examDate } : {}
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
  } catch { return {} }
}
