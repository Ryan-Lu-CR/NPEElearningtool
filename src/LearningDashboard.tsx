import { useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Question, QuestionBank, QuestionStatus } from './types'
import { sortBanksForDisplay } from './bankSorting'
import { calculateLearningStats, calculateQuestionStats, formatRate } from './learningStats'
import { calculateDailyActivity, localDateKey, type ActivityOutcomeStats, type StudyActivity } from './studyActivity'
import DashboardQuestionDialog from './DashboardQuestionDialog'
import { bankSubject, subjectOrder } from './subjects'
import type { QuestionNote, QuestionNotes } from './questionNotes'

interface LearningDashboardProps {
  banks: QuestionBank[]
  statuses: Record<string, QuestionStatus>
  activities: StudyActivity[]
  notes: QuestionNotes
  selectedBankId: string
  onSelectedBankIdChange: (bankId: string) => void
  onQuestionStatusChange: (bankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) => void
  onQuestionReviewStatusChange: (bankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) => void
  onQuestionReviewReset: (bankId: string, questionId: string) => void
  onQuestionNoteChange: (questionId: string, note: QuestionNote) => void
}

interface DashboardQuestionPreview {
  bank: QuestionBank
  chapterName: string
  sectionName: string
  questions: Question[]
  question: Question
}

function MasteryProgressBar({ stats, label, binaryMode }: { stats: ReturnType<typeof calculateQuestionStats>; label: string; binaryMode: boolean }) {
  const share = (count: number) => stats.total ? `${count / stats.total * 100}%` : '0%'
  const proficientLabel = binaryMode ? '正确' : '熟练'
  const wrongLabel = binaryMode ? '错误' : '错题'
  const description = `${label}：已标记 ${stats.marked}/${stats.total}，${proficientLabel} ${stats.proficient}${binaryMode ? '' : `，模糊 ${stats.vague}`}，${wrongLabel} ${stats.wrong}`
  return <div className="section-progress-bar mastery-progress-bar" aria-label={description} title={description}>
    <i className="proficient" style={{ width: share(stats.proficient) }}/>
    {!binaryMode && <i className="vague" style={{ width: share(stats.vague) }}/>}<i className="wrong" style={{ width: share(stats.wrong) }}/>
  </div>
}

function ActivityProgressBar({ stats, tone }: { stats: ActivityOutcomeStats; tone: 'new' | 'review' }) {
  if (!stats.total) return null
  const label = tone === 'new' ? '新题' : '复习'
  return <i className={`calendar-day-bar ${tone}`} title={`${label} ${stats.total} 题 · 正确率 ${formatRate(stats.accuracy)}`}>
    {stats.proficient > 0 && <b className="green" style={{ flex: stats.proficient }}/>}
    {stats.vague > 0 && <b className="yellow" style={{ flex: stats.vague }}/>}
    {stats.wrong > 0 && <b className="red" style={{ flex: stats.wrong }}/>}
  </i>
}

function ActivityTypeSummary({ label, stats, tone }: { label: string; stats: ActivityOutcomeStats; tone: 'new' | 'review' }) {
  if (!stats.total) return null
  return <div className={`selected-day-type-card ${tone}`}><div className="selected-day-type-heading"><strong>{label}</strong><span>{stats.total}<small>题</small></span><em>正确率 {formatRate(stats.accuracy)}</em></div><div className="selected-day-type-outcomes"><span className="green-text">{stats.proficient} 正确</span><span className="yellow-text">{stats.vague} 模糊</span><span className="red-text">{stats.wrong} 错误</span></div></div>
}

