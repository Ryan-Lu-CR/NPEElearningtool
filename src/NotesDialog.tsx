import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, FileText, NotebookPen, Search, X } from 'lucide-react'
import type { Chapter, Question, QuestionBank, Section } from './types'
import { bankSubject, subjectLabels } from './subjects'
import { canvasHeightForDrawing, pathsForStroke } from './QuestionNotePanel'
import { DRAWING_WIDTH, type QuestionNote, type QuestionNotes } from './questionNotes'

type NotesFilter = 'all' | 'text' | 'handwriting'

interface NoteEntry {
  questionId: string
  bank?: QuestionBank
  chapter?: Chapter
  section?: Section
  question?: Question
  note: QuestionNote
}

interface NoteGroup {
  key: string
  subjectLabel: string
  bankName: string
  chapterName: string
  sectionName: string
  entries: NoteEntry[]
}

interface BankNoteGroup {
  key: string
  bankId?: string
  subjectLabel: string
  bankName: string
  entries: NoteEntry[]
  sections: NoteGroup[]
}

interface NotesDialogProps {
  banks: QuestionBank[]
  notes: QuestionNotes
  onClose: () => void
  onOpenQuestion: (bankId: string, questionId: string) => void
}

const noteHasText = (note: QuestionNote) => Boolean(note.text.trim())
const noteHasDrawing = (note: QuestionNote) => Boolean(note.drawing?.strokes.length)

function noteTypeLabel(note: QuestionNote) {
  if (noteHasText(note) && noteHasDrawing(note)) return '文字 + 手写'
  if (noteHasDrawing(note)) return '手写笔记'
  return '文字笔记'
}

function noteMatchesFilter(note: QuestionNote, filter: NotesFilter) {
  if (filter === 'text') return noteHasText(note)
  if (filter === 'handwriting') return noteHasDrawing(note)
  return true
}

function formatNoteDate(value: string) {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function questionPreview(question: Question | undefined) {
  if (!question) return '这条笔记对应的题目已不在当前题库中。'
  const text = question.text.trim()
  if (!text || text === `第 ${question.number} 题`) return `第 ${question.number} 题`
  return text
}

function buildNoteEntries(banks: QuestionBank[], notes: QuestionNotes): NoteEntry[] {
  const linkedQuestionIds = new Set<string>()
  const linkedEntries: NoteEntry[] = banks.flatMap(bank => bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions.flatMap(question => {
    const note = notes[question.id]
    if (!note || linkedQuestionIds.has(question.id)) return []
    linkedQuestionIds.add(question.id)
    return [{ questionId: question.id, bank, chapter, section, question, note }]
  }))))
  const orphanEntries: NoteEntry[] = Object.entries(notes)
    .filter(([questionId]) => !linkedQuestionIds.has(questionId))
    .map(([questionId, note]) => ({ questionId, note }))
  return [...linkedEntries, ...orphanEntries]
}

function groupNoteEntries(entries: NoteEntry[]) {
  const grouped = new Map<string, NoteGroup>()
  entries.forEach(entry => {
    const key = entry.bank && entry.chapter && entry.section
      ? `${entry.bank.id}/${entry.chapter.id}/${entry.section.id}`
      : 'orphan-notes'
    const group = grouped.get(key) || {
      key,
      subjectLabel: entry.bank ? subjectLabels[bankSubject(entry.bank)] : '其他',
      bankName: entry.bank?.name || '未归档笔记',
      chapterName: entry.chapter?.name || '题库已移除或题目已更新',
      sectionName: entry.section?.name || '这些笔记仍保存在本地，但暂时无法定位原题',
      entries: [],
    }
    group.entries.push(entry)
    grouped.set(key, group)
  })
  return [...grouped.values()]
}

function groupBankEntries(entries: NoteEntry[]) {
  const grouped = new Map<string, BankNoteGroup>()
  entries.forEach(entry => {
    const key = entry.bank?.id || 'orphan-notes'
    const group = grouped.get(key) || {
      key,
      bankId: entry.bank?.id,
      subjectLabel: entry.bank ? subjectLabels[bankSubject(entry.bank)] : '其他',
      bankName: entry.bank?.name || '未归档笔记',
      entries: [],
      sections: [],
    }
    group.entries.push(entry)
    grouped.set(key, group)
  })
  return [...grouped.values()].map(group => ({ ...group, sections: groupNoteEntries(group.entries) }))
}

