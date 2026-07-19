import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDown, Eraser, Lasso, Maximize2, NotebookPen, Pencil, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { emptyHandwritingDrawing, emptyQuestionNote, eraseHandwritingStrokes, hasQuestionNote, type HandwritingDrawing, type HandwritingPoint, type HandwritingStroke, type QuestionNote } from './questionNotes'

interface QuestionNotePanelProps {
  questionId: string
  note?: QuestionNote
  onChange: (note: QuestionNote) => void
}

interface HandwritingCanvasProps {
  drawing: HandwritingDrawing
  tool: HandwritingTool
  color: string
  size: number
  expanded?: boolean
  selectedStrokeIds: string[]
  onCommit: (drawing: HandwritingDrawing) => void
  onSelectionChange: (strokeIds: string[]) => void
  onDeleteSelection: () => void
}

type HandwritingTool = 'pen' | 'eraser' | 'lasso'
type SelectionHandle = 'nw' | 'ne' | 'sw' | 'se'
type HandwritingInteraction = HandwritingTool | 'move' | 'scale'

const newStrokeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const pointDistance = (left: HandwritingPoint, right: HandwritingPoint) => Math.hypot(left.x - right.x, left.y - right.y)
const EMPTY_NOTE = emptyQuestionNote()
const COMMON_INK_COLORS = [
  { value: '#2f2b28', label: '黑色' },
  { value: '#6f6a65', label: '灰色' },
  { value: '#8f3028', label: '砖红' },
  { value: '#d06432', label: '橙色' },
  { value: '#d39a22', label: '黄色' },
  { value: '#39805d', label: '绿色' },
  { value: '#3474a7', label: '蓝色' },
  { value: '#765b9e', label: '紫色' },
]
const INK_WIDTH_LEVELS = [.44, .59, .74, .89, 1.04, 1.19, 1.34, 1.49, 1.64]
const drawingPoint = (point: HandwritingPoint) => ({ x: point.x * 1000, y: point.y * 600 })
const midpoint = (left: HandwritingPoint, right: HandwritingPoint) => ({
  x: (left.x + right.x) * 500,
  y: (left.y + right.y) * 300,
})
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

interface SelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const selectionBoundsForStrokes = (strokes: HandwritingStroke[]): SelectionBounds | null => {
  const points = strokes.flatMap(stroke => stroke.points)
  if (!points.length) return null
  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
  }
}

const expandSelectionBounds = (bounds: SelectionBounds, padding = .014): SelectionBounds => ({
  minX: clamp(bounds.minX - padding, 0, 1),
  minY: clamp(bounds.minY - padding, 0, 1),
  maxX: clamp(bounds.maxX + padding, 0, 1),
  maxY: clamp(bounds.maxY + padding, 0, 1),
})

const pointInBounds = (point: HandwritingPoint, bounds: SelectionBounds) =>
  point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY

const cross = (left: HandwritingPoint, right: HandwritingPoint, point: HandwritingPoint) =>
  (right.x - left.x) * (point.y - left.y) - (right.y - left.y) * (point.x - left.x)

const segmentsIntersect = (firstStart: HandwritingPoint, firstEnd: HandwritingPoint, secondStart: HandwritingPoint, secondEnd: HandwritingPoint) => {
  const firstA = cross(firstStart, firstEnd, secondStart)
  const firstB = cross(firstStart, firstEnd, secondEnd)
  const secondA = cross(secondStart, secondEnd, firstStart)
  const secondB = cross(secondStart, secondEnd, firstEnd)
  const epsilon = .000001
  const onFirst = Math.abs(firstA) <= epsilon && Math.min(firstStart.x, firstEnd.x) - epsilon <= secondStart.x && secondStart.x <= Math.max(firstStart.x, firstEnd.x) + epsilon && Math.min(firstStart.y, firstEnd.y) - epsilon <= secondStart.y && secondStart.y <= Math.max(firstStart.y, firstEnd.y) + epsilon
  const onSecond = Math.abs(firstB) <= epsilon && Math.min(firstStart.x, firstEnd.x) - epsilon <= secondEnd.x && secondEnd.x <= Math.max(firstStart.x, firstEnd.x) + epsilon && Math.min(firstStart.y, firstEnd.y) - epsilon <= secondEnd.y && secondEnd.y <= Math.max(firstStart.y, firstEnd.y) + epsilon
  const onThird = Math.abs(secondA) <= epsilon && Math.min(secondStart.x, secondEnd.x) - epsilon <= firstStart.x && firstStart.x <= Math.max(secondStart.x, secondEnd.x) + epsilon && Math.min(secondStart.y, secondEnd.y) - epsilon <= firstStart.y && firstStart.y <= Math.max(secondStart.y, secondEnd.y) + epsilon
  const onFourth = Math.abs(secondB) <= epsilon && Math.min(secondStart.x, secondEnd.x) - epsilon <= firstEnd.x && firstEnd.x <= Math.max(secondStart.x, secondEnd.x) + epsilon && Math.min(secondStart.y, secondEnd.y) - epsilon <= firstEnd.y && firstEnd.y <= Math.max(secondStart.y, secondEnd.y) + epsilon
  return (firstA > epsilon && firstB < -epsilon || firstA < -epsilon && firstB > epsilon) && (secondA > epsilon && secondB < -epsilon || secondA < -epsilon && secondB > epsilon) || onFirst || onSecond || onThird || onFourth
}

