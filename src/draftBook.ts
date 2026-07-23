const DRAFT_BOOK_KEY = 'npee:draft-book:v1'

export interface DraftBookPoint {
  x: number
  y: number
}

export interface DraftStroke {
  color: string
  points: DraftBookPoint[]
}

export interface DraftBookView {
  x: number
  y: number
  zoom: number
}

export interface DraftBookSize {
  width: number
  height: number
}

export interface DraftBookData {
  strokes: DraftStroke[]
  color: string
  canvasView: DraftBookView
  iconPosition: DraftBookPoint
  windowPosition: DraftBookPoint
  size: DraftBookSize
}

export const DEFAULT_DRAFT_BOOK: DraftBookData = {
  strokes: [],
  color: '#2f2b28',
  canvasView: { x: 0, y: 0, zoom: 1 },
  iconPosition: { x: -1, y: -1 },
  windowPosition: { x: -1, y: -1 },
  size: { width: 420, height: 440 },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOrFallback(value: unknown, fallback: number, minimum: number, maximum: number, shouldRound = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const bounded = Math.min(maximum, Math.max(minimum, value))
  return shouldRound ? Math.round(bounded) : bounded
}

function pointOrFallback(value: unknown, fallback: DraftBookPoint, minimum = -1, maximum = 10000, shouldRound = true) {
  if (!isRecord(value)) return { ...fallback }
  return {
    x: numberOrFallback(value.x, fallback.x, minimum, maximum, shouldRound),
    y: numberOrFallback(value.y, fallback.y, minimum, maximum, shouldRound),
  }
}

function strokesOrFallback(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(stroke => {
    if (!isRecord(stroke) || !Array.isArray(stroke.points)) return []
    const points = stroke.points
      .filter(isRecord)
      .map(point => pointOrFallback(point, { x: 0, y: 0 }, 0, 1, false))
    return points.length ? [{ color: typeof stroke.color === 'string' ? stroke.color : '#2f2b28', points }] : []
  })
}

function viewOrFallback(value: unknown) {
  if (!isRecord(value)) return { ...DEFAULT_DRAFT_BOOK.canvasView }
  return {
    x: numberOrFallback(value.x, 0, -100000, 100000, false),
    y: numberOrFallback(value.y, 0, -100000, 100000, false),
    zoom: numberOrFallback(value.zoom, 1, .35, 3.2, false),
  }
}

export function validateDraftBook(value: unknown): DraftBookData {
  if (!isRecord(value)) return { ...DEFAULT_DRAFT_BOOK, strokes: [], canvasView: { ...DEFAULT_DRAFT_BOOK.canvasView }, iconPosition: { ...DEFAULT_DRAFT_BOOK.iconPosition }, windowPosition: { ...DEFAULT_DRAFT_BOOK.windowPosition }, size: { ...DEFAULT_DRAFT_BOOK.size } }
  const size = isRecord(value.size)
    ? {
        width: numberOrFallback(value.size.width, DEFAULT_DRAFT_BOOK.size.width, 320, 900),
        height: numberOrFallback(value.size.height, DEFAULT_DRAFT_BOOK.size.height, 260, 900),
      }
    : { ...DEFAULT_DRAFT_BOOK.size }
  const hasCanvasView = isRecord(value.canvasView)
  const strokes = strokesOrFallback(value.strokes)
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : DEFAULT_DRAFT_BOOK.color
  return {
    strokes: hasCanvasView
      ? strokes
      : strokes.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ x: point.x * size.width, y: point.y * size.height })) })),
    color,
    canvasView: hasCanvasView ? viewOrFallback(value.canvasView) : { ...DEFAULT_DRAFT_BOOK.canvasView },
    iconPosition: pointOrFallback(value.iconPosition, DEFAULT_DRAFT_BOOK.iconPosition),
    windowPosition: pointOrFallback(value.windowPosition, DEFAULT_DRAFT_BOOK.windowPosition),
    size,
  }
}

export function loadDraftBook(): DraftBookData {
  try {
    return validateDraftBook(JSON.parse(localStorage.getItem(DRAFT_BOOK_KEY) || 'null'))
  } catch {
    return validateDraftBook(null)
  }
}

export function saveDraftBook(data: DraftBookData) {
  try {
    localStorage.setItem(DRAFT_BOOK_KEY, JSON.stringify(validateDraftBook(data)))
    return true
  } catch {
    return false
  }
}
