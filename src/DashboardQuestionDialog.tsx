import { useEffect, useState } from 'react'
import { CalendarClock, ChevronDown, CircleHelp, Plus, Trash2, X } from 'lucide-react'
import AssetGallery from './AssetGallery'
import { isImageAnswerPlaceholder } from './questionPresentation'
import { buildQuestionReviewTimeline } from './questionReview'
import { localDateKey, type StudyActivity } from './studyActivity'
import type { Question, QuestionStatus } from './types'
import QuestionNotePanel from './QuestionNotePanel'
import type { QuestionNote } from './questionNotes'

interface DashboardQuestionDialogProps {
  bankName: string
  chapterName: string
  sectionName: string
  question: Question
  status: QuestionStatus
  activities: StudyActivity[]
  note?: QuestionNote
  binaryMode: boolean
  onStatusChange: (status: QuestionStatus, answerRevealed: boolean) => void
  onReviewStatusChange: (status: QuestionStatus, answerRevealed: boolean) => void
  onNoteChange: (note: QuestionNote) => void
  onClose: () => void
}

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' },
  proficient: { label: '熟练', icon: '✓' },
  vague: { label: '模糊', icon: '?' },
  wrong: { label: '错误', icon: '×' },
}

const formatMarkedAt = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export default function DashboardQuestionDialog({ bankName, chapterName, sectionName, question, status, activities, note, binaryMode, onStatusChange, onReviewStatusChange, onNoteChange, onClose }: DashboardQuestionDialogProps) {
  const [answerOpen, setAnswerOpen] = useState(false)
  const timeline = buildQuestionReviewTimeline(activities, question.id)
  const effectiveStatus = binaryMode && status === 'vague' ? 'none' : status
  const initialMark = timeline.initialMark || (effectiveStatus !== 'none' ? { status: effectiveStatus, markedAt: '', date: '' } : null)
  const reviewEntries = timeline.reviews
  const [manualReviewSlots, setManualReviewSlots] = useState<number[]>([])
  const baseReviewSlotCount = Math.max(3, reviewEntries.length)
  const reviewSlotCount = baseReviewSlotCount + manualReviewSlots.length
  const latestReviewIsToday = reviewEntries[reviewEntries.length - 1]?.date === localDateKey()
  const choices: QuestionStatus[] = binaryMode ? ['proficient', 'wrong'] : ['proficient', 'vague', 'wrong']
  const reviewChoices: QuestionStatus[] = binaryMode ? ['proficient', 'wrong'] : ['proficient', 'vague', 'wrong']
  const labelFor = (value: QuestionStatus) => binaryMode
    ? value === 'proficient' ? '正确' : value === 'wrong' ? '错误' : '未标记'
    : statusMeta[value].label
  const hasAnswerImages = Boolean(question.answerImageKeys?.length || question.answerImageUrl)
  const usesImageAnswer = hasAnswerImages && isImageAnswerPlaceholder(question.answer)
  const hidesPlaceholderText = (question.type === '图片题' || question.imageUrl || question.imageKeys?.length) && question.text === `第 ${question.number} 题`

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])
  useEffect(() => { setManualReviewSlots([]) }, [question.id])

  const changeReviewStatus = (value: QuestionStatus, selectedStatus: QuestionStatus) => {
    const nextStatus = selectedStatus === value ? 'none' : value
    onReviewStatusChange(nextStatus, answerOpen)
  }

  return <div className="dashboard-question-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dashboard-question-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-question-title">
      <div className="dashboard-question-main"><header className="dashboard-question-dialog-head">
        <div><span>{bankName}</span><small>{chapterName} · {sectionName}</small></div>
        <button onClick={onClose} aria-label="关闭题目弹窗"><X size={19}/></button>
      </header>
      <div className="dashboard-question-dialog-scroll">
        <div className="dashboard-question-title-row">
          <div><span className="number">{String(question.number).padStart(2, '0')}</span></div>
          <span className={`current-status ${effectiveStatus}`}>{statusMeta[effectiveStatus].icon} {labelFor(effectiveStatus)}</span>
        </div>
        <div className="dashboard-question-content" id="dashboard-question-title">
          {!hidesPlaceholderText && question.text && <p>{question.text}</p>}
          <AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图"/>
          {question.options && <div className="options">{question.options.map((option, index) => <div key={index}>{option}</div>)}</div>}
        </div>
        <button className="passage-answer-toggle dashboard-answer-toggle" aria-expanded={answerOpen} onClick={() => setAnswerOpen(previous => !previous)}>
          <CircleHelp size={18}/>{answerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={answerOpen ? 'rotated' : ''} size={17}/>
        </button>
        {answerOpen && <div className="dashboard-question-answer passage-answer">
          {!usesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{question.answer}</strong></div>}
          <div className={usesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}>
            <span>{usesImageAnswer ? '参考答案和解析' : '解析'}</span>
            {hasAnswerImages
              ? <AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt={usesImageAnswer ? '参考答案和解析' : '解析截图'} eager/>
              : question.analysis ? <p>{question.analysis}</p> : <p className="analysis-missing">暂未收录解析</p>}
          </div>
          {question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}
        </div>}
        <QuestionNotePanel questionId={question.id} note={note} onChange={onNoteChange}/>
      </div>
      <footer className="dashboard-question-status">
        <span>掌握情况</span>
        <div>{choices.map(choice => <button key={choice} className={effectiveStatus === choice ? `status-button ${choice} active` : `status-button ${choice}`} onClick={() => onStatusChange(effectiveStatus === choice ? 'none' : choice, answerOpen)}><b>{statusMeta[choice].icon}</b>{labelFor(choice)}</button>)}</div>
      </footer></div>
      <aside className="dashboard-question-review" aria-label="复习记录">
        <div className="dashboard-review-heading"><div><span>REVIEW</span><h2><CalendarClock size={17}/>复习</h2></div><small>{reviewEntries.length ? `标记后已复习 ${reviewEntries.length} 次` : '完成初始标记后，下次记录为第一次复习'}</small></div>
        <div className={initialMark ? 'dashboard-review-baseline filled' : 'dashboard-review-baseline'}><div><strong>初始标记</strong><span>{initialMark?.markedAt ? formatMarkedAt(initialMark.markedAt) : initialMark ? '时间暂无' : '尚未标记'}</span></div>{initialMark && <em className={initialMark.status}>{statusMeta[initialMark.status].icon} {binaryMode && initialMark.status === 'proficient' ? '正确' : statusMeta[initialMark.status].label}</em>}</div>
        <div className="dashboard-review-list">{Array.from({ length: reviewSlotCount }, (_, index) => {
          const entry = reviewEntries[index]
          const isNextReview = Boolean(initialMark && !latestReviewIsToday && !entry && index === reviewEntries.length)
          const isTodayReview = Boolean(entry && index === reviewEntries.length - 1 && entry.date === localDateKey())
          const manualSlotId = index >= baseReviewSlotCount ? manualReviewSlots[index - baseReviewSlotCount] : null
          return <article className={entry ? 'dashboard-review-card filled' : 'dashboard-review-card pending'} key={index}>
            <div><strong>第 {index + 1} 次复习</strong><div><span>{entry ? initialMark?.markedAt ? `距标记 ${entry.daysAfterFirst} 天 · 距上次 ${entry.daysAfterPrevious} 天` : `距标记时间未知${index ? ` · 距上次 ${entry.daysAfterPrevious} 天` : ''}` : '待复习'}</span>{manualSlotId !== null && <button aria-label={`删除第 ${index + 1} 次复习位`} title="删除复习位" onClick={() => setManualReviewSlots(slots => slots.filter(id => id !== manualSlotId))}><Trash2 size={13}/></button>}</div></div>
            {entry ? <time dateTime={entry.markedAt}>{formatMarkedAt(entry.markedAt)}</time> : <p>{isNextReview ? '选择本次复习结果后记录' : '下次复习时开放'}</p>}
            <div className="dashboard-review-statuses">{reviewChoices.map(value => {
              const activeStatus = entry?.status || 'none'
              const label = binaryMode && value === 'proficient' ? '正确' : statusMeta[value].label
              return entry && !isTodayReview
                ? <span className={activeStatus === value ? `${value} active` : value} key={value}>{statusMeta[value].icon} {label}</span>
                : <button type="button" className={activeStatus === value ? `${value} active` : value} disabled={!isNextReview && !isTodayReview} aria-pressed={isNextReview || isTodayReview ? activeStatus === value : undefined} onClick={() => changeReviewStatus(value, activeStatus)} key={value}>{statusMeta[value].icon} {label}</button>
            })}</div>
          </article>
        })}</div>
        <button className="dashboard-review-add" onClick={() => setManualReviewSlots(slots => [...slots, (slots.at(-1) || 0) + 1])}><Plus size={15}/>添加复习位</button>
        <p className="dashboard-review-note">学习日历同题每天统计一次；复习次数独立记录，以最后选择为准。</p>
      </aside>
    </section>
  </div>
}