const pointInPolygon = (point: HandwritingPoint, polygon: HandwritingPoint[]) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    if ((currentPoint.y > point.y) !== (previousPoint.y > point.y) && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y) / (previousPoint.y - currentPoint.y) + currentPoint.x) inside = !inside
  }
  return inside
}

export function strokeIsInsideLasso(stroke: HandwritingStroke, polygon: HandwritingPoint[]) {
  if (polygon.length < 3 || !stroke.points.length) return false
  if (stroke.points.some(point => pointInPolygon(point, polygon))) return true
  return stroke.points.some((point, index) => {
    if (index === 0) return false
    return polygon.some((polygonPoint, polygonIndex) => segmentsIntersect(point, stroke.points[index - 1], polygonPoint, polygon[(polygonIndex + 1) % polygon.length]))
  })
}

const translateStrokes = (strokes: HandwritingStroke[], selectedIds: Set<string>, dx: number, dy: number) =>
  strokes.map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) }
    : stroke)

const fitSelectedStrokesToCanvas = (strokes: HandwritingStroke[], selectedIds: Set<string>) => {
  const selectedBounds = selectionBoundsForStrokes(strokes.filter(stroke => selectedIds.has(stroke.id)))
  if (!selectedBounds) return strokes
  const dx = selectedBounds.minX < 0 ? -selectedBounds.minX : selectedBounds.maxX > 1 ? 1 - selectedBounds.maxX : 0
  const dy = selectedBounds.minY < 0 ? -selectedBounds.minY : selectedBounds.maxY > 1 ? 1 - selectedBounds.maxY : 0
  return translateStrokes(strokes, selectedIds, dx, dy).map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) })) }
    : stroke)
}

const scaleStrokes = (strokes: HandwritingStroke[], selectedIds: Set<string>, anchor: HandwritingPoint, scaleX: number, scaleY: number) =>
  fitSelectedStrokesToCanvas(strokes.map(stroke => selectedIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(point => ({ ...point, x: anchor.x + (point.x - anchor.x) * scaleX, y: anchor.y + (point.y - anchor.y) * scaleY })) }
    : stroke), selectedIds)

export function pathsForStroke(stroke: HandwritingStroke) {
  if (stroke.points.length < 2) {
    const point = drawingPoint(stroke.points[0])
    return [{ d: `M ${point.x} ${point.y} l .01 0`, width: stroke.size }]
  }
  const paths = INK_WIDTH_LEVELS.map(() => '')
  const lastIndex = stroke.points.length - 1
  for (let index = 0; index <= lastIndex; index++) {
    const point = stroke.points[index]
    const previous = stroke.points[Math.max(0, index - 1)]
    const next = stroke.points[Math.min(lastIndex, index + 1)]
    const start = index === 0 ? drawingPoint(point) : midpoint(previous, point)
    const end = index === lastIndex ? drawingPoint(point) : midpoint(point, next)
    const control = drawingPoint(point)
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
    const simulatedPressure = Math.min(.78, Math.max(.28, .82 - distance * 9))
    const recordedPressure = point.pressure ?? .5
    const pressure = stroke.input === 'pen' ? recordedPressure : simulatedPressure
    const taper = Math.min(1, .45 + Math.min(index, lastIndex - index) * .28)
    const widthFactor = (stroke.input === 'pen' ? .42 + pressure * 1.18 : .5 + pressure) * taper
    const level = INK_WIDTH_LEVELS.reduce((best, value, levelIndex) =>
      Math.abs(value - widthFactor) < Math.abs(INK_WIDTH_LEVELS[best] - widthFactor) ? levelIndex : best, 0)
    paths[level] += `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y} `
  }
  return paths.map((d, index) => ({ d, width: stroke.size * INK_WIDTH_LEVELS[index] })).filter(path => path.d)
}

