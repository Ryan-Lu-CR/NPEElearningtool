import { useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import type { Question, QuestionBank, QuestionStatus } from './types'
import { sortBanksForDisplay } from './bankSorting'
import { calculateLearningStats, calculateQuestionStats, formatRate } from './learningStats'
import { calculateDailyActivity, localDateKey, type StudyActivity } from './studyActivity'
import DashboardQuestionDialog from './DashboardQuestionDialog'

interface LearningDashboardProps {
  banks: QuestionBank[]
  statuses: Record<string, QuestionStatus>
  activities: StudyActivity[]
  selectedBankId: string
  onSelectedBankIdChange: (bankId: string) => void
  onQuestionStatusChange: (bankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) => void
}

interface DashboardQuestionPreview {
  bank: QuestionBank
  chapterName: string
  sectionName: string
  question: Question
}

const bankSubject = (bank: QuestionBank) => bank.id.startsWith('english-') || /英语/i.test(bank.name) ? '英语' : '数学'

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

export default function LearningDashboard({ banks, statuses, activities, selectedBankId, onSelectedBankIdChange, onQuestionStatusChange }: LearningDashboardProps) {
  const orderedBanks = [...sortBanksForDisplay(banks.filter(bank => bankSubject(bank) === '数学')), ...sortBanksForDisplay(banks.filter(bank => bankSubject(bank) === '英语'))]
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set())
  const [questionMenuId, setQuestionMenuId] = useState<string | null>(null)
  const [questionPreview, setQuestionPreview] = useState<DashboardQuestionPreview | null>(null)
  const today = localDateKey()
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today)
  const selectedBank = orderedBanks.find(bank => bank.id === selectedBankId) || orderedBanks[0]
  const selectedBankIsEnglish = selectedBank ? bankSubject(selectedBank) === '英语' : false
  const selectedStats = selectedBank ? calculateLearningStats([selectedBank], statuses) : null
  const [calendarYear, calendarMonthNumber] = calendarMonth.split('-').map(Number)
  const firstDay = new Date(calendarYear, calendarMonthNumber - 1, 1)
  const leadingDays = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(calendarYear, calendarMonthNumber, 0).getDate()
  const markedActivities = activities.filter(item => item.status !== 'none')
  const todayActivities = markedActivities.filter(item => item.date === today)
  const todayStats = calculateDailyActivity(todayActivities)
  const todayBankCount = new Set(todayActivities.map(item => item.bankId)).size
  const todayReviewCount = todayStats.vague + todayStats.wrong
  const monthActivities = markedActivities.filter(item => item.date.startsWith(`${calendarMonth}-`))
  const dailyActivities = new Map<string, StudyActivity[]>()
  monthActivities.forEach(item => dailyActivities.set(item.date, [...(dailyActivities.get(item.date) || []), item]))
  const selectedActivities = dailyActivities.get(selectedDate) || []
  const selectedDayStats = calculateDailyActivity(selectedActivities)
  const monthStats = calculateDailyActivity(monthActivities)
  const activeDays = dailyActivities.size
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
  useEffect(() => { setExpandedSectionIds(new Set()) }, [selectedBankId])

  return <section className="learning-dashboard" onClick={() => setQuestionMenuId(null)}>
    <div className="learning-top"><div className="learning-heading"><span>MY LEARNING</span><h1>我的学习数据</h1><p>正确率仅按已标记题目计算，未标记题目不会影响结果。</p></div>
      <label className="dashboard-bank-picker"><span>查看题库详情</span><select value={selectedBank?.id || ''} onChange={event => onSelectedBankIdChange(event.target.value)}>{orderedBanks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>
    </div>
    <section className="activity-calendar-panel">
      <div className="activity-calendar-heading"><div><span>DAILY ACTIVITY</span><h2><CalendarDays size={19}/>学习日历</h2><p>同一道题同一天只统计一次，以当天最终标记状态为准。</p></div><div className="calendar-month-actions"><button onClick={() => changeCalendarMonth(-1)} aria-label="上个月"><ChevronLeft size={17}/></button><strong>{calendarYear} 年 {calendarMonthNumber} 月</strong><button onClick={() => changeCalendarMonth(1)} aria-label="下个月"><ChevronRight size={17}/></button><button className="calendar-today" onClick={returnToToday}>今天</button></div></div>
      <div className="activity-calendar-body">
        <div className="calendar-area">
          <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{Array.from({ length: leadingDays }, (_, index) => <span className="calendar-day empty" key={`empty-${index}`}/>)}{Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            const date = `${calendarMonth}-${String(day).padStart(2, '0')}`
            const stats = calculateDailyActivity(dailyActivities.get(date) || [])
            return <button key={date} className={`calendar-day${date === selectedDate ? ' selected' : ''}${date === today ? ' today' : ''}${stats.total ? ' active' : ''}`} onClick={() => setSelectedDate(date)}><span>{day}</span>{stats.total > 0 && <><strong>{stats.total} 题</strong><i><b className="green" style={{ flex: stats.proficient }}/><b className="yellow" style={{ flex: stats.vague }}/><b className="red" style={{ flex: stats.wrong }}/></i></>}</button>
          })}</div>
        </div>
        <aside className="calendar-summary">
          <div className="month-summary"><span>本月学习</span><strong>{monthStats.total}<small>题</small></strong><p>{activeDays} 个学习日 · 正确率 {formatRate(monthStats.accuracy)}</p></div>
          <div className="selected-day-summary"><span>{selectedDate === today ? '今天' : `${Number(selectedDate.slice(5, 7))} 月 ${Number(selectedDate.slice(8, 10))} 日`}</span><strong>{selectedDayStats.total ? `${selectedDayStats.total} 题` : '暂无记录'}</strong>{selectedDayStats.total > 0 && <><p>正确率 {formatRate(selectedDayStats.accuracy)}</p><div><span className="green-text">{selectedDayStats.proficient} 正确</span><span className="yellow-text">{selectedDayStats.vague} 模糊</span><span className="red-text">{selectedDayStats.wrong} 错误</span></div></>}</div>
          {selectedBankGroups.length > 0 && <div className="day-bank-breakdown">{selectedBankGroups.map(({ bank, activities: bankActivities }) => { const stats = calculateDailyActivity(bankActivities); return <div key={bank.id}><span>{bank.name}</span><strong>{stats.total} 题 · {formatRate(stats.accuracy)}</strong></div> })}</div>}
          {!markedActivities.length && <p className="calendar-start-note">日历记录从本次升级后开始，已有掌握标记仍保留在当前题库概况中。</p>}
        </aside>
      </div>
    </section>
    <div className="learning-metrics">
      <article><span>今日练习</span><strong>{todayStats.total}<em>题</em></strong><small>{todayStats.total ? `涉及 ${todayBankCount} 个题库 · ${todayStats.proficient} 题正确` : '今天还没有学习记录'}</small></article>
      <article><span>今日正确率</span><strong>{formatRate(todayStats.accuracy)}</strong><small>{todayStats.total ? `${todayStats.proficient} / ${todayStats.total} 道今日练习` : '完成今日练习后开始统计'}</small></article>
      <article><span>今日待复盘</span><strong>{todayReviewCount}<em>题</em></strong><small>{todayStats.total ? `${todayStats.wrong} 错误 · ${todayStats.vague} 模糊` : '今日暂无待复盘题目'}</small></article>
      <article><span>当前题库进度</span><strong>{formatRate(selectedStats?.completion ?? null)}</strong><small>{selectedStats ? `${selectedStats.marked} / ${selectedStats.total} 道题已标记` : '暂无题库数据'}</small></article>
    </div>
    <div className="learning-status-summary">
      <div><i/><span>当前题库未标记</span><strong>{selectedStats?.unmarked ?? 0}</strong></div>
      <div><i className="green"/><span>{selectedBankIsEnglish ? '正确' : '熟练'}</span><strong>{selectedStats?.proficient ?? 0}</strong></div>
      <div><i className="yellow"/><span>模糊</span><strong>{selectedStats?.vague ?? 0}</strong></div>
      <div><i className="red"/><span>{selectedBankIsEnglish ? '错误' : '错题'}</span><strong>{selectedStats?.wrong ?? 0}</strong></div>
    </div>
    {selectedBank && selectedStats && <section className="section-progress-panel">
      <div className="section-progress-heading"><div><span>BANK DETAILS</span><h2>{selectedBank.name}</h2><p>{selectedBank.chapters.length} 个章节 · {selectedStats.marked} / {selectedStats.total} 道题已标记</p></div><div><span>题库正确率</span><strong>{formatRate(selectedStats.accuracy)}</strong></div></div>
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
              {expanded && <div className="section-question-details"><div className="section-question-heading"><strong>题号情况</strong><div><span><i/>未标记</span><span><i className="green"/>{selectedBankIsEnglish ? '正确' : '熟练'}</span>{!selectedBankIsEnglish && <span><i className="yellow"/>模糊</span>}<span><i className="red"/>{selectedBankIsEnglish ? '错误' : '错题'}</span></div></div><div className="section-question-grid">{[...section.questions].sort((left, right) => left.number - right.number).map(question => { const rawStatus = statuses[question.id] || 'none'; const status = selectedBankIsEnglish && rawStatus === 'vague' ? 'none' : rawStatus; return <div className="section-question-item" key={question.id} onClick={event => event.stopPropagation()}><button className={status} aria-haspopup="menu" aria-expanded={questionMenuId === question.id} title={`第 ${question.number} 题 · ${status === 'proficient' ? selectedBankIsEnglish ? '正确' : '熟练' : status === 'vague' ? '模糊' : status === 'wrong' ? selectedBankIsEnglish ? '错误' : '错题' : '未标记'}`} onClick={() => setQuestionMenuId(current => current === question.id ? null : question.id)}>{question.number}</button>{questionMenuId === question.id && <div className="question-number-popover" role="menu"><span>第 {question.number} 题</span><button role="menuitem" onClick={() => { setQuestionPreview({ bank: selectedBank, chapterName: chapter.name, sectionName: section.name, question }); setQuestionMenuId(null) }}><Eye size={14}/>查看题目</button></div>}</div> })}</div></div>}
            </div>
          })}</div>
        </article>
      })}{selectedBank.chapters.length === 0 && <div className="section-progress-empty">该题库还没有章节数据</div>}</div>
    </section>}
    {questionPreview && <DashboardQuestionDialog bankName={questionPreview.bank.name} chapterName={questionPreview.chapterName} sectionName={questionPreview.sectionName} question={questionPreview.question} status={statuses[questionPreview.question.id] || 'none'} binaryMode={bankSubject(questionPreview.bank) === '英语'} onStatusChange={(status, answerRevealed) => onQuestionStatusChange(questionPreview.bank.id, questionPreview.question.id, status, answerRevealed)} onClose={() => setQuestionPreview(null)}/>}
  </section>
}
