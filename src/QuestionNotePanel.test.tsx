import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import QuestionNotePanel, { canvasHeightForDrawing, canvasHeightForStrokes, insertSpaceIntoStrokes, pathsForStroke } from './QuestionNotePanel'

describe('QuestionNotePanel', () => {
  it('uses an answer-style disclosure and marks saved content', () => {
    const markup = renderToStaticMarkup(createElement(QuestionNotePanel, {
      questionId: 'question-1',
      note: {
        text: '易错点',
        drawing: { version: 1, aspectRatio: 5 / 3, strokes: [] },
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
      onChange: () => {},
    }))
    expect(markup).toContain('查看与编辑笔记')
    expect(markup).toContain('已保存')
    expect(markup).toContain('aria-expanded="false"')
  })

  it('renders handwriting as pressure-aware smooth curves', () => {
    const lightPaths = pathsForStroke({
      id: 'light',
      color: '#000000',
      size: 4,
      input: 'pen',
      points: [
        { x: .1, y: .2, pressure: .1 },
        { x: .3, y: .4, pressure: .1 },
        { x: .6, y: .3, pressure: .1 },
        { x: .8, y: .5, pressure: .1 },
      ],
    })
    const heavyPaths = pathsForStroke({
      id: 'heavy',
      color: '#000000',
      size: 4,
      input: 'pen',
      points: [
        { x: .1, y: .2, pressure: .9 },
        { x: .3, y: .4, pressure: .9 },
        { x: .6, y: .3, pressure: .9 },
        { x: .8, y: .5, pressure: .9 },
      ],
    })

    expect(lightPaths.some(path => path.d.includes(' Q '))).toBe(true)
    expect(Math.max(...heavyPaths.map(path => path.width))).toBeGreaterThan(Math.max(...lightPaths.map(path => path.width)))
  })

  it('keeps the canvas tall enough for extended handwriting', () => {
    expect(canvasHeightForDrawing({
      version: 1,
      aspectRatio: 5 / 3,
      strokes: [{ id: 'lower', color: '#8f3028', size: 2, input: 'pen', points: [{ x: .2, y: 1.4 }] }],
    })).toBeGreaterThan(600 * 1.4)
  })

  it('shrinks to the remaining strokes without going below the default height', () => {
    expect(canvasHeightForStrokes([])).toBe(600)
    expect(canvasHeightForStrokes([{ id: 'upper', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .4 }] }])).toBe(600)
    expect(canvasHeightForStrokes([{ id: 'lower', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: 1.4 }] }])).toBeGreaterThan(600 * 1.4)
  })

  it('inserts space by moving only strokes below the insertion line', () => {
    const strokes = [
      { id: 'above', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'below', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .8 }] },
    ]
    const result = insertSpaceIntoStrokes(strokes, .5, .25)
    expect(result[0].points[0].y).toBe(.2)
    expect(result[1].points[0].y).toBe(1.05)
  })
})