function NotesDrawing({ note }: { note: QuestionNote }) {
  if (!noteHasDrawing(note)) return null
  const height = canvasHeightForDrawing(note.drawing)
  return <div className="notes-stream-drawing">
    <svg viewBox={`0 0 ${DRAWING_WIDTH} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="完整手写笔记">
      {note.drawing.strokes.flatMap(stroke => pathsForStroke(stroke).map((path, index) => <path key={`${stroke.id}-${index}`} d={path.d} fill="none" stroke={stroke.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>))}
    </svg>
  </div>
}

function NoteStreamCard({ entry, onOpenQuestion }: { entry: NoteEntry; onOpenQuestion: (bankId: string, questionId: string) => void }) {
  const canOpen = Boolean(entry.bank && entry.question)
  return <article className={canOpen ? 'notes-stream-card' : 'notes-stream-card notes-stream-card-orphan'}>
    <header>
      <div className="notes-stream-card-title"><span>{entry.question ? `第 ${entry.question.number} 题` : '未归档题目'}</span><strong>{noteTypeLabel(entry.note)}</strong><time dateTime={entry.note.updatedAt || undefined}>{formatNoteDate(entry.note.updatedAt)}</time></div>
      {canOpen && <button className="notes-stream-open" type="button" onClick={() => onOpenQuestion(entry.bank!.id, entry.question!.id)}><BookOpen size={14}/>查看原题<ArrowUpRight size={14}/></button>}
    </header>
    <p className="notes-stream-question">{questionPreview(entry.question)}</p>
    {noteHasText(entry.note) && <div className="notes-stream-text">{entry.note.text}</div>}
    <NotesDrawing note={entry.note}/>
  </article>
}

const anchorIdFor = (key: string) => `notes-stream-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

export default function NotesDialog({ banks, notes, onClose, onOpenQuestion }: NotesDialogProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NotesFilter>('all')
  const [activeBankId, setActiveBankId] = useState('')
  const [activeSectionKey, setActiveSectionKey] = useState('')
  const [sectionScrollRequest, setSectionScrollRequest] = useState(0)
  const detailScrollRef = useRef<HTMLElement | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const hasInitialisedSectionScroll = useRef(false)
  const pendingSectionScroll = useRef(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const entries = useMemo(() => buildNoteEntries(banks, notes), [banks, notes])
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries.filter(entry => {
      if (!noteMatchesFilter(entry.note, filter)) return false
      if (!normalizedQuery) return true
      const searchText = [entry.bank?.name, entry.chapter?.name, entry.section?.name, entry.question?.text, entry.note.text, noteTypeLabel(entry.note)]
        .filter(Boolean).join(' ').toLowerCase()
      return searchText.includes(normalizedQuery)
    })
  }, [entries, filter, query])
  const bankGroups = useMemo(() => groupBankEntries(filteredEntries), [filteredEntries])

  useEffect(() => {
    if (bankGroups.some(group => group.key === activeBankId)) return
    setActiveBankId(bankGroups[0]?.key || '')
  }, [activeBankId, bankGroups])

  const activeBankGroup = bankGroups.find(group => group.key === activeBankId) || bankGroups[0]
  useEffect(() => {
    const firstSectionKey = activeBankGroup?.sections[0]?.key || ''
    if (!activeBankGroup?.sections.some(section => section.key === activeSectionKey)) setActiveSectionKey(firstSectionKey)
  }, [activeBankGroup, activeSectionKey])
  useEffect(() => {
    if (!activeSectionKey || !activeBankGroup?.sections.some(section => section.key === activeSectionKey)) return
    if (!hasInitialisedSectionScroll.current) {
      hasInitialisedSectionScroll.current = true
      return
    }
    if (!pendingSectionScroll.current) return
    pendingSectionScroll.current = false
    window.requestAnimationFrame(() => {
      const container = detailScrollRef.current
      const target = container?.querySelector<HTMLElement>(`#${anchorIdFor(activeSectionKey)}`)
      if (!container || !target) return
      const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top - 14
      container.scrollBy({ top: offset, behavior: 'smooth' })
    })
  }, [activeBankGroup, activeSectionKey, sectionScrollRequest])

  useEffect(() => {
    const container = detailScrollRef.current
    if (!container || !activeBankGroup) return
    let frame = 0
    const syncNavigation = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const sections = Array.from(container.querySelectorAll<HTMLElement>('.notes-stream-section'))
        if (!sections.length) return
        const containerTop = container.getBoundingClientRect().top
        const activationLine = Math.min(120, container.clientHeight * .28)
        let activeIndex = 0
        sections.forEach((section, index) => {
          if (section.getBoundingClientRect().top - containerTop <= activationLine) activeIndex = index
        })
        const nextKey = activeBankGroup.sections[activeIndex]?.key
        if (nextKey) setActiveSectionKey(currentKey => currentKey === nextKey ? currentKey : nextKey)
      })
    }
    container.addEventListener('scroll', syncNavigation, { passive: true })
    syncNavigation()
    return () => {
      container.removeEventListener('scroll', syncNavigation)
      window.cancelAnimationFrame(frame)
    }
  }, [activeBankGroup])

  useEffect(() => {
    const nav = navRef.current
    if (!nav || !activeSectionKey) return
    const activeButton = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-note-section]'))
      .find(button => button.dataset.noteSection === activeSectionKey)
    const sidebar = nav.closest<HTMLElement>('.notes-sidebar')
    if (!activeButton || !sidebar) return
    const sidebarBounds = sidebar.getBoundingClientRect()
    const buttonBounds = activeButton.getBoundingClientRect()
    const visibleTop = sidebarBounds.top + 12
    const visibleBottom = sidebarBounds.bottom - 12
    if (buttonBounds.top < visibleTop) sidebar.scrollBy({ top: buttonBounds.top - visibleTop, behavior: 'smooth' })
    else if (buttonBounds.bottom > visibleBottom) sidebar.scrollBy({ top: buttonBounds.bottom - visibleBottom, behavior: 'smooth' })
  }, [activeBankGroup, activeSectionKey])

  const textCount = entries.filter(entry => noteHasText(entry.note)).length
  const handwritingCount = entries.filter(entry => noteHasDrawing(entry.note)).length

  function selectSection(bankGroup: BankNoteGroup, section: NoteGroup) {
    pendingSectionScroll.current = true
    setSectionScrollRequest(request => request + 1)
    setActiveBankId(bankGroup.key)
    setActiveSectionKey(section.key)
  }

  function selectBank(bankGroup: BankNoteGroup) {
    pendingSectionScroll.current = true
    setSectionScrollRequest(request => request + 1)
    setActiveBankId(bankGroup.key)
    setActiveSectionKey(bankGroup.sections[0]?.key || '')
  }

  return <div className="notes-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="notes-dialog" role="dialog" aria-modal="true" aria-labelledby="notes-dialog-title" onClick={event => event.stopPropagation()}>
      <header className="notes-dialog-header">
        <div className="notes-dialog-title">
          <span className="notes-dialog-icon"><NotebookPen/></span>
          <div><span>STUDY NOTES</span><h2 id="notes-dialog-title">我的笔记</h2></div>
        </div>
        {activeBankGroup && <div className="notes-dialog-context" aria-live="polite"><span>{activeBankGroup.subjectLabel} · NOTE STREAM</span><strong>{activeBankGroup.bankName}</strong><small>共 {activeBankGroup.entries.length} 条笔记</small></div>}
        <button className="notes-dialog-close" type="button" aria-label="关闭我的笔记" onClick={onClose}><X/></button>
      </header>
      <div className="notes-dialog-body">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-summary"><div><strong>{entries.length}</strong><span>条笔记</span></div><small>{bankGroups.length} 个题库</small><div className="notes-sidebar-types"><span><FileText size={12}/>文字 {textCount}</span><span><NotebookPen size={12}/>手写 {handwritingCount}</span></div></div>
          <div className="notes-sidebar-tools">
            <label className="notes-search"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索笔记" aria-label="搜索笔记"/></label>
            <select value={filter} onChange={event => setFilter(event.target.value as NotesFilter)} aria-label="笔记类型筛选"><option value="all">全部笔记</option><option value="text">文字笔记</option><option value="handwriting">手写笔记</option></select>
          </div>
          <div className="notes-nav-label"><span>NOTE NAVIGATION</span><strong>题库导航</strong></div>
          {bankGroups.length > 0
            ? <nav ref={navRef} className="notes-nav-groups" aria-label="题库笔记导航">{bankGroups.map(bankGroup => <section className={bankGroup.key === activeBankGroup?.key ? 'notes-nav-bank active' : 'notes-nav-bank'} key={bankGroup.key}>
              <button className="notes-nav-bank-heading" type="button" onClick={() => selectBank(bankGroup)}><span><small>{bankGroup.subjectLabel}</small><strong>{bankGroup.bankName}</strong></span><em>{bankGroup.entries.length}</em></button>
              <div>{bankGroup.sections.map(section => <button className={section.key === activeSectionKey && bankGroup.key === activeBankGroup?.key ? 'notes-nav-section active' : 'notes-nav-section'} data-note-section={section.key} type="button" key={section.key} onClick={() => selectSection(bankGroup, section)}><span><strong>{section.chapterName}</strong><small>{section.sectionName}</small></span><em>{section.entries.length}</em></button>)}</div>
            </section>)}</nav>
            : <div className="notes-sidebar-empty"><NotebookPen size={22}/><span>{entries.length ? '没有匹配的笔记' : '还没有保存的笔记'}</span></div>}
        </aside>
        <main ref={detailScrollRef} className="notes-detail-scroll">
          {activeBankGroup
            ? <div className="notes-stream"><div className="notes-stream-sections">{activeBankGroup.sections.map(section => <section className="notes-stream-section" id={anchorIdFor(section.key)} key={section.key}><header><div><span>{section.chapterName}</span><strong>{section.sectionName}</strong></div><em>{section.entries.length} 条</em></header><div className="notes-stream-list">{section.entries.map(entry => <NoteStreamCard key={entry.questionId} entry={entry} onOpenQuestion={onOpenQuestion}/>)}</div></section>)}</div>
            </div>
            : <div className="notes-detail-placeholder"><NotebookPen size={34}/><strong>选择一个题库</strong><p>从左侧选择题库后，这里会连续显示该题库中的所有笔记。</p></div>}
        </main>
      </div>
    </section>
  </div>
}
