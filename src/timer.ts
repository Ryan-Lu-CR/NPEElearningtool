export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended'

export type TimerPauseEvent = {
  at: number
}

export type TimerResumeEvent = {
  at: number
}

export type TimerState = {
  status: TimerStatus
  elapsedMs: number
  startedAt: number | null
  runningAt: number | null
  pauseEvents: TimerPauseEvent[]
  resumeEvents: TimerResumeEvent[]
}

export type TimerHistoryRecord = {
  id: string
  startedAt: number
  endedAt: number
  elapsedMs: number
  pauseEvents: TimerPauseEvent[]
  resumeEvents: TimerResumeEvent[]
}

export type TimerData = {
  current: TimerState
  history: TimerHistoryRecord[]
}

const TIMER_STORAGE_KEY = 'npee:timer:v1'
export const emptyTimerState: TimerState = { status: 'idle', elapsedMs: 0, startedAt: null, runningAt: null, pauseEvents: [], resumeEvents: [] }
export const emptyTimerData: TimerData = { current: emptyTimerState, history: [] }

function isTimerStatus(value: unknown): value is TimerStatus {
  return value === 'idle' || value === 'running' || value === 'paused' || value === 'ended'
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateTimeEvents<T extends TimerPauseEvent | TimerResumeEvent>(value: unknown, startedAt?: number, endedAt?: number): T[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => {
      if (!item || typeof item !== 'object' || !isValidTimestamp((item as TimerPauseEvent).at)) return false
      const at = (item as TimerPauseEvent).at
      return (startedAt === undefined || at >= startedAt) && (endedAt === undefined || at <= endedAt)
    })
    .map(item => ({ at: (item as TimerPauseEvent).at })) as T[]
}

export function validateTimerState(value: unknown): TimerState {
  if (!value || typeof value !== 'object') return { ...emptyTimerState, pauseEvents: [], resumeEvents: [] }
  const candidate = value as Partial<TimerState>
  const requestedStatus = isTimerStatus(candidate.status) ? candidate.status : 'idle'
  const elapsedMs = isValidDuration(candidate.elapsedMs) ? Math.floor(candidate.elapsedMs) : 0
  const hasValidSessionStart = isValidTimestamp(candidate.startedAt)
  const legacyRunningAt = requestedStatus === 'running' && hasValidSessionStart ? candidate.startedAt as number : null
  const runningAt = isValidTimestamp(candidate.runningAt) ? candidate.runningAt : legacyRunningAt
  const status = requestedStatus === 'running' && runningAt === null ? 'idle' : requestedStatus
  const startedAt = status === 'idle' ? null : hasValidSessionStart ? candidate.startedAt as number : status === 'running' ? runningAt : null
  return {
    status,
    elapsedMs,
    startedAt,
    runningAt: status === 'running' ? runningAt : null,
    pauseEvents: validateTimeEvents<TimerPauseEvent>(candidate.pauseEvents, startedAt === null ? undefined : startedAt),
    resumeEvents: validateTimeEvents<TimerResumeEvent>(candidate.resumeEvents, startedAt === null ? undefined : startedAt),
  }
}

function validateHistoryRecord(value: unknown, fallbackIndex: number): TimerHistoryRecord | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TimerHistoryRecord>
  if (!isValidTimestamp(candidate.startedAt) || !isValidTimestamp(candidate.endedAt) || candidate.endedAt < candidate.startedAt) return null
  const pauseEvents = validateTimeEvents<TimerPauseEvent>(candidate.pauseEvents, candidate.startedAt, candidate.endedAt)
  const resumeEvents = validateTimeEvents<TimerResumeEvent>(candidate.resumeEvents, candidate.startedAt, candidate.endedAt)
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `timer-${candidate.startedAt}-${candidate.endedAt}-${fallbackIndex}`
  return {
    id,
    startedAt: candidate.startedAt,
    endedAt: candidate.endedAt,
    elapsedMs: isValidDuration(candidate.elapsedMs) ? Math.floor(candidate.elapsedMs) : 0,
    pauseEvents,
    resumeEvents,
  }
}

export function validateTimerData(value: unknown): TimerData {
  if (!value || typeof value !== 'object') return { current: { ...emptyTimerState, pauseEvents: [], resumeEvents: [] }, history: [] }
  const candidate = value as Partial<TimerData>
  const current = 'current' in candidate ? validateTimerState(candidate.current) : validateTimerState(value)
  const history = Array.isArray(candidate.history)
    ? candidate.history.map((record, index) => validateHistoryRecord(record, index)).filter((record): record is TimerHistoryRecord => record !== null).slice(0, 10)
    : []
  return { current, history }
}

export function loadTimerData(): TimerData {
  try {
    return validateTimerData(JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) || 'null'))
  } catch {
    return { current: { ...emptyTimerState, pauseEvents: [], resumeEvents: [] }, history: [] }
  }
}

export function saveTimerData(data: TimerData): boolean {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(validateTimerData(data)))
    return true
  } catch {
    return false
  }
}

export function loadTimerState(): TimerState {
  return loadTimerData().current
}

export function saveTimerState(state: TimerState): boolean {
  const data = loadTimerData()
  return saveTimerData({ current: state, history: data.history })
}

export function getTimerElapsedMs(state: TimerState, now = Date.now()): number {
  if (state.status !== 'running' || state.runningAt === null) return state.elapsedMs
  return state.elapsedMs + Math.max(0, now - state.runningAt)
}

export function startTimer(state: TimerState, now = Date.now()): TimerState {
  const shouldReset = state.status === 'idle' || state.status === 'ended'
  const isResuming = state.status === 'paused'
  return {
    status: 'running',
    elapsedMs: shouldReset ? 0 : state.elapsedMs,
    startedAt: shouldReset ? now : state.startedAt ?? now,
    runningAt: now,
    pauseEvents: shouldReset ? [] : [...state.pauseEvents],
    resumeEvents: shouldReset ? [] : isResuming ? [...state.resumeEvents, { at: now }] : [...state.resumeEvents],
  }
}

export function pauseTimer(state: TimerState, now = Date.now()): TimerState {
  if (state.status !== 'running') return state
  return { status: 'paused', elapsedMs: getTimerElapsedMs(state, now), startedAt: state.startedAt ?? now, runningAt: null, pauseEvents: [...state.pauseEvents, { at: now }], resumeEvents: [...state.resumeEvents] }
}

export function endTimer(state: TimerState, now = Date.now()): TimerState {
  if (state.status !== 'running' && state.status !== 'paused') return state
  return { status: 'ended', elapsedMs: getTimerElapsedMs(state, now), startedAt: state.startedAt, runningAt: null, pauseEvents: [...state.pauseEvents], resumeEvents: [...state.resumeEvents] }
}

export function finishTimerSession(data: TimerData, now = Date.now()): TimerData {
  const { current } = data
  if ((current.status !== 'running' && current.status !== 'paused') || current.startedAt === null) return data
  const record: TimerHistoryRecord = {
    id: `timer-${current.startedAt}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: current.startedAt,
    endedAt: now,
    elapsedMs: getTimerElapsedMs(current, now),
    pauseEvents: [...current.pauseEvents],
    resumeEvents: [...current.resumeEvents],
  }
  return { current: endTimer(current, now), history: [record, ...data.history].slice(0, 10) }
}

export function resetCurrentTimer(data: TimerData): TimerData {
  return { ...data, current: { ...emptyTimerState, pauseEvents: [] } }
}

export function deleteTimerHistory(data: TimerData, id: string): TimerData {
  return { ...data, history: data.history.filter(record => record.id !== id) }
}
