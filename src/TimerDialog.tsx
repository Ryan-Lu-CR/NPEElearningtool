import { useEffect, useState } from 'react'
import { History, Pause, Play, Square, Timer, Trash2, X } from 'lucide-react'
import { deleteTimerHistory, finishTimerSession, getTimerElapsedMs, loadTimerData, pauseTimer, resetCurrentTimer, saveTimerData, startTimer, type TimerData, type TimerHistoryRecord, type TimerState, type TimerStatus } from './timer'

type TimerView = 'large' | 'mini'

type TimerDialogProps = {
  view: TimerView
  onViewChange: (view: TimerView) => void
  onClose: () => void
}

const statusCopy: Record<TimerStatus, { label: string; hint: string }> = {
  idle: { label: '准备开始', hint: '开始后会持续记录本次学习时长' },
  running: { label: '正在计时', hint: '计时会在页面切换和窗口收起后继续' },
  paused: { label: '已暂停', hint: '可以继续计时，或结束并保存本次时长' },
  ended: { label: '已结束', hint: '本次时长已保存，可以重新开始一段新的计时' },
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function TimerStatusBadge({ status }: { status: TimerStatus }) {
  return <span className={`timer-status-badge ${status}`}><i aria-hidden="true"/>{statusCopy[status].label}</span>
}

function TimerHistory({ records, onDelete }: { records: TimerHistoryRecord[]; onDelete: (id: string) => void }) {
  return <section className="timer-history" aria-labelledby="timer-history-title">
    <div className="timer-history-heading">
      <div><span>HISTORY</span><strong id="timer-history-title"><History/>最近 10 次</strong></div>
      <small>{records.length}/10 条记录</small>
    </div>
    {records.length === 0 ? <div className="timer-history-empty"><History/><span>完成一次计时后，记录会显示在这里</span></div> : <div className="timer-history-list">
      {records.map(record => {
        const events = [
          ...record.pauseEvents.map((event, index) => ({ ...event, kind: 'pause' as const, label: record.pauseEvents.length > 1 ? `暂停 ${index + 1}` : '暂停' })),
          ...record.resumeEvents.map((event, index) => ({ ...event, kind: 'resume' as const, label: record.resumeEvents.length > 1 ? `继续 ${index + 1}` : '继续' })),
        ].sort((left, right) => left.at - right.at)
        return <article className="timer-history-item" key={record.id}>
        <div className="timer-history-item-heading">
          <div><strong>有效时长 {formatDuration(record.elapsedMs)}</strong><small>{record.pauseEvents.length ? `暂停 ${record.pauseEvents.length} 次` : '未暂停'}{record.resumeEvents.length ? ` · 继续 ${record.resumeEvents.length} 次` : ''}</small></div>
          <button type="button" aria-label={`删除 ${formatTimestamp(record.startedAt)} 的计时记录`} title="删除记录" onClick={() => onDelete(record.id)}><Trash2/></button>
        </div>
        <div className="timer-history-events">
          <span className="start"><i aria-hidden="true"/><b>开始</b><time>{formatTimestamp(record.startedAt)}</time></span>
          {events.map((event, index) => <span className={event.kind} key={`${record.id}-${event.kind}-${event.at}-${index}`}><i aria-hidden="true"/><b>{event.label}</b><time>{formatTimestamp(event.at)}</time></span>)}
          <span className="end"><i aria-hidden="true"/><b>结束</b><time>{formatTimestamp(record.endedAt)}</time></span>
        </div>
      </article>
      })}
    </div>}
  </section>
}

export default function TimerDialog({ view, onViewChange, onClose }: TimerDialogProps) {
  const [timerData, setTimerData] = useState<TimerData>(loadTimerData)
  const [now, setNow] = useState(() => Date.now())
  const timerState = timerData.current
  const elapsedMs = getTimerElapsedMs(timerState, now)
  const copy = statusCopy[timerState.status]

  useEffect(() => {
    if (timerState.status !== 'running') return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [timerState.status])

  useEffect(() => {
    saveTimerData(timerData)
  }, [timerData])

  useEffect(() => {
    if (view !== 'large') return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  })

  function requestClose() {
    if (timerState.status === 'running' || timerState.status === 'paused') {
      onViewChange('mini')
      return
    }
    const resetData = resetCurrentTimer(timerData)
    setTimerData(resetData)
    saveTimerData(resetData)
    onClose()
  }

  function updateTimer(update: (state: TimerState, now: number) => TimerState) {
    const timestamp = Date.now()
    setNow(timestamp)
    setTimerData(previous => ({ ...previous, current: update(previous.current, timestamp) }))
  }

  function finishCurrentTimer() {
    const timestamp = Date.now()
    setNow(timestamp)
    setTimerData(previous => finishTimerSession(previous, timestamp))
  }

  function deleteHistoryRecord(id: string) {
    setTimerData(previous => deleteTimerHistory(previous, id))
  }

  if (view === 'mini') {
    return <button className="timer-mini-window" type="button" aria-label="恢复计时器" onClick={() => onViewChange('large')}>
      <span className={`timer-mini-icon ${timerState.status}`}><Timer/></span>
      <span className="timer-mini-content"><strong>{formatDuration(elapsedMs)}</strong><small><i className={timerState.status} aria-hidden="true"/>{copy.label}</small></span>
      <span className="timer-mini-expand" aria-hidden="true">↗</span>
    </button>
  }

  return <div className="timer-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) requestClose() }}>
    <section className="timer-dialog" role="dialog" aria-modal="true" aria-labelledby="timer-title" onClick={event => event.stopPropagation()}>
      <div className="timer-dialog-scroll">
        <button className="timer-dialog-close" type="button" aria-label="关闭计时器" onClick={requestClose}><X/></button>
        <div className="timer-dialog-heading">
          <span className="timer-dialog-icon"><Timer/></span>
          <div><span>STUDY TOOL</span><h2 id="timer-title">计时器</h2></div>
        </div>
        <p className="timer-dialog-description">记录一段专注学习时间，关闭大窗后会自动收起为右下角小窗。</p>
        <div className={`timer-clock ${timerState.status === 'running' ? 'is-running' : ''}`}>
          <div className="timer-clock-inner"><span>本次学习</span><strong>{formatDuration(elapsedMs)}</strong><TimerStatusBadge status={timerState.status}/></div>
        </div>
        <div className="timer-dialog-state"><span className={`timer-state-dot ${timerState.status}`} aria-hidden="true"/><div><strong>{copy.label}</strong><small>{copy.hint}</small></div></div>
        <div className="timer-controls">
          <button className="timer-control timer-start" type="button" disabled={timerState.status === 'running'} onClick={() => updateTimer(startTimer)}><Play/>{timerState.status === 'ended' ? '重新开始' : timerState.status === 'paused' ? '继续计时' : '开始计时'}</button>
          <button className="timer-control" type="button" disabled={timerState.status !== 'running'} onClick={() => updateTimer(pauseTimer)}><Pause/>暂停</button>
          <button className="timer-control timer-stop" type="button" disabled={timerState.status !== 'running' && timerState.status !== 'paused'} onClick={finishCurrentTimer}><Square/>结束</button>
        </div>
        <small className="timer-dialog-footnote">提示：点击右上角关闭只会收起界面，不会结束计时；结束后关闭会清零本次计时。</small>
        <TimerHistory records={timerData.history} onDelete={deleteHistoryRecord}/>
      </div>
    </section>
  </div>
}
