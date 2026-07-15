const DAY_MS = 24 * 60 * 60 * 1000

export interface ExamCountdown {
  cohortYear: number
  target: Date
  days: number
}

export function estimatedExamDate(year: number) {
  const first = new Date(year, 11, 1)
  const firstSaturday = 1 + (6 - first.getDay() + 7) % 7
  return new Date(year, 11, firstSaturday + 14)
}

export function formatExamDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseExamDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatExamDateValue(date) === value ? date : null
}

export function getExamCountdown(now = new Date(), customTarget: Date | null = null): ExamCountdown {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let target = customTarget ? new Date(customTarget.getFullYear(), customTarget.getMonth(), customTarget.getDate()) : estimatedExamDate(today.getFullYear())
  if (!customTarget && today > target) target = estimatedExamDate(today.getFullYear() + 1)
  return { cohortYear: target.getFullYear() + 1, target, days: Math.max(0, Math.ceil((target.getTime() - today.getTime()) / DAY_MS)) }
}