interface TransformState {
  interaction: 'move' | 'scale'
  startPoint: HandwritingPoint
  startBounds: SelectionBounds
  baseStrokes: HandwritingStroke[]
  selectedIds: Set<string>
  handle?: SelectionHandle
}

function HandwritingCanvas({ drawing, tool, color, size, expanded, selectedStrokeIds, onCommit, onSelectionChange, onDeleteSelection }: HandwritingCanvasProps) {
  const [currentStroke, setCurrentStroke] = useState<HandwritingStroke | null>(null)
  const [erasingStrokes, setErasingStrokes] = useState<HandwritingStroke[] | null>(null)
  const [transformPreview, setTransformPreview] = useState<HandwritingStroke[] | null>(null)
  const [lassoPoints, setLassoPoints] = useState<HandwritingPoint[]>([])
  const currentStrokeRef = useRef<HandwritingStroke | null>(null)
  const erasingStrokesRef = useRef<HandwritingStroke[] | null>(null)
  const transformPreviewRef = useRef<HandwritingStroke[] | null>(null)
  const transformStateRef = useRef<TransformState | null>(null)
  const lassoPointsRef = useRef<HandwritingPoint[]>([])
  const activePointerRef = useRef<number | null>(null)
  const activeInteractionRef = useRef<HandwritingInteraction | null>(null)
  const penDetectedRef = useRef(false)
  const smoothedPressureRef = useRef<number | null>(null)
  const previewFrameRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
    currentStrokeRef.current = null
    erasingStrokesRef.current = null
    transformPreviewRef.current = null
    transformStateRef.current = null
    lassoPointsRef.current = []
    activePointerRef.current = null
    activeInteractionRef.current = null
    smoothedPressureRef.current = null
    setCurrentStroke(null)
    setErasingStrokes(null)
    setTransformPreview(null)
    setLassoPoints([])
  }, [drawing])

  const pointsFromEvent = (event: ReactPointerEvent<SVGElement>): HandwritingPoint[] => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) return []
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.()
    const nativeEvents = coalescedEvents?.length ? coalescedEvents : [event.nativeEvent]
    return nativeEvents.map(pointerEvent => {
      let pressure = pointerEvent.pressure || .5
      if (event.pointerType === 'pen') {
        const rawPressure = pointerEvent.pressure > 0 ? pointerEvent.pressure : smoothedPressureRef.current ?? .06
        const curvedPressure = Math.pow(Math.min(1, Math.max(.01, rawPressure)), 1 / 1.15)
        pressure = smoothedPressureRef.current === null
          ? curvedPressure
          : smoothedPressureRef.current * .24 + curvedPressure * .76
        smoothedPressureRef.current = pressure
      }
      return {
        x: Math.min(1, Math.max(0, (pointerEvent.clientX - bounds.left) / bounds.width)),
        y: Math.min(1, Math.max(0, (pointerEvent.clientY - bounds.top) / bounds.height)),
        pressure,
      }
    })
  }

  const eraseAt = (point: HandwritingPoint, strokes: HandwritingStroke[]) => eraseHandwritingStrokes(strokes, point, Math.max(.012, size / 420))
  const updatePreviewOnNextFrame = () => {
    if (previewFrameRef.current !== null) return
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null
      setCurrentStroke(currentStrokeRef.current)
      setErasingStrokes(erasingStrokesRef.current)
    })
  }

  const beginTransform = (event: ReactPointerEvent<SVGElement>, handle?: SelectionHandle) => {
    const selectedStrokes = drawing.strokes.filter(stroke => selectedStrokeIds.includes(stroke.id))
    const bounds = selectionBoundsForStrokes(selectedStrokes)
    const point = pointsFromEvent(event).at(-1)
    const svg = svgRef.current
    if (!bounds || !point || !svg || !selectedStrokes.length) return
    event.preventDefault()
    event.stopPropagation()
    svg.focus({ preventScroll: true })
    svg.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    activeInteractionRef.current = handle ? 'scale' : 'move'
    transformStateRef.current = {
      interaction: handle ? 'scale' : 'move',
      startPoint: point,
      startBounds: expandSelectionBounds(bounds),
      baseStrokes: drawing.strokes,
      selectedIds: new Set(selectedStrokeIds),
      ...(handle ? { handle } : {}),
    }
    transformPreviewRef.current = drawing.strokes
    setTransformPreview(drawing.strokes)
  }

  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== null) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    if (event.pointerType === 'touch' && penDetectedRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    smoothedPressureRef.current = null
    svgRef.current?.focus({ preventScroll: true })
    const point = pointsFromEvent(event).at(-1)
    if (!point) return
    const eventTool: HandwritingTool = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0) ? 'eraser' : tool
    if (eventTool === 'lasso') {
      const selectedBounds = selectionBoundsForStrokes(drawing.strokes.filter(stroke => selectedStrokeIds.includes(stroke.id)))
      if (selectedBounds && pointInBounds(point, expandSelectionBounds(selectedBounds))) {
        beginTransform(event, undefined)
        return
      }
      activeInteractionRef.current = 'lasso'
      lassoPointsRef.current = [point]
      setLassoPoints([point])
      return
    }
    activeInteractionRef.current = eventTool
    if (eventTool === 'eraser') {
      const next = eraseAt(point, drawing.strokes)
      erasingStrokesRef.current = next
      setErasingStrokes(next)
      return
    }
    const input = event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse'
    const stroke: HandwritingStroke = { id: newStrokeId(), color, size, input, points: [point] }
    currentStrokeRef.current = stroke
    setCurrentStroke(stroke)
  }

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    if (event.pointerType === 'pen') penDetectedRef.current = true
    event.preventDefault()
    const points = pointsFromEvent(event)
    const interaction = activeInteractionRef.current
    if (interaction === 'lasso') {
      const previous = lassoPointsRef.current.at(-1)
      const appended = points.filter(point => !previous || pointDistance(previous, point) >= .0007)
      if (appended.length) {
        lassoPointsRef.current = [...lassoPointsRef.current, ...appended]
        updatePreviewOnNextFrame()
        setLassoPoints(lassoPointsRef.current)
      }
      return
    }
    if (interaction === 'move' || interaction === 'scale') {
      const transform = transformStateRef.current
      const point = points.at(-1)
      if (!transform || !point) return
      let next = transform.baseStrokes
      if (transform.interaction === 'move') {
        const dx = clamp(point.x - transform.startPoint.x, -transform.startBounds.minX, 1 - transform.startBounds.maxX)
        const dy = clamp(point.y - transform.startPoint.y, -transform.startBounds.minY, 1 - transform.startBounds.maxY)
        next = fitSelectedStrokesToCanvas(translateStrokes(transform.baseStrokes, transform.selectedIds, dx, dy), transform.selectedIds)
      } else if (transform.handle) {
        const isWest = transform.handle === 'nw' || transform.handle === 'sw'
        const isNorth = transform.handle === 'nw' || transform.handle === 'ne'
        const anchor = {
          x: isWest ? transform.startBounds.maxX : transform.startBounds.minX,
          y: isNorth ? transform.startBounds.maxY : transform.startBounds.minY,
        }
        const startWidth = Math.max(.02, transform.startBounds.maxX - transform.startBounds.minX)
        const startHeight = Math.max(.02, transform.startBounds.maxY - transform.startBounds.minY)
        const edgeX = isWest ? Math.min(point.x, anchor.x - .01) : Math.max(point.x, anchor.x + .01)
        const edgeY = isNorth ? Math.min(point.y, anchor.y - .01) : Math.max(point.y, anchor.y + .01)
        const scaleX = clamp(Math.abs(edgeX - anchor.x) / startWidth, .1, 12)
        const scaleY = clamp(Math.abs(edgeY - anchor.y) / startHeight, .1, 12)
        next = scaleStrokes(transform.baseStrokes, transform.selectedIds, anchor, scaleX, scaleY)
      }
      transformPreviewRef.current = next
      setTransformPreview(next)
      return
    }
    if (interaction === 'eraser') {
      const next = points.reduce((strokes, point) => eraseAt(point, strokes), erasingStrokesRef.current || drawing.strokes)
      erasingStrokesRef.current = next
      updatePreviewOnNextFrame()
      return
    }
    const stroke = currentStrokeRef.current
    if (!stroke) return
    const appended = points.reduce<HandwritingPoint[]>((result, point) => {
      const previous = result[result.length - 1] || stroke.points[stroke.points.length - 1]
      return pointDistance(previous, point) < .0007 ? result : [...result, point]
    }, [])
    if (!appended.length) return
    const next = { ...stroke, points: [...stroke.points, ...appended] }
    currentStrokeRef.current = next
    updatePreviewOnNextFrame()
  }

  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
    const svg = svgRef.current
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    activePointerRef.current = null
    smoothedPressureRef.current = null
    const interaction = activeInteractionRef.current
    activeInteractionRef.current = null
    if (interaction === 'lasso') {
      const polygon = lassoPointsRef.current
      onSelectionChange(drawing.strokes.filter(stroke => strokeIsInsideLasso(stroke, polygon)).map(stroke => stroke.id))
      lassoPointsRef.current = []
      setLassoPoints([])
      return
    }
    if (interaction === 'move' || interaction === 'scale') {
      const next = transformPreviewRef.current
      const transform = transformStateRef.current
      if (next && transform && next !== transform.baseStrokes) onCommit({ ...drawing, strokes: next })
      transformPreviewRef.current = null
      transformStateRef.current = null
      setTransformPreview(null)
      return
    }
    if (interaction === 'eraser') {
      const strokes = erasingStrokesRef.current
      if (strokes && strokes.length !== drawing.strokes.length) onCommit({ ...drawing, strokes })
      erasingStrokesRef.current = null
      setErasingStrokes(null)
      return
    }
    const stroke = currentStrokeRef.current
    if (stroke) onCommit({ ...drawing, strokes: [...drawing.strokes, stroke] })
    currentStrokeRef.current = null
    setCurrentStroke(null)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedStrokeIds.length && tool === 'lasso') {
      event.preventDefault()
      onDeleteSelection()
    }
  }

  const visibleStrokes = transformPreview || erasingStrokes || drawing.strokes
  const selectedStrokes = visibleStrokes.filter(stroke => selectedStrokeIds.includes(stroke.id))
  const selectedBounds = selectionBoundsForStrokes(selectedStrokes)
  const selectionBox = selectedBounds ? expandSelectionBounds(selectedBounds) : null
  const lassoPath = lassoPoints.map(point => `${point.x * 1000},${point.y * 600}`).join(' ')
  const selectionHandleSize = 14
  const handlePoints: Array<{ handle: SelectionHandle; x: number; y: number }> = selectionBox ? [
    { handle: 'nw', x: selectionBox.minX, y: selectionBox.minY },
    { handle: 'ne', x: selectionBox.maxX, y: selectionBox.minY },
    { handle: 'sw', x: selectionBox.minX, y: selectionBox.maxY },
    { handle: 'se', x: selectionBox.maxX, y: selectionBox.maxY },
  ] : []
  return <div className={expanded ? 'handwriting-canvas expanded' : 'handwriting-canvas'}>
    <svg
      ref={svgRef}
      role="img"
      tabIndex={0}
      aria-label={tool === 'pen' ? '手写笔记画布，当前为画笔' : tool === 'eraser' ? '手写笔记画布，当前为橡皮擦' : '手写笔记画布，当前为套索选择'}
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={handleKeyDown}
    >
      <title>手写笔记画布</title>
      {visibleStrokes.flatMap(stroke => pathsForStroke(stroke).flatMap((path, index) => [
        selectedStrokeIds.includes(stroke.id) && <path key={`${stroke.id}-selected-${index}`} d={path.d} fill="none" stroke="#bf8179" strokeWidth={path.width + 5} strokeLinecap="round" strokeLinejoin="round" opacity=".32" vectorEffect="non-scaling-stroke"/>,
        <path key={`${stroke.id}-${index}`} d={path.d} fill="none" stroke={stroke.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>,
      ]))}
      {currentStroke && pathsForStroke(currentStroke).map((path, index) => <path key={index} d={path.d} fill="none" stroke={currentStroke.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}
      {lassoPoints.length > 1 && <polyline className="handwriting-lasso-preview" points={lassoPath} fill="rgba(143, 48, 40, .08)" stroke="#8f3028" strokeWidth="2" strokeDasharray="8 6" vectorEffect="non-scaling-stroke"/>}
      {selectionBox && tool === 'lasso' && <g className="handwriting-selection-overlay">
        <rect className="handwriting-selection-box" x={selectionBox.minX * 1000} y={selectionBox.minY * 600} width={(selectionBox.maxX - selectionBox.minX) * 1000} height={(selectionBox.maxY - selectionBox.minY) * 600}/>
        <rect className="handwriting-selection-hitbox" x={selectionBox.minX * 1000} y={selectionBox.minY * 600} width={(selectionBox.maxX - selectionBox.minX) * 1000} height={(selectionBox.maxY - selectionBox.minY) * 600} onPointerDown={event => beginTransform(event, undefined)}/>
        {handlePoints.map(({ handle, x, y }) => <rect
          key={handle}
          className={`handwriting-selection-handle handwriting-selection-handle-${handle}`}
          x={x * 1000 - selectionHandleSize / 2}
          y={y * 600 - selectionHandleSize / 2}
          width={selectionHandleSize}
          height={selectionHandleSize}
          aria-label={`从${handle}角缩放选中笔迹`}
          onPointerDown={event => beginTransform(event, handle)}
        />)}
      </g>}
    </svg>
    {!visibleStrokes.length && !currentStroke && <span>在这里书写，支持触控笔、触摸和鼠标</span>}
  </div>
}

interface HandwritingEditorProps {
  drawing: HandwritingDrawing
  tool: HandwritingTool
  color: string
  size: number
  expanded?: boolean
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: HandwritingTool) => void
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onCommit: (drawing: HandwritingDrawing) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onExpand?: () => void
}

function HandwritingEditor(props: HandwritingEditorProps) {
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([])

  useEffect(() => {
    const drawingIds = new Set(props.drawing.strokes.map(stroke => stroke.id))
    setSelectedStrokeIds(previous => previous.filter(id => drawingIds.has(id)))
  }, [props.drawing])

  const selectTool = (tool: HandwritingTool) => {
    props.onToolChange(tool)
    if (tool !== 'lasso') setSelectedStrokeIds([])
  }

  const deleteSelection = () => {
    if (!selectedStrokeIds.length) return
    props.onCommit({ ...props.drawing, strokes: props.drawing.strokes.filter(stroke => !selectedStrokeIds.includes(stroke.id)) })
    setSelectedStrokeIds([])
  }

  return <div className={props.expanded ? 'handwriting-editor expanded' : 'handwriting-editor'}>
    <div className="handwriting-toolbar" role="toolbar" aria-label="手写工具">
      <button className={props.tool === 'pen' ? 'active' : ''} aria-label="画笔" title="画笔" onClick={() => selectTool('pen')}><Pencil size={15}/><span>画笔</span></button>
      <button className={props.tool === 'eraser' ? 'active' : ''} aria-label="橡皮擦" title="橡皮擦" onClick={() => selectTool('eraser')}><Eraser size={15}/><span>橡皮</span></button>
      <button className={props.tool === 'lasso' ? 'active' : ''} aria-label="套索选择" title="套索选择" onClick={() => selectTool('lasso')}><Lasso size={15}/><span>套索</span></button>
      <div className="handwriting-colors" role="group" aria-label="笔迹颜色">
        <span>颜色</span>
        <div className="handwriting-swatches">
          {COMMON_INK_COLORS.map(item => <button
            key={item.value}
            type="button"
            className={props.color.toLowerCase() === item.value ? 'selected' : ''}
            aria-label={item.label}
            aria-pressed={props.color.toLowerCase() === item.value}
            title={item.label}
            style={{ '--ink-color': item.value } as CSSProperties}
            onClick={() => props.onColorChange(item.value)}
          />)}
        </div>
        <label className="handwriting-custom-color" title="自定义颜色">
          <input aria-label="自定义笔迹颜色" type="color" value={props.color} onChange={event => props.onColorChange(event.target.value)}/>
          <span>自定义</span>
        </label>
      </div>
      <label className="handwriting-size"><span>粗细</span><input aria-label="笔迹粗细" type="range" min="1" max="12" value={props.size} onChange={event => props.onSizeChange(Number(event.target.value))}/><output aria-label={`当前笔迹粗细 ${props.size}`}>{props.size}</output></label>
      <span className="handwriting-toolbar-spacer"/>
      <button aria-label="撤销" title="撤销" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={15}/></button>
      <button aria-label="重做" title="重做" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={15}/></button>
      <button aria-label="删除选中笔迹" title="删除选中笔迹" disabled={!selectedStrokeIds.length} onClick={deleteSelection}><Trash2 size={15}/><span>删除选中</span></button>
      <button aria-label="清空手写" title="清空手写" disabled={!props.drawing.strokes.length} onClick={props.onClear}><Trash2 size={15}/></button>
      {props.onExpand && <button className="handwriting-expand" onClick={props.onExpand}><Maximize2 size={15}/><span>放大书写</span></button>}
    </div>
    <HandwritingCanvas drawing={props.drawing} tool={props.tool} color={props.color} size={props.size} expanded={props.expanded} selectedStrokeIds={selectedStrokeIds} onCommit={props.onCommit} onSelectionChange={setSelectedStrokeIds} onDeleteSelection={deleteSelection}/>
  </div>
}

function ExpandedHandwritingDialog({ editor, onClose }: { editor: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [onClose])

  return <div className="handwriting-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="handwriting-dialog" role="dialog" aria-modal="true" aria-labelledby="handwriting-dialog-title">
      <header><div><span>HANDWRITING NOTE</span><h2 id="handwriting-dialog-title">手写笔记</h2></div><button aria-label="完成并关闭" onClick={onClose}><X size={19}/><span>完成</span></button></header>
      {editor}
    </section>
  </div>
}

export default function QuestionNotePanel({ questionId, note, onChange }: QuestionNotePanelProps) {
  const value = note || EMPTY_NOTE
  const drawing = value.drawing || emptyHandwritingDrawing()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'handwriting'>('text')
  const [expanded, setExpanded] = useState(false)
  const [tool, setTool] = useState<HandwritingTool>('pen')
  const [color, setColor] = useState('#8f3028')
  const [size, setSize] = useState(3)
  const [past, setPast] = useState<HandwritingDrawing[]>([])
  const [future, setFuture] = useState<HandwritingDrawing[]>([])

  useEffect(() => {
    setExpanded(false)
    setPast([])
    setFuture([])
  }, [questionId])

  const change = (next: Partial<Pick<QuestionNote, 'text' | 'drawing'>>) => onChange({
    text: next.text ?? value.text,
    drawing: next.drawing ?? drawing,
    updatedAt: new Date().toISOString(),
  })

  const commitDrawing = (next: HandwritingDrawing) => {
    setPast(previous => [...previous.slice(-49), drawing])
    setFuture([])
    change({ drawing: next })
  }
  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(items => items.slice(0, -1))
    setFuture(items => [drawing, ...items].slice(0, 50))
    change({ drawing: previous })
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setPast(items => [...items.slice(-49), drawing])
    setFuture(items => items.slice(1))
    change({ drawing: next })
  }
  const clear = () => {
    if (!drawing.strokes.length || !window.confirm('确定清空这道题的全部手写笔记吗？')) return
    commitDrawing({ ...drawing, strokes: [] })
  }
  const editorProps = {
    drawing,
    tool,
    color,
    size,
    canUndo: Boolean(past.length),
    canRedo: Boolean(future.length),
    onToolChange: setTool,
    onColorChange: setColor,
    onSizeChange: setSize,
    onCommit: commitDrawing,
    onUndo: undo,
    onRedo: redo,
    onClear: clear,
  }

  return <section className="question-note-section">
    <button className="passage-answer-toggle question-note-toggle" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
      <NotebookPen size={17}/>{open ? '收起笔记' : '查看与编辑笔记'}{hasQuestionNote(note) && <em>已保存</em>}<ChevronDown className={open ? 'rotated' : ''} size={16}/>
    </button>
    {open && <div className="question-note-panel">
      <div className="question-note-tabs" role="tablist" aria-label="笔记类型">
        <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>文字笔记</button>
        <button role="tab" aria-selected={mode === 'handwriting'} className={mode === 'handwriting' ? 'active' : ''} onClick={() => setMode('handwriting')}>手写笔记</button>
        <small>{value.updatedAt ? '已自动保存' : '输入或书写后自动保存'}</small>
      </div>
      {mode === 'text'
        ? <textarea aria-label="文字笔记" value={value.text} onChange={event => change({ text: event.target.value })} placeholder="记录思路、易错点、公式或复习提醒……"/>
        : <HandwritingEditor {...editorProps} onExpand={() => setExpanded(true)}/>}
    </div>}
    {expanded && <ExpandedHandwritingDialog onClose={() => setExpanded(false)} editor={<HandwritingEditor {...editorProps} expanded/>}/>}
  </section>
}
