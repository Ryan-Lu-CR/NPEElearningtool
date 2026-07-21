import { describe, expect, it } from 'vitest'
import { emptyQuestionNote, eraseHandwritingStrokes, hasQuestionNote, validateHandwritingDrawing, validateQuestionNotes } from './questionNotes'

describe('questionNotes', () => {
  it('validates text and editable vector strokes', () => {
    const notes = validateQuestionNotes({
      q1: {
        text: '矩阵秩的关键步骤',
        updatedAt: '2026-07-16T08:00:00.000Z',
        drawing: {
          version: 7,
          aspectRatio: 2,
          strokes: [{ id: 's1', color: '#AABBCC', size: 4, input: 'pen', points: [{ x: -.2, y: .5, pressure: 2 }, { x: .8, y: 1.5 }] }],
        },
      },
    })
    expect(notes.q1.text).toBe('矩阵秩的关键步骤')
    expect(notes.q1.drawing).toEqual({
      version: 1,
      aspectRatio: 2,
      strokes: [{ id: 's1', color: '#aabbcc', size: 4, input: 'pen', points: [{ x: 0, y: .5, pressure: 1 }, { x: .8, y: 1.5 }] }],
    })
  })

  it('filters empty or malformed notes', () => {
    expect(validateQuestionNotes({
      empty: emptyQuestionNote(),
      malformed: { text: 1, drawing: { strokes: [{ points: [{ x: 'x', y: 1 }] }] } },
      valid: { text: '保留', drawing: null },
    })).toEqual({
      valid: { text: '保留', drawing: validateHandwritingDrawing(null), updatedAt: '' },
    })
  })

  it('detects text and handwriting content', () => {
    expect(hasQuestionNote(undefined)).toBe(false)
    expect(hasQuestionNote(emptyQuestionNote())).toBe(false)
    expect(hasQuestionNote({ ...emptyQuestionNote(), text: '笔记' })).toBe(true)
    expect(hasQuestionNote({ ...emptyQuestionNote(), drawing: { version: 1, aspectRatio: 1.5, strokes: [{ id: 's', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .3 }] }] } })).toBe(true)
  })

  it('erases only strokes touched by the editable eraser', () => {
    const strokes = [
      { id: 'near', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'far', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .8, y: .8 }] },
    ]
    expect(eraseHandwritingStrokes(strokes, { x: .22, y: .2 }, .05).map(stroke => stroke.id)).toEqual(['far'])
  })
})