export default function LearningDashboard({ banks, statuses, activities, notes, selectedBankId, onSelectedBankIdChange, onQuestionStatusChange, onQuestionReviewStatusChange, onQuestionReviewReset, onQuestionNoteChange }: LearningDashboardProps) {
  const orderedBanks = subjectOrder.flatMap(subject => sortBanksForDisplay(banks.filter(bank => bankSubject(bank) === subject)))
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set())
  const [questionPreview, setQuestionPreview] = useState<DashboardQuestionPreview | null>(null)
  const today = localDateKey()
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today)
  const selectedBank = orderedBanks.find(bank => bank.id === selectedBankId) || orderedBanks[0]
  const selectedBankIsEnglish = selectedBank ? bankSubject(selectedBank) === 'english' : false
  const selectedStats = selectedBank ? calculateLearningStats([selectedBank], statuses) : null
  const overallStats = calculateLearningStats(orderedBanks, statuses)
  const [calendarYear, calendarMonthNumber] = calendarMonth.split('-').map(Number)
  const firstDay = new Date(calendarYear, calendarMonthNumber - 1, 1)
  const leadingDays = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(calendarYear, calendarMonthNumber, 0).getDate()
  const calendarCellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7
  const markedActivities = activities.filter(item => item.status !== 'none')
  const todayActivities = markedActivities.filter(item => item.date === today)
  const todayStats = calculateDailyActivity(todayActivities, markedActivities)
  const todayReviewCount = todayStats.vague + todayStats.wrong
  const monthActivities = markedActivities.filter(item => item.date.startsWith(`${calendarMonth}-`))
  const dailyActivities = new Map<string, StudyActivity[]>()
  markedActivities.forEach(item => dailyActivities.set(item.date, [...(dailyActivities.get(item.date) || []), item]))
  const selectedActivities = dailyActivities.get(selectedDate) || []
  const selectedDayStats = calculateDailyActivity(selectedActivities, markedActivities)
  const monthStats = calculateDailyActivity(monthActivities, markedActivities)
  const monthActiveDays = new Set(monthActivities.map(item => item.date)).size
  const [selectedYear, selectedMonthNumber, selectedDayNumber] = selectedDate.split('-').map(Number)
  const selectedDateValue = new Date(selectedYear, selectedMonthNumber - 1, selectedDayNumber)
  const selectedWeekStartValue = new Date(selectedDateValue)
  selectedWeekStartValue.setDate(selectedDateValue.getDate() - (selectedDateValue.getDay() + 6) % 7)
  const selectedWeekEndValue = new Date(selectedWeekStartValue)
  selectedWeekEndValue.setDate(selectedWeekStartValue.getDate() + 6)
  const selectedWeekStart = localDateKey(selectedWeekStartValue)
  const selectedWeekEnd = localDateKey(selectedWeekEndValue)
  const weekActivities = markedActivities.filter(item => item.date >= selectedWeekStart && item.date <= selectedWeekEnd)
  const weekStats = calculateDailyActivity(weekActivities, markedActivities)
  const weekActiveDays = new Set(weekActivities.map(item => item.date)).size
  const selectedBankGroups = orderedBanks.map(bank => ({ bank, activities: selectedActivities.filter(item => item.bankId === bank.id) })).filter(item => item.activities.length)

  function changeCalendarMonth(offset: number) {
    const next = new Date(calendarYear, calendarMonthNumber - 1 + offset, 1)
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    setCalendarMonth(nextMonth)
    setSelectedDate(`${nextMonth}-01`)
  }

  function returnToToday() { setCalendarMonth(today.slice(0, 7)); setSelectedDate(today) }

  useEffect(() => {
    if (selectedBank && selectedBank.id !== selectedBankId) onSelectedBankIdChange(selectedBank.id)
  }, [selectedBank, selectedBankId, onSelectedBankIdChange])
  useEffect(() => {
    setExpandedSectionIds(new Set())
    setQuestionPreview(null)
  }, [selectedBankId])

  return <section className="learning-dashboard">
    <div className="learning-top"><div className="learning-heading"><span>MY LEARNING</span><h1>我的学习数据</h1></div></div>
    <section className="activity-calendar-panel">
      <div className="activity-calendar-heading"><div><span>DAILY ACTIVITY</span><h2><CalendarDays size={19}/>学习日历</h2></div><div className="calendar-month-actions"><button onClick={() => changeCalendarMonth(-1)} aria-label="上个月"><ChevronLeft size={17}/></button><strong>{calendarYear} 年 {calendarMonthNumber} 月</strong><button onClick={() => changeCalendarMonth(1)} aria-label="下个月"><ChevronRight size={17}/></button><button className="calendar-today" onClick={returnToToday}>今天</button></div></div>
      <div className="activity-calendar-body">
        <div className="calendar-area">
          <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{Array.from({ length: calendarCellCount }, (_, index) => {
            const cellDate = new Date(calendarYear, calendarMonthNumber - 1, 1 - leadingDays + index)
            const date = localDateKey(cellDate)
            const day = cellDate.getDate()
            const outsideMonth = date.slice(0, 7) !== calendarMonth
            const stats = calculateDailyActivity(dailyActivities.get(date) || [], markedActivities)
            const activityLabel = stats.total ? `，学习 ${stats.total} 题，新题 ${stats.newStats.total} 题，复习 ${stats.reviewStats.total} 题` : ''
            return <button key={date} aria-label={`${cellDate.getFullYear()} 年 ${cellDate.getMonth() + 1} 月 ${day} 日${activityLabel}`} className={`calendar-day${outsideMonth ? ' outside-month' : ''}${date === selectedDate ? ' selected' : ''}${date === today ? ' today' : ''}${stats.total ? ' active' : ''}`} onClick={() => { setSelectedDate(date); if (outsideMonth) setCalendarMonth(date.slice(0, 7)) }}><span>{day}</span>{stats.total > 0 && <><strong>{stats.total} 题</strong><div className="calendar-day-bars"><ActivityProgressBar stats={stats.newStats} tone="new"/><ActivityProgressBar stats={stats.reviewStats} tone="review"/></div></>}</button>
          })}</div>
        </div>
        <aside className="calendar-summary">
          <div className="period-summary-grid"><div className="period-summary"><span>本周</span><strong>{weekStats.total}<small className="question-unit">题</small></strong><p>{weekActiveDays} 个学习日<br/>整体正确率 {formatRate(weekStats.accuracy)}</p><div className="period-type-summary">{weekStats.newStats.total > 0 && <span className="new-text">新题 {weekStats.newStats.total} · {formatRate(weekStats.newStats.accuracy)}</span>}{weekStats.reviewStats.total > 0 && <span className="review-text">复习 {weekStats.reviewStats.total} · {formatRate(weekStats.reviewStats.accuracy)}</span>}</div></div><div className="period-summary"><span>本月</span><strong>{monthStats.total}<small className="question-unit">题</small></strong><p>{monthActiveDays} 个学习日<br/>整体正确率 {formatRate(monthStats.accuracy)}</p><div className="period-type-summary">{monthStats.newStats.total > 0 && <span className="new-text">新题 {monthStats.newStats.total} · {formatRate(monthStats.newStats.accuracy)}</span>}{monthStats.reviewStats.total > 0 && <span className="review-text">复习 {monthStats.reviewStats.total} · {formatRate(monthStats.reviewStats.accuracy)}</span>}</div></div></div>
          <div className="selected-day-summary"><span>{selectedDate === today ? '今天' : `${Number(selectedDate.slice(5, 7))} 月 ${Number(selectedDate.slice(8, 10))} 日`}</span><div className="selected-day-main"><strong className={selectedDayStats.total ? undefined : 'empty'}>{selectedDayStats.total ? <>{selectedDayStats.total}<small className="question-unit">题</small></> : '暂无记录'}</strong>{selectedDayStats.total > 0 && <div className="selected-day-stats"><p>整体正确率 {formatRate(selectedDayStats.accuracy)}</p></div>}</div>{selectedDayStats.total > 0 && <div className="selected-day-type-grid"><ActivityTypeSummary label="新题" stats={selectedDayStats.newStats} tone="new"/><ActivityTypeSummary label="复习" stats={selectedDayStats.reviewStats} tone="review"/></div>}</div>
          {selectedBankGroups.length > 0 && <div className="day-bank-breakdown">{selectedBankGroups.map(({ bank, activities: bankActivities }) => { const stats = calculateDailyActivity(bankActivities, markedActivities); return <div key={bank.id}><div><span>{bank.name}</span><strong>{stats.total} 题 · 整体 {formatRate(stats.accuracy)}</strong></div>{stats.newStats.total > 0 && <small className="new-text">新题 {stats.newStats.total} 题 · 正确率 {formatRate(stats.newStats.accuracy)}</small>}{stats.reviewStats.total > 0 && <small className="review-text">复习 {stats.reviewStats.total} 题 · 正确率 {formatRate(stats.reviewStats.accuracy)}</small>}</div> })}</div>}
          {!markedActivities.length && <p className="calendar-start-note">日历记录从本次升级后开始，已有掌握标记仍保留在当前题库概况中。</p>}
        </aside>
      </div>
    </section>
    <div className="learning-metrics">
      <article><span>今日待复盘</span><strong>{todayReviewCount}<em>题</em></strong><small>{todayStats.total ? `${todayStats.wrong} 错误 · ${todayStats.vague} 模糊` : '今日暂无待复盘题目'}</small></article>
      <article><span>总体进度</span><strong>{formatRate(overallStats.completion)}</strong><small>{overallStats.marked} / {overallStats.total} 道题已标记 · 所有题库</small></article>
      <article><span>总体正确率</span><strong>{formatRate(overallStats.accuracy)}</strong><small>{overallStats.proficient} 正确 · {overallStats.vague} 模糊 · {overallStats.wrong} 错误</small></article>
    </div>
    {selectedBank && selectedStats && <section className="section-progress-panel">
      <div className="section-progress-heading"><div><span>BANK DETAILS</span><div className="section-progress-title"><h2>{selectedBank.name}</h2><label className="dashboard-bank-switch"><span>切换题库</span><ChevronDown size={12}/><select aria-label="切换题库" value={selectedBank.id} onChange={event => onSelectedBankIdChange(event.target.value)}>{orderedBanks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label></div><p>{selectedBank.chapters.length} 个章节 · {selectedStats.marked} / {selectedStats.total} 道题已标记</p></div><div className="section-progress-overview"><div><span>当前题库进度</span><strong>{formatRate(selectedStats.completion)}</strong></div><div><span>题库正确率</span><strong>{formatRate(selectedStats.accuracy)}</strong></div></div></div>
      <div className="learning-status-summary">
        <div><i/><span>当前题库未标记</span><strong>{selectedStats.unmarked}</strong></div>
        <div><i className="green"/><span>{selectedBankIsEnglish ? '正确' : '熟练'}</span><strong>{selectedStats.proficient}</strong></div>
        <div><i className="yellow"/><span>模糊</span><strong>{selectedStats.vague}</strong></div>
        <div><i className="red"/><span>{selectedBankIsEnglish ? '错误' : '错题'}</span><strong>{selectedStats.wrong}</strong></div>
      </div>
      <div className="chapter-progress-list">{selectedBank.chapters.map((chapter, chapterIndex) => {
        const chapterQuestions = chapter.sections.flatMap(section => section.questions)
        const chapterStats = calculateQuestionStats(chapterQuestions, statuses)
        return <article className="chapter-progress" key={chapter.id}>
          <div className="chapter-progress-heading"><div><span>{String(chapterIndex + 1).padStart(2, '0')}</span><strong>{chapter.name}</strong></div><div><span>{chapterStats.marked} / {chapterStats.total} 已标记</span><strong>{formatRate(chapterStats.accuracy)}</strong></div></div>
          <div className="section-progress-list">{chapter.sections.map(section => {
            const stats = calculateQuestionStats(section.questions, statuses)
            const expanded = expandedSectionIds.has(section.id)
            return <div className="section-progress-item" key={section.id}>
              <button className="section-progress-row" aria-expanded={expanded} onClick={() => setExpandedSectionIds(previous => { const next = new Set(previous); if (expanded) next.delete(section.id); else next.add(section.id); return next })}>
                <div><strong>{section.name}<ChevronDown className={expanded ? 'rotated' : ''} size={14}/></strong><small>{stats.marked} / {stats.total} 道已标记</small></div>
                <MasteryProgressBar stats={stats} label={section.name} binaryMode={selectedBankIsEnglish}/>
                <div className="section-progress-rate"><span>正确率</span><strong>{formatRate(stats.accuracy)}</strong></div>
                <div className="section-progress-counts"><span className="green-text">{stats.proficient} 正确</span><span className="yellow-text">{stats.vague} 模糊</span><span className="red-text">{stats.wrong} 错误</span></div>
              </button>
              {expanded && <div className="section-question-details"><div className="section-question-heading"><strong>题号情况</strong><div><span><i/>未标记</span><span><i className="green"/>{selectedBankIsEnglish ? '正确' : '熟练'}</span>{!selectedBankIsEnglish && <span><i className="yellow"/>模糊</span>}<span><i className="red"/>{selectedBankIsEnglish ? '错误' : '错题'}</span></div></div><div className="section-question-grid">{[...section.questions].sort((left, right) => left.number - right.number).map(question => { const rawStatus = statuses[question.id] || 'none'; const status = selectedBankIsEnglish && rawStatus === 'vague' ? 'none' : rawStatus; return <div className="section-question-item" key={question.id}><button className={status} aria-current={questionPreview?.question.id === question.id ? 'true' : undefined} title={`第 ${question.number} 题 · ${status === 'proficient' ? selectedBankIsEnglish ? '正确' : '熟练' : status === 'vague' ? '模糊' : status === 'wrong' ? selectedBankIsEnglish ? '错误' : '错题' : '未标记'}`} onClick={event => { event.stopPropagation(); setQuestionPreview({ bank: selectedBank, chapterName: chapter.name, sectionName: section.name, questions: [...section.questions].sort((left, right) => left.number - right.number), question }) }}>{question.number}</button></div> })}</div></div>}
            </div>
          })}</div>
        </article>
      })}{selectedBank.chapters.length === 0 && <div className="section-progress-empty">该题库还没有章节数据</div>}</div>
    </section>}
    {questionPreview && <DashboardQuestionDialog bankName={questionPreview.bank.name} chapterName={questionPreview.chapterName} sectionName={questionPreview.sectionName} question={questionPreview.question} questions={questionPreview.questions} questionStatuses={statuses} status={statuses[questionPreview.question.id] || 'none'} activities={activities} note={notes[questionPreview.question.id]} binaryMode={bankSubject(questionPreview.bank) === 'english'} onQuestionSelect={question => setQuestionPreview(current => current ? { ...current, question } : current)} onPreviousQuestion={() => setQuestionPreview(current => { if (!current) return current; const index = current.questions.findIndex(item => item.id === current.question.id); return { ...current, question: current.questions[Math.max(0, index - 1)] } })} onNextQuestion={() => setQuestionPreview(current => { if (!current) return current; const index = current.questions.findIndex(item => item.id === current.question.id); return { ...current, question: current.questions[Math.min(current.questions.length - 1, index + 1)] } })} onStatusChange={(status, answerRevealed) => onQuestionStatusChange(questionPreview.bank.id, questionPreview.question.id, status, answerRevealed)} onReviewStatusChange={(status, answerRevealed) => onQuestionReviewStatusChange(questionPreview.bank.id, questionPreview.question.id, status, answerRevealed)} onResetReview={() => onQuestionReviewReset(questionPreview.bank.id, questionPreview.question.id)} onNoteChange={note => onQuestionNoteChange(questionPreview.question.id, note)} onClose={() => setQuestionPreview(null)}/>}
  </section>
}
