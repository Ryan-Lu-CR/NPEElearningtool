import { beforeEach, describe, expect, it } from 'vitest'
import { deleteTimerHistory, emptyTimerState, endTimer, finishTimerSession, getTimerElapsedMs, loadTimerData, loadTimerState, pauseTimer, resetCurrentTimer, saveTimerData, saveTimerState, startTimer, validateTimerData, validateTimerState } from './timer'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
})

describe('学习计时器', () => {
  it('可以开始、暂停、继续和结束，并准确累计时长', () => {
    const running = startTimer(emptyTimerState, 1_000)
    expect(getTimerElapsedMs(running, 3_500)).toBe(2_500)
    const paused = pauseTimer(running, 3_500)
    expect(paused).toEqual({ status: 'paused', elapsedMs: 2_500, startedAt: 1_000, runningAt: null, pauseEvents: [{ at: 3_500 }], resumeEvents: [] })
    const resumed = startTimer(paused, 5_000)
    expect(resumed.resumeEvents).toEqual([{ at: 5_000 }])
    const ended = endTimer(resumed, 7_250)
    expect(ended).toEqual({ status: 'ended', elapsedMs: 4_750, startedAt: 1_000, runningAt: null, pauseEvents: [{ at: 3_500 }], resumeEvents: [{ at: 5_000 }] })
  })

  it('重新开始已结束的计时会从零开始', () => {
    const ended = endTimer(startTimer(emptyTimerState, 1_000), 2_000)
    expect(startTimer(ended, 8_000)).toEqual({ status: 'running', elapsedMs: 0, startedAt: 8_000, runningAt: 8_000, pauseEvents: [], resumeEvents: [] })
  })

  it('会过滤损坏的本地状态，并可往返保存', () => {
    expect(validateTimerState({ status: 'running', elapsedMs: -10, startedAt: 'bad', extra: true })).toEqual(emptyTimerState)
    const state = startTimer(emptyTimerState, 12_000)
    expect(saveTimerState(state)).toBe(true)
    expect(loadTimerState()).toEqual(state)
  })

  it('结束时归档开始、结束和暂停时间点', () => {
    const started = startTimer(emptyTimerState, 1_000)
    const paused = pauseTimer(started, 3_000)
    const resumed = startTimer(paused, 5_000)
    const data = finishTimerSession({ current: resumed, history: [] }, 8_000)
    expect(data.current.status).toBe('ended')
    expect(data.current.elapsedMs).toBe(5_000)
    expect(data.history).toHaveLength(1)
    expect(data.history[0]).toMatchObject({ startedAt: 1_000, endedAt: 8_000, elapsedMs: 5_000, pauseEvents: [{ at: 3_000 }], resumeEvents: [{ at: 5_000 }] })
  })

  it('只保留最近10条记录，关闭后可将当前计时清零并删除历史', () => {
    const history = Array.from({ length: 11 }, (_, index) => ({ id: String(index), startedAt: index + 1, endedAt: index + 2, elapsedMs: 1_000, pauseEvents: [] }))
    const data = validateTimerData({ current: startTimer(emptyTimerState, 20_000), history })
    expect(data.history).toHaveLength(10)
    expect(resetCurrentTimer(data).current).toEqual(emptyTimerState)
    expect(deleteTimerHistory(data, data.history[0].id).history).toHaveLength(9)
    expect(saveTimerData(data)).toBe(true)
    expect(loadTimerData()).toEqual(data)
  })
})
