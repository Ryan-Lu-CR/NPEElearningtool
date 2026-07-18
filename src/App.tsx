import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, BookOpen, CalendarDays, ChevronDown, ChevronRight, CircleHelp, Download, FileImage, FileText, FileUp, Filter, FolderOpen, FolderSync, Menu, Pencil, Plus, RotateCcw, Search, Settings as SettingsIcon, X } from 'lucide-react'
import type { Question, QuestionBank, QuestionStatus, ReadingQuestionType, Section, Subject } from './types'
import { loadBanks, loadNavigation, renameBank, renameChapter, saveBanks, saveNavigation, validateBanks } from './store'
import { deleteAssets } from './assets'
import AssetGallery from './AssetGallery'
import ExportDialog, { ExportPage, waitForExportContent, type ExportJob } from './ExportDialog'
import SettingsDialog from './SettingsDialog'
import { assetKeysForBank, clearQuestionStatuses, orderedQuestionEntriesForBank, questionIdsForBank, removeBank, resetBankData } from './bankManagement'
import { builtInBanks, defaultBankIds, englishBanks } from './data'
import { mergeImageEntries } from './imageImport'
import { BUILTIN_ENGLISH_VERSION, chooseWorkspace, clearWorkspaceHandle, createBankFolder, hasWorkspacePermission, isMissingWorkspaceError, loadWorkspaceHandle, readDefaultWorkspace, readWorkspaceManifest, readWorkspaceUserData, removeBankFolder, resolveWorkspaceUserData, safeFolderName, scanWorkspaceImages, writeDefaultWorkspaceManifest, writeDefaultWorkspaceUserData, writeWorkspaceManifest, writeWorkspaceUserData } from './workspace'
import { formatPassageParagraphs } from './passageFormatting'
import { isImageAnswerPlaceholder } from './questionPresentation'
import { sortBanksForDisplay } from './bankSorting'
import LearningDashboard from './LearningDashboard'
import { updateStudyActivity } from './studyActivity'
import { buildQuestionReviewTimeline, updateQuestionReview } from './questionReview'
import { calculateLearningStats, calculateQuestionStats, formatRate } from './learningStats'
import { resolveNavigation, resolveProfileBankId, type SavedNavigation } from './navigationRestore'
import { removeRetiredBanks } from './bankMigration'
import { formatExamDateValue, getExamCountdown, parseExamDateValue } from './examCountdown'
import { DEFAULT_USER_SETTINGS, loadUserSettings, saveUserSettings, validateUserSettings } from './userSettings'
import { countMarkedQuestions, emptyStudyRound, getStudyRound, loadStudyRounds, migrateStudyRounds, saveStudyRounds, updateStudyRound } from './studyRounds'
import QuestionNotePanel from './QuestionNotePanel'
import { hasQuestionNote, loadQuestionNotes, saveQuestionNotes, validateQuestionNotes, type QuestionNote, type QuestionNotes } from './questionNotes'
import { bankSubject, subjectLabels } from './subjects'
import { englishSectionLabel, groupEnglishSections, type EnglishSectionGroupKey } from './englishNavigation'

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '熟练', icon: '✓' }, vague: { label: '模糊', icon: '?' }, wrong: { label: '错误', icon: '×' }
}
const binaryStatusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '正确', icon: '✓' }, vague: { label: '未标记', icon: '○' }, wrong: { label: '错误', icon: '×' }
}
const readingTypeMeta: Array<{ value: ReadingQuestionType; label: string }> = [
  { value: 'detail', label: '细节题' },
  { value: 'example', label: '例证题' },
  { value: 'main-idea', label: '主旨题' },
  { value: 'attitude', label: '态度题' },
  { value: 'inference', label: '推断题' },
  { value: 'vocabulary', label: '词汇题' },
]
const isReadingTypeQuestion = (item?: Question) => item?.type === '阅读理解 Part A'
const isBinaryMasteryQuestion = (item?: Question) => item?.type === '完形填空' || item?.type === '阅读理解 Part A' || item?.type === '阅读理解 Part B'
const effectiveQuestionStatus = (item: Question | undefined, status: QuestionStatus, binaryMode = isBinaryMasteryQuestion(item)): QuestionStatus => binaryMode && status === 'vague' ? 'none' : status
const questionStatusMeta = (item: Question | undefined, status: QuestionStatus, binaryMode = isBinaryMasteryQuestion(item)) => binaryMode ? binaryStatusMeta[status] : statusMeta[status]
const masteryChoices = (item?: Question, binaryMode = isBinaryMasteryQuestion(item)): QuestionStatus[] => binaryMode ? ['proficient', 'wrong'] : ['proficient', 'vague', 'wrong']

function navigationProgress(questions: Question[], statuses: Record<string, QuestionStatus>, binaryMode: boolean) {
  const marked = questions.reduce((count, question) => count + (effectiveQuestionStatus(question, statuses[question.id] || 'none', binaryMode) === 'none' ? 0 : 1), 0)
  return { marked, total: questions.length, label: questions.length ? `${marked}/${questions.length}` : '—' }
}

type BankQuestionEntry = ReturnType<typeof orderedQuestionEntriesForBank>[number]
type SidebarSectionGroup = { key: EnglishSectionGroupKey | 'all'; label: string; sections: Section[] }
const protectedBankIds = new Set<string>(defaultBankIds)
const githubRepositoryUrl = 'https://github.com/EnderRayven/NPEElearningtool'
const GitHubMark = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.22c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.58-.29-5.29-1.29-5.29-5.68 0-1.25.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.75 0C17.03 5.02 18 5.33 18 5.33c.63 1.58.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.09 0 4.41-2.72 5.38-5.31 5.67.42.36.79 1.07.79 2.16v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>

export default function App() {
  const [banks, setBanks] = useState(loadBanks)
  const [userSettings, setUserSettings] = useState(loadUserSettings)
  const [studyRounds, setStudyRounds] = useState(loadStudyRounds)
  const initialRound = getStudyRound(studyRounds, userSettings.activeRound)
  const [statuses, setStatuses] = useState(() => initialRound.statuses)
  const [activities, setActivities] = useState(() => initialRound.activities)
  const [questionNotes, setQuestionNotes] = useState<QuestionNotes>({})
  const [notesReady, setNotesReady] = useState(false)
  const [bankId, setBankId] = useState(banks[0]?.id || '')
  const [sectionId, setSectionId] = useState(banks[0]?.chapters[0]?.sections[0]?.id || '')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [expandedPassageAnswers, setExpandedPassageAnswers] = useState<Set<string>>(() => new Set())
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set(banks[0]?.chapters[0] ? [banks[0].chapters[0].id] : []))
  const [filter, setFilter] = useState<QuestionStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [activePage, setActivePage] = useState<'study' | 'profile'>('study')
  const [profileBankId, setProfileBankId] = useState('')
  const [view, setView] = useState<'section' | 'wrong'>('section')
  const [toast, setToast] = useState('')
  const [printMode, setPrintMode] = useState(false)
  const [printJob, setPrintJob] = useState<ExportJob | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newBankOpen, setNewBankOpen] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [newBankSubject, setNewBankSubject] = useState<Subject>('math')
  const [namingHelpOpen, setNamingHelpOpen] = useState(false)
  const [settingsToolsOpen, setSettingsToolsOpen] = useState(false)
  const [countdownNow, setCountdownNow] = useState(() => new Date())
  const [renameTarget, setRenameTarget] = useState<{ kind: 'bank' | 'chapter'; id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [navigationReady, setNavigationReady] = useState(false)
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceState, setWorkspaceState] = useState<'none' | 'available' | 'syncing' | 'connected' | 'error'>('none')
  const [workspaceFolders, setWorkspaceFolders] = useState<Record<string, string>>({})
  const [defaultWorkspaceConnected, setDefaultWorkspaceConnected] = useState(false)
  const workspaceReady = useRef(false)
  const notesLoaded = useRef(false)
  const studyPositions = useRef<Partial<Record<Subject, SavedNavigation>>>({})
  const importRef = useRef<HTMLInputElement>(null)
  const imageImportRef = useRef<HTMLInputElement>(null)
  const printSheetRef = useRef<HTMLElement>(null)
  const settingsToolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!saveBanks(banks)) setToast('浏览器存储空间不足，题库修改尚未保存；请连接题库文件夹或先导出备份') }, [banks])
  useEffect(() => {
    const rounds = updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
    if (!saveStudyRounds(rounds)) setToast('学习轮次保存失败，请先导出备份后检查浏览器存储空间')
  }, [studyRounds, userSettings.activeRound, statuses, activities])
  useEffect(() => { if (!saveUserSettings(userSettings)) setToast('用户设置保存失败，请检查浏览器存储空间') }, [userSettings])
  useEffect(() => {
    let cancelled = false
    loadQuestionNotes().then(savedNotes => {
      if (cancelled || notesLoaded.current) return
      notesLoaded.current = true
      setQuestionNotes(savedNotes)
      setNotesReady(true)
    }).catch(() => setToast('笔记读取失败，请检查浏览器存储空间'))
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!notesReady) return
    const timer = window.setTimeout(() => {
      saveQuestionNotes(questionNotes).catch(() => setToast('笔记保存失败，请先导出完整备份'))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [questionNotes, notesReady])
  useEffect(() => { const timer = window.setInterval(() => setCountdownNow(new Date()), 60 * 60 * 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    if (!settingsToolsOpen) return
    const closeOnOutside = (event: PointerEvent) => { if (!settingsToolsRef.current?.contains(event.target as Node)) setSettingsToolsOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsToolsOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [settingsToolsOpen])
  useEffect(() => {
    loadWorkspaceHandle().then(async handle => {
      if (!handle) { await loadDefaultWorkspace(); return }
      setWorkspaceHandle(handle)
      if (await hasWorkspacePermission(handle)) await loadWorkspace(handle)
      else setWorkspaceState('available')
    }).catch(async error => {
      if (isMissingWorkspaceError(error)) {
        await clearWorkspaceHandle().catch(() => {})
        setWorkspaceHandle(null); await loadDefaultWorkspace()
      } else setWorkspaceState('error')
    })
  }, [])
  useEffect(() => {
    if (workspaceState !== 'connected' || !workspaceReady.current) return
    const timer = window.setTimeout(() => {
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceManifest(banks, workspaceFolders)
        : workspaceHandle ? writeWorkspaceManifest(workspaceHandle, banks, workspaceFolders) : Promise.resolve()
      save.catch(() => setWorkspaceState('error'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [banks, workspaceFolders, workspaceHandle, workspaceState, defaultWorkspaceConnected])
  useEffect(() => {
    if (workspaceState !== 'connected' || !workspaceReady.current) return
    const timer = window.setTimeout(() => {
      const rounds = updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceUserData(rounds, userSettings, questionNotes)
        : workspaceHandle ? writeWorkspaceUserData(workspaceHandle, rounds, userSettings, questionNotes) : Promise.resolve()
      save.catch(() => setWorkspaceState('error'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [studyRounds, statuses, activities, userSettings, questionNotes, workspaceHandle, workspaceState, defaultWorkspaceConnected])
  useEffect(() => {
    restoreSavedNavigation(banks, statuses)
    setNavigationReady(true)
  }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const finishPrinting = () => { setPrintMode(false); setPrintJob(null) }
    window.addEventListener('afterprint', finishPrinting)
    return () => window.removeEventListener('afterprint', finishPrinting)
  }, [])
  useEffect(() => {
    if (!printMode || !printJob) return
    let cancelled = false
    const preparePrint = async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!printSheetRef.current) throw new Error('打印内容准备失败，请重试')
      await waitForExportContent(printSheetRef.current)
      if (!cancelled) { setToast('打印预览已就绪，可选择“另存为 PDF”'); window.print() }
    }
    preparePrint().catch(error => {
      if (cancelled) return
      setPrintMode(false); setPrintJob(null)
      setToast(error instanceof Error ? error.message : 'PDF 导出失败')
    })
    return () => { cancelled = true }
  }, [printMode, printJob])

  const bank = banks.find(b => b.id === bankId) || banks[0]
  const subject = bankSubject(bank)
  const subjectBanks = useMemo(() => sortBanksForDisplay(banks.filter(item => bankSubject(item) === subject)), [banks, subject])
  const section: Section | undefined = bank?.chapters.flatMap(c => c.sections).find(s => s.id === sectionId)
  const bankQuestionEntries = useMemo(() => orderedQuestionEntriesForBank(bank), [bank])
  const currentBankStats = useMemo(() => calculateLearningStats([bank], statuses), [bank, statuses])
  const currentChapter = bank.chapters.find(chapter => chapter.sections.some(item => item.id === sectionId))
  const currentPaperEntries = currentChapter ? bankQuestionEntries.filter(entry => entry.chapterId === currentChapter.id) : bankQuestionEntries
  const currentNavigationStats = view === 'section'
    ? subject === 'english' && currentChapter
      ? calculateQuestionStats(currentChapter.sections.flatMap(item => item.questions), statuses)
      : calculateQuestionStats(section?.questions || [], statuses)
    : currentBankStats
  const reviewEntries = useMemo(() => bankQuestionEntries.filter(entry => statuses[entry.question.id] === 'vague' || statuses[entry.question.id] === 'wrong'), [bankQuestionEntries, statuses])
  const reviewQuestions = useMemo(() => reviewEntries.map(entry => entry.question), [reviewEntries])
  const sourceQuestions = view === 'wrong' ? reviewQuestions : (section?.questions || [])
  const binaryFilterMode = subject === 'english'
  const isPartBSection = view === 'section' && Boolean(section?.questions.length) && section!.questions.every(item => item.type === '阅读理解 Part B')
  const sharedPartBOptions = isPartBSection ? section?.questions[0]?.options || [] : []
  const hasLongPartBOptions = sharedPartBOptions.some(option => option.length > 180)
  const partBOptionBankMeta = section?.partBKind === 'ordering'
    ? { title: '待排序段落', description: '以下段落供第 41–45 题共同使用。' }
    : section?.partBKind === 'subheading'
      ? { title: '备选小标题', description: '以下小标题供第 41–45 题共同使用。' }
      : section?.partBKind === 'viewpoint'
        ? { title: '备选观点', description: '以下观点供第 41–45 题共同使用。' }
        : { title: '备选句', description: '以下句子供第 41–45 题共同使用。' }
  const filterOptions: Array<QuestionStatus | 'all'> = view === 'wrong'
    ? binaryFilterMode ? ['all', 'wrong'] : ['all', 'vague', 'wrong']
    : binaryFilterMode ? ['all', 'none', 'wrong', 'proficient'] : ['all', 'none', 'wrong', 'vague', 'proficient']
  const filteredQuestions = useMemo(() => sourceQuestions.filter(q => {
    const matchesStatus = filter === 'all' || effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode) === filter
    const readingLabel = readingTypeMeta.find(item => item.value === q.readingType)?.label || ''
    const haystack = `${q.text} ${q.answer} ${q.analysis} ${readingLabel}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [sourceQuestions, filter, query, statuses, binaryFilterMode])
  const question = filteredQuestions[Math.min(questionIndex, Math.max(0, filteredQuestions.length - 1))]
  const questionText = question && (question.type === '图片题' || question.imageUrl || question.imageKeys?.length) && question.text === `第 ${question.number} 题` ? '' : question?.text
  const hasAnswerImages = Boolean(question?.answerImageKeys?.length || question?.answerImageUrl)
  const usesImageAnswer = Boolean(question && hasAnswerImages && isImageAnswerPlaceholder(question.answer))
  const currentQuestionEntry = view === 'wrong' ? reviewEntries.find(entry => entry.question.id === question?.id) : undefined
  const currentQuestionStatus = effectiveQuestionStatus(question, question ? statuses[question.id] || 'none' : 'none', binaryFilterMode)
  const currentQuestionStatusMeta = questionStatusMeta(question, currentQuestionStatus, binaryFilterMode)
  const counts = bankQuestionEntries.reduce((acc, entry) => { const s = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); acc[s]++; return acc }, { none: 0, proficient: 0, vague: 0, wrong: 0 })
  const allPassageAnswersOpen = filteredQuestions.length > 0 && filteredQuestions.every(item => expandedPassageAnswers.has(item.id))
  const showFullPaperNavigation = binaryFilterMode && view === 'section'
  const reviewNavigationGroups = useMemo(() => {
    if (view !== 'wrong') return []
    const visibleIds = new Set(filteredQuestions.map(item => item.id))
    return bank.chapters.flatMap(chapter => chapter.sections.map(itemSection => ({
      id: itemSection.id,
      label: `${chapter.name} · ${itemSection.name}`,
      entries: reviewEntries.filter(entry => entry.sectionId === itemSection.id && visibleIds.has(entry.question.id)),
    }))).filter(group => group.entries.length)
  }, [view, filteredQuestions, bank.chapters, reviewEntries])

  useEffect(() => {
    if (!navigationReady) return
    const currentPosition = { bankId: bank?.id || '', sectionId, questionId: question?.id || '', view }
    studyPositions.current[subject] = currentPosition
    saveNavigation({ ...currentPosition, page: activePage, profileBankId, studyPositions: studyPositions.current })
  }, [navigationReady, bank?.id, sectionId, question?.id, view, activePage, profileBankId])

  function selectBank(next: QuestionBank) {
    setBankId(next.id); setSectionId(next.chapters[0]?.sections[0]?.id || ''); setExpandedChapterIds(new Set(next.chapters[0] ? [next.chapters[0].id] : [])); setQuestionIndex(0); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setView('section'); setSidebar(false)
  }
  function restoreSavedNavigation(targetBanks: QuestionBank[], targetStatuses: Record<string, QuestionStatus>) {
    const saved = loadNavigation()
    if (!saved) return false
    studyPositions.current = { ...saved.studyPositions }
    setProfileBankId(resolveProfileBankId(targetBanks, saved.profileBankId || saved.bankId))
    setActivePage(saved.page)
    const restored = resolveNavigation(targetBanks, targetStatuses, saved)
    if (!restored) return saved.page === 'profile'
    const restoredBank = targetBanks.find(item => item.id === restored.bankId)
    if (restoredBank) studyPositions.current[bankSubject(restoredBank)] = saved
    setBankId(restored.bankId); setSectionId(restored.sectionId); setExpandedChapterIds(new Set([restored.chapterId])); setQuestionIndex(restored.questionIndex); setView(restored.view)
    setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setQuery('')
    return true
  }
  function selectSubject(nextSubject: Subject) {
    if (bankSubject(bank) === nextSubject) {
      setActivePage('study'); setSidebar(false)
      return
    }
    const restored = resolveNavigation(banks.filter(item => bankSubject(item) === nextSubject), statuses, studyPositions.current[nextSubject] || null)
    if (restored) {
      setBankId(restored.bankId); setSectionId(restored.sectionId); setExpandedChapterIds(new Set([restored.chapterId])); setQuestionIndex(restored.questionIndex); setView(restored.view)
      setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setQuery(''); setActivePage('study'); setSidebar(false)
      return
    }
    const nextBank = sortBanksForDisplay(banks.filter(item => bankSubject(item) === nextSubject))[0]
    if (nextBank) { setActivePage('study'); selectBank(nextBank) }
    else {
      setNewBankSubject(nextSubject)
      setNewBankOpen(true)
      setToast(`还没有${subjectLabels[nextSubject]}题库，可以先新建一个`)
    }
  }
  function selectSection(id: string) {
    const owner = bank.chapters.find(chapter => chapter.sections.some(item => item.id === id))
    if (owner) setExpandedChapterIds(previous => new Set(previous).add(owner.id))
    setSectionId(id); setQuestionIndex(0); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setView('section'); setSidebar(false)
  }
  function toggleChapter(id: string) {
    setExpandedChapterIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function showReviewBook() { setView('wrong'); setFilter('all'); setQuery(''); setQuestionIndex(0); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setSidebar(false) }
  function markQuestion(questionId: string, status: QuestionStatus, targetQuestion?: Question) {
    const questionEntry = bankQuestionEntries.find(entry => entry.question.id === questionId)
    const item = targetQuestion || questionEntry?.question
    const previousStatus = effectiveQuestionStatus(item, statuses[questionId] || 'none', binaryFilterMode)
    setStatuses(prev => ({ ...prev, [questionId]: status })); setToast(`已标记为“${questionStatusMeta(item, status, binaryFilterMode).label}”`)
    setActivities(previous => updateStudyActivity(previous, {
      questionId,
      bankId: bank.id,
      status,
      previousStatus,
      chapterId: questionEntry?.chapterId,
      sectionId: questionEntry?.sectionId,
      questionNumber: item?.number,
      questionType: item?.type,
      readingType: item?.readingType,
      subject,
      source: view === 'wrong' ? 'wrong-book' : 'study',
      answerRevealed: isBinaryMasteryQuestion(item) ? expandedPassageAnswers.has(questionId) : answerOpen,
    }))
  }
  function markDashboardQuestion(targetBankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank) return
    const questionEntry = orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === questionId)
    if (!questionEntry) return
    const targetSubject = bankSubject(targetBank)
    const targetBinaryMode = targetSubject === 'english'
    const previousStatus = effectiveQuestionStatus(questionEntry.question, statuses[questionId] || 'none', targetBinaryMode)
    setStatuses(previous => ({ ...previous, [questionId]: status }))
    setActivities(previous => updateStudyActivity(previous, {
      questionId,
      bankId: targetBank.id,
      status,
      previousStatus,
      chapterId: questionEntry.chapterId,
      sectionId: questionEntry.sectionId,
      questionNumber: questionEntry.question.number,
      questionType: questionEntry.question.type,
      readingType: questionEntry.question.readingType,
      subject: targetSubject,
      source: 'dashboard',
      answerRevealed,
    }))
    setToast(`已标记为“${questionStatusMeta(questionEntry.question, status, targetBinaryMode).label}”`)
  }
  function markDashboardReview(targetBankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank) return
    const questionEntry = orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === questionId)
    if (!questionEntry) return
    const targetSubject = bankSubject(targetBank)
    const targetBinaryMode = targetSubject === 'english'
    const previousStatus = effectiveQuestionStatus(questionEntry.question, statuses[questionId] || 'none', targetBinaryMode)
    const result = updateQuestionReview(activities, {
      questionId,
      bankId: targetBank.id,
      previousStatus,
      chapterId: questionEntry.chapterId,
      sectionId: questionEntry.sectionId,
      questionNumber: questionEntry.question.number,
      questionType: questionEntry.question.type,
      readingType: questionEntry.question.readingType,
      subject: targetSubject,
      source: 'dashboard',
      answerRevealed,
    }, status)
    setActivities(result.activities)
    setStatuses(previous => ({ ...previous, [questionId]: result.status }))
    setToast(status === 'none' ? '已取消本次复习记录' : `第 ${buildQuestionReviewTimeline(result.activities, questionId).reviews.length} 次复习已记录为“${questionStatusMeta(questionEntry.question, result.status, targetBinaryMode).label}”`)
  }
  function mark(status: QuestionStatus) { if (question) markQuestion(question.id, status, question) }
  function togglePassageAnswer(questionId: string) {
    setExpandedPassageAnswers(previous => {
      const next = new Set(previous)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }
  function toggleAllPassageAnswers() {
    setExpandedPassageAnswers(previous => {
      const next = new Set(previous)
      if (allPassageAnswersOpen) filteredQuestions.forEach(item => next.delete(item.id))
      else filteredQuestions.forEach(item => next.add(item.id))
      return next
    })
  }
  function jumpToPassageQuestion(questionId: string, index: number) {
    setQuestionIndex(index)
    window.requestAnimationFrame(() => document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function moveQuestion(offset: -1 | 1) {
    setQuestionIndex(index => Math.max(0, Math.min(filteredQuestions.length - 1, index + offset)))
    setAnswerOpen(false)
  }
  function navigateToBankQuestion(entry: BankQuestionEntry) {
    const targetSection = bank.chapters.flatMap(chapter => chapter.sections).find(item => item.id === entry.sectionId)
    if (!targetSection) return
    const targetIndex = targetSection.questions.findIndex(item => item.id === entry.question.id)
    setExpandedChapterIds(previous => new Set(previous).add(entry.chapterId))
    setSectionId(entry.sectionId); setQuestionIndex(Math.max(0, targetIndex)); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setQuery(''); setView('section')
    window.requestAnimationFrame(() => document.getElementById(`question-${entry.question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function markReadingType(questionId: string, readingType: ReadingQuestionType | '') {
    setBanks(previous => previous.map(item => ({ ...item, chapters: item.chapters.map(chapter => ({ ...chapter, sections: chapter.sections.map(itemSection => ({
      ...itemSection,
      questions: itemSection.questions.map(itemQuestion => itemQuestion.id === questionId
        ? { ...itemQuestion, readingType: readingType || undefined }
        : itemQuestion)
    })) })) })))
    setToast(readingType ? `已标注为“${readingTypeMeta.find(item => item.value === readingType)?.label}”` : '已清除阅读题型标注')
  }
  function readingTypePicker(item: Question) {
    if (!isReadingTypeQuestion(item)) return null
    return <label className="reading-type-picker"><span>阅读题型</span><select aria-label={`第 ${item.number} 题阅读题型`} value={item.readingType || ''} onChange={event => markReadingType(item.id, event.target.value as ReadingQuestionType | '')}><option value="">未分类</option>{readingTypeMeta.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select><ChevronDown size={13}/></label>
  }
  function currentStudyRounds() {
    return updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
  }
  function updateQuestionNote(questionId: string, note: QuestionNote) {
    setQuestionNotes(previous => {
      if (!hasQuestionNote(note)) {
        if (!previous[questionId]) return previous
        const next = { ...previous }
        delete next[questionId]
        return next
      }
      return { ...previous, [questionId]: note }
    })
  }
  function switchStudyRound(nextRound: number) {
    if (nextRound === userSettings.activeRound) return
    const rounds = currentStudyRounds()
    const target = getStudyRound(rounds, nextRound)
    setStudyRounds(rounds)
    setUserSettings(previous => ({ ...previous, activeRound: nextRound, roundCount: Math.max(previous.roundCount, nextRound) }))
    setStatuses(target.statuses); setActivities(target.activities); setAnswerOpen(false); setExpandedPassageAnswers(new Set())
    setToast(`已切换到第 ${nextRound} 轮`)
  }
  function addStudyRound() {
    if (userSettings.roundCount >= 99) { setToast('最多可添加 99 轮'); return }
    const nextRound = userSettings.roundCount + 1
    const rounds = { ...currentStudyRounds(), [String(nextRound)]: emptyStudyRound() }
    setStudyRounds(rounds)
    setUserSettings(previous => ({ ...previous, activeRound: nextRound, roundCount: nextRound }))
    setStatuses({}); setActivities([]); setAnswerOpen(false); setExpandedPassageAnswers(new Set())
    setToast(`已新增并切换到第 ${nextRound} 轮`)
  }
  function displayedStudyRound(round: number) {
    return round === userSettings.activeRound ? { statuses, activities } : getStudyRound(studyRounds, round)
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 4, banks, rounds: currentStudyRounds(), settings: userSettings, notes: questionNotes }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `考研学习空间备份-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  function exportSingleBank(targetBank: QuestionBank) {
    const blob = new Blob([JSON.stringify({ version: 1, banks: [targetBank] }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${targetBank.name.replace(/[\\/:*?"<>|]/g, '-')}.json`; link.click(); URL.revokeObjectURL(url); setToast(`已导出“${targetBank.name}”`)
  }
  function clearMarks(targetBankId: string | 'all', status: QuestionStatus | 'all') {
    const targets = banks
      .filter(targetBank => targetBankId === 'all' || targetBank.id === targetBankId)
      .flatMap(targetBank => orderedQuestionEntriesForBank(targetBank).map(entry => ({ targetBank, entry })))
      .filter(({ entry }) => {
        const current = statuses[entry.question.id] || 'none'
        return current !== 'none' && (status === 'all' || current === status)
      })
    const now = new Date()
    setActivities(previous => targets.reduce((next, { targetBank, entry }) => updateStudyActivity(next, {
      questionId: entry.question.id,
      bankId: targetBank.id,
      status: 'none',
      previousStatus: statuses[entry.question.id] || 'none',
      chapterId: entry.chapterId,
      sectionId: entry.sectionId,
      questionNumber: entry.question.number,
      questionType: entry.question.type,
      readingType: entry.question.readingType,
      subject: bankSubject(targetBank),
      source: 'bulk-clear',
    }, now), previous))
    setStatuses(previous => clearQuestionStatuses(previous, banks, targetBankId, status)); setToast('所选标注已清除')
  }
  async function resetManagedBank(targetBank: QuestionBank) {
    if (protectedBankIds.has(targetBank.id)) { setToast('默认题库不能重置或清空'); return }
    await deleteAssets(assetKeysForBank(targetBank)); const baseline = builtInBanks.find(item => item.id === targetBank.id)
    const folderName = workspaceFolders[targetBank.id]
    if (workspaceHandle && workspaceState === 'connected' && folderName) {
      await removeBankFolder(workspaceHandle, folderName).catch(() => {})
      if (!baseline) await workspaceHandle.getDirectoryHandle(folderName, { create: true })
    }
    setStatuses(previous => clearQuestionStatuses(previous, banks, targetBank.id, 'all')); setBanks(previous => resetBankData(previous, targetBank.id, baseline))
    if (bankId === targetBank.id) { setSectionId(baseline?.chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setView('section') }
    setToast(baseline ? '内置题库已恢复' : '自建题库内容已清空')
  }
  async function deleteManagedBank(targetBank: QuestionBank) {
    if (protectedBankIds.has(targetBank.id)) { setToast('默认题库不能删除'); return }
    if (banks.length <= 1) { setToast('至少需要保留一个题库'); return }
    await deleteAssets(assetKeysForBank(targetBank)); const ids = questionIdsForBank(targetBank)
    const folderName = workspaceFolders[targetBank.id]
    if (workspaceHandle && workspaceState === 'connected' && folderName) await removeBankFolder(workspaceHandle, folderName).catch(() => {})
    setWorkspaceFolders(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== targetBank.id)))
    setStatuses(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id))))
    const remaining = removeBank(banks, targetBank.id); setBanks(remaining)
    if (bankId === targetBank.id) selectBank(remaining[0]); setToast(`已删除“${targetBank.name}”`)
  }
  async function restoreBuiltIns() {
    const builtInIds = new Set(builtInBanks.map(item => item.id)); const existingBuiltIns = banks.filter(item => builtInIds.has(item.id))
    await deleteAssets(existingBuiltIns.flatMap(assetKeysForBank)); setStatuses(previous => existingBuiltIns.reduce((next, item) => clearQuestionStatuses(next, banks, item.id, 'all'), previous))
    setBanks(previous => [...previous.filter(item => !builtInIds.has(item.id)), ...structuredClone(builtInBanks)]); setToast('内置题库已恢复')
  }
  async function factoryReset() {
    const protectedBanks = banks.filter(item => protectedBankIds.has(item.id))
    const removableBanks = banks.filter(item => !protectedBankIds.has(item.id))
    await deleteAssets(removableBanks.flatMap(assetKeysForBank))
    const defaults = [...structuredClone(protectedBanks), ...structuredClone(builtInBanks).filter(item => !protectedBankIds.has(item.id))]
    setBanks(defaults); setStudyRounds({ '1': emptyStudyRound() }); setStatuses({}); setActivities([]); setQuestionNotes({}); setUserSettings({ ...DEFAULT_USER_SETTINGS }); setBankId(defaults[0].id); setSectionId(defaults[0].chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setView('section'); setSettingsOpen(false); setToast('已恢复出厂设置，默认题库已保留')
  }
  function printExport(job: ExportJob) {
    if (!job.questions.length) { setToast('当前条件下没有可导出的题目'); return }
    setPrintJob(job); setExportOpen(false)
    setToast('正在准备题目图片…')
    setPrintMode(true)
  }
  async function importData(file?: File) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()); const imported = removeRetiredBanks(validateBanks(parsed))
      setBanks(prev => [...prev.filter(b => !imported.some(i => i.id === b.id)), ...imported])
      if (parsed.rounds || parsed.statuses || parsed.activities) {
        const importedSettings = parsed.settings
          ? validateUserSettings(parsed.settings)
          : { ...userSettings, activeRound: 1, roundCount: Math.max(5, userSettings.roundCount) }
        const importedRounds = migrateStudyRounds(parsed.rounds, parsed.statuses, parsed.activities)
        const targetRound = getStudyRound(importedRounds, importedSettings.activeRound)
        setStudyRounds(importedRounds); setStatuses(targetRound.statuses); setActivities(targetRound.activities); setUserSettings(importedSettings)
      } else if (parsed.settings) setUserSettings(validateUserSettings(parsed.settings))
      if (parsed.version >= 4 || parsed.notes) {
        notesLoaded.current = true
        setNotesReady(true)
        setQuestionNotes(validateQuestionNotes(parsed.notes))
      }
      setToast(`成功导入 ${imported.length} 个题库`)
    } catch (e) { setToast(e instanceof Error ? e.message : '导入失败') }
    if (importRef.current) importRef.current.value = ''
  }
  async function importImages(fileList?: FileList | null) {
    const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'))
    if (!files.length) { setToast('所选目录中没有图片文件'); return }
    try {
      const result = await mergeImageEntries(banks, files.map(file => ({ file, relativePath: file.webkitRelativePath || file.name, bankId: bank.id })))
      if (!result.imported) { setToast(`没有图片符合命名规则，已跳过 ${result.skipped} 个文件`); return }
      setBanks(result.banks)
      if (result.firstSectionId) { setSectionId(result.firstSectionId); setView('section') }
      setToast(`已导入 ${result.imported} 张图片，匹配 ${result.matchedQuestions} 道题${result.createdQuestions ? `，自动新建/补全 ${result.createdQuestions} 道` : ''}${result.skipped ? `，跳过 ${result.skipped} 张` : ''}`)
    } catch (error) { setToast(error instanceof Error ? error.message : '图片导入失败') }
    if (imageImportRef.current) imageImportRef.current.value = ''
  }

  async function loadDefaultWorkspace() {
    setWorkspaceState('syncing')
    try {
      const index = await readDefaultWorkspace()
      let nextBanks = index.manifest ? removeRetiredBanks(validateBanks(index.manifest)) : structuredClone(banks)
      if (index.manifest && index.manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        nextBanks = [...nextBanks.filter(bank => !bank.id.startsWith('english-')), ...structuredClone(englishBanks)]
      }
      const resolvedUserData = resolveWorkspaceUserData(index.userData, index.manifest?.statuses, currentStudyRounds(), userSettings, await loadQuestionNotes())
      const nextSettings = resolvedUserData.settings
      const nextRounds = resolvedUserData.rounds
      const nextNotes = resolvedUserData.notes
      const nextRound = getStudyRound(nextRounds, nextSettings.activeRound)
      const nextStatuses = nextRound.statuses
      const nextActivities = nextRound.activities
      const folders = { ...(index.manifest?.folders || {}) }
      for (const folderName of new Set(index.images.map(item => item.bankFolder).filter(Boolean))) {
        let target = nextBanks.find(item => folders[item.id] === folderName || safeFolderName(item.name) === folderName)
        if (!target) {
          target = { id: `default-${Date.now()}-${nextBanks.length}`, name: folderName, description: '默认本地题库', source: 'local', chapters: [] }
          nextBanks.push(target)
        }
        folders[target.id] = folderName
      }
      const entries = index.images.map(item => {
        const target = item.bankFolder ? nextBanks.find(bank => folders[bank.id] === item.bankFolder) : nextBanks[0]
        return { file: new File([], item.name), relativePath: item.relativePath, bankId: target!.id, assetUrl: item.url }
      })
      const result = await mergeImageEntries(nextBanks, entries, { replaceExistingAssets: true })
      if (!restoreSavedNavigation(result.banks, nextStatuses)) {
        const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
        const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
        if (activeBank && !activeSections.some(item => item.id === sectionId)) {
          setBankId(activeBank.id); setSectionId(activeSections[0]?.id || ''); setQuestionIndex(0)
        }
      }
      workspaceReady.current = false
      notesLoaded.current = true
      setNotesReady(true)
      setBanks(result.banks); setStudyRounds(nextRounds); setStatuses(nextStatuses); setActivities(nextActivities); setQuestionNotes(nextNotes); setUserSettings(nextSettings); setWorkspaceFolders(folders); setWorkspaceHandle(null); setDefaultWorkspaceConnected(true); setWorkspaceState('connected')
      window.setTimeout(() => {
        workspaceReady.current = true
      }, 0)
      setToast(`已自动连接“${index.name}”${result.imported ? `，识别 ${result.imported} 张图片` : ''}`)
      return true
    } catch {
      setDefaultWorkspaceConnected(false); setWorkspaceState('none')
      return false
    }
  }

  async function loadWorkspace(handle: FileSystemDirectoryHandle) {
    if (handle.name === '默认题库') {
      await clearWorkspaceHandle().catch(() => {})
      setWorkspaceHandle(null)
      return loadDefaultWorkspace()
    }
    setWorkspaceState('syncing')
    try {
      if (!await hasWorkspacePermission(handle, true)) throw new Error('未获得题库文件夹读写权限')
      const [manifest, userData] = await Promise.all([readWorkspaceManifest(handle), readWorkspaceUserData(handle)])
      let nextBanks = manifest ? removeRetiredBanks(validateBanks(manifest)) : structuredClone(banks)
      let seededEnglishCount = 0
      if (manifest && manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        seededEnglishCount = englishBanks.length
        nextBanks = [...nextBanks.filter(bank => !bank.id.startsWith('english-')), ...structuredClone(englishBanks)]
      }
      const resolvedUserData = resolveWorkspaceUserData(userData, manifest?.statuses, currentStudyRounds(), userSettings, await loadQuestionNotes())
      const nextSettings = resolvedUserData.settings
      const nextRounds = resolvedUserData.rounds
      const nextNotes = resolvedUserData.notes
      const nextRound = getStudyRound(nextRounds, nextSettings.activeRound)
      const nextStatuses = nextRound.statuses
      const nextActivities = nextRound.activities
      const images = await scanWorkspaceImages(handle, Object.values(manifest?.folders || {}))
      const folders = { ...(manifest?.folders || {}) }
      for (const folderName of new Set(images.map(item => item.bankFolder).filter(Boolean))) {
        let target = nextBanks.find(item => folders[item.id] === folderName || safeFolderName(item.name) === folderName)
        if (!target) {
          const id = `workspace-${Date.now()}-${nextBanks.length}`
          target = { id, name: folderName, description: '本地文件夹题库', source: 'local', chapters: [] }
          nextBanks.push(target)
        }
        folders[target!.id] = folderName
      }
      const entries = images.map(item => {
        const target = item.bankFolder
          ? nextBanks.find(bank => folders[bank.id] === item.bankFolder)
          : nextBanks.find(bank => bank.id === bankId) || nextBanks[0]
        return { file: item.file, relativePath: item.relativePath, bankId: target!.id, assetUrl: URL.createObjectURL(item.file) }
      })
      const result = await mergeImageEntries(nextBanks, entries, { replaceExistingAssets: true })
      if (!restoreSavedNavigation(result.banks, nextStatuses)) {
        const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
        const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
        if (activeBank && !activeSections.some(item => item.id === sectionId)) {
          setBankId(activeBank.id)
          setSectionId(activeSections[0]?.id || '')
          setQuestionIndex(0)
        }
      }
      workspaceReady.current = false
      notesLoaded.current = true
      setNotesReady(true)
      setBanks(result.banks); setStudyRounds(nextRounds); setStatuses(nextStatuses); setActivities(nextActivities); setQuestionNotes(nextNotes); setUserSettings(nextSettings); setWorkspaceFolders(folders); setWorkspaceHandle(handle); setDefaultWorkspaceConnected(false)
      setWorkspaceState('connected')
      window.setTimeout(() => {
        workspaceReady.current = true
      }, 0)
      setToast(`已连接“${handle.name}”${seededEnglishCount ? `，更新 ${seededEnglishCount} 个内置英语题库` : ''}${result.imported ? `，同步 ${result.imported} 张图片` : ''}`)
      return true
    } catch (error) {
      if (isMissingWorkspaceError(error)) {
        await clearWorkspaceHandle().catch(() => {})
        setWorkspaceHandle(null); await loadDefaultWorkspace()
      } else {
        setWorkspaceState('error'); setToast(error instanceof Error ? error.message : '题库文件夹同步失败')
      }
      return false
    }
  }

  async function connectWorkspace() {
    try {
      if (defaultWorkspaceConnected) { await loadDefaultWorkspace(); return }
      if (workspaceHandle) {
        try {
          if (await hasWorkspacePermission(workspaceHandle, true) && await loadWorkspace(workspaceHandle)) return
        } catch (error) {
          if (!isMissingWorkspaceError(error)) throw error
          await clearWorkspaceHandle().catch(() => {})
          setWorkspaceHandle(null)
        }
      }
      const handle = await chooseWorkspace()
      await loadWorkspace(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setWorkspaceState('error'); setToast(error instanceof Error ? error.message : '无法连接题库文件夹')
    }
  }
  async function switchWorkspace() {
    try {
      if (workspaceHandle && workspaceState === 'connected') {
        void Promise.all([writeWorkspaceManifest(workspaceHandle, banks, workspaceFolders), writeWorkspaceUserData(workspaceHandle, currentStudyRounds(), userSettings, questionNotes)]).catch(() => {})
      }
      const handle = await chooseWorkspace()
      await loadWorkspace(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setToast(error instanceof Error ? error.message : '无法切换本地题库')
    }
  }
  async function createBank() {
    const name = newBankName.trim()
    if (!name) { setToast('请输入题库名称'); return }
    const created: QuestionBank = { id: `local-${Date.now()}`, name, description: '自建本地题库', subject: newBankSubject, source: 'local', chapters: [] }
    if (workspaceHandle && workspaceState === 'connected') {
      const folderName = await createBankFolder(workspaceHandle, Object.values(workspaceFolders).includes(safeFolderName(name)) ? `${name}-${Date.now()}` : name)
      setWorkspaceFolders(previous => ({ ...previous, [created.id]: folderName }))
    }
    setBanks(previous => [...previous, created]); setBankId(created.id); setSectionId(''); setView('section'); setNewBankName(''); setNewBankOpen(false); setToast(`已新建“${name}”，现在可以批量导入图片`)
  }
  function openRename(kind: 'bank' | 'chapter', id: string, name: string) { setRenameTarget({ kind, id, name }); setRenameValue(name) }
  function applyRename() {
    const name = renameValue.trim()
    if (!renameTarget || !name) { setToast('名称不能为空'); return }
    setBanks(previous => renameTarget.kind === 'bank' ? renameBank(previous, renameTarget.id, name) : renameChapter(previous, bank.id, renameTarget.id, name))
    setRenameTarget(null); setToast(`已重命名为“${name}”`)
  }

  if (!bank) return <div className="empty-app"><BookOpen size={42}/><h1>还没有题库</h1><button onClick={() => importRef.current?.click()}>导入题库</button><input ref={importRef} hidden type="file" accept=".json" onChange={e => importData(e.target.files?.[0])}/></div>

  const customExamDate = parseExamDateValue(userSettings.examDate || '')
  const examCountdown = getExamCountdown(countdownNow, customExamDate)
  const examDateLabel = `${examCountdown.target.getMonth() + 1} 月 ${examCountdown.target.getDate()} 日`
  const updateExamDate = (value: string) => {
    const date = parseExamDateValue(value)
    if (!date) return
    setUserSettings(previous => ({ ...previous, examDate: formatExamDateValue(date) }))
    setToast(`考试日期已修改为 ${date.getMonth() + 1} 月 ${date.getDate()} 日`)
  }
  const resetExamDate = () => {
    setUserSettings(previous => {
      const { examDate: _removed, ...rest } = previous
      return rest
    })
    setToast('已恢复默认考试日期')
  }

  return <div className="app-shell">
    <header>
      {activePage === 'study' && <button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu/></button>}
      <div className="brand"><span className="brand-mark"><BookOpen size={20}/></span><div><strong>考研学习空间</strong><small>NPEE STUDY SPACE</small></div></div>
      <nav className="subject-nav" aria-label="学科导航">
        <button className={activePage === 'study' && subject === 'math' ? 'active' : ''} onClick={() => selectSubject('math')}>数学</button>
        <button className={activePage === 'study' && subject === 'english' ? 'active' : ''} onClick={() => selectSubject('english')}>英语</button>
        <button className={activePage === 'study' && subject === 'professional' ? 'active' : ''} onClick={() => selectSubject('professional')}>专业课</button>
        <button className={activePage === 'profile' ? 'active' : ''} onClick={() => { if (!profileBankId) setProfileBankId(bank.id); setActivePage('profile'); setSidebar(false) }}>我的</button>
      </nav>
      <div className="header-center exam-countdown" title={`${examCountdown.cohortYear} 年考研初试日期：${examCountdown.target.getFullYear()} 年 ${examDateLabel}`}><span>{examCountdown.cohortYear} 考研倒计时</span><strong>{examCountdown.days}</strong><em>天</em><small>{examDateLabel}</small></div>
      <div className="header-actions">
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e => importData(e.target.files?.[0])}/>
        <input ref={node => { imageImportRef.current = node; node?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple accept="image/*" onChange={e => importImages(e.target.files)}/>
        <div className="header-sync-status" title={workspaceState === 'connected' ? `已同步：${defaultWorkspaceConnected ? '默认题库' : workspaceHandle?.name}` : '数据与位置保存在本地'}><span className={`source-dot ${workspaceState === 'connected' ? 'workspace-on' : ''}`}/><span>{workspaceState === 'connected' ? '已同步' : workspaceState === 'syncing' ? '同步中' : '本地保存'}</span></div>
        <div className="settings-tools-module" ref={settingsToolsRef}>
          <button className={settingsToolsOpen ? 'tool-button settings-tools-trigger active' : 'tool-button settings-tools-trigger'} aria-label="设置" aria-haspopup="menu" aria-expanded={settingsToolsOpen} onClick={() => setSettingsToolsOpen(open => !open)}><SettingsIcon/><span>设置</span><ChevronDown/></button>
          {settingsToolsOpen && <div className="settings-tools-popover" role="menu"><div className="settings-tools-heading"><div><strong>设置与数据</strong><small>题库连接、素材、导出和个人数据统一管理</small></div><button aria-label="关闭设置" onClick={() => setSettingsToolsOpen(false)}><X/></button></div>
            <section className="round-settings-section"><span>学习轮次</span><div><label><RotateCcw/><span><strong>当前轮次</strong><small>每轮标记与统计相互独立</small></span><select aria-label="当前学习轮次" value={userSettings.activeRound} onChange={event => switchStudyRound(Number(event.target.value))}>{Array.from({ length: userSettings.roundCount }, (_, index) => index + 1).map(round => <option key={round} value={round}>第 {round} 轮 · {countMarkedQuestions(displayedStudyRound(round))} 道已标记</option>)}</select></label><button type="button" onClick={addStudyRound} disabled={userSettings.roundCount >= 99}><Plus/>新增一轮</button></div><small>现有记录已归入第 1 轮；默认预设 5 轮，切换或新增不会覆盖其他轮次。</small></section>
            <section className="stats-settings-section"><span>学习统计</span><div><strong>计算规则</strong><small>正确率仅按已标记题目计算，未标记题目不影响结果；同一道题每天只统计一次，以当天最终标记状态为准。</small></div></section>
            <section className="countdown-settings-section"><span>考试倒计时</span><div><label><CalendarDays/><span><strong>考试日期</strong><small>修改后倒计时会立即更新</small></span><input aria-label="考试日期" type="date" min={formatExamDateValue(countdownNow)} value={formatExamDateValue(examCountdown.target)} onInput={event => updateExamDate(event.currentTarget.value)}/></label><button type="button" onClick={resetExamDate} disabled={!customExamDate}>恢复默认</button></div><small>日期保存在独立的用户数据中，可随备份和工作区同步，不会写入题库。</small></section>
            <section><span>题库连接</span><div><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); connectWorkspace() }}><FolderSync/><span><strong>{workspaceState === 'connected' ? '重新同步题库' : '连接题库文件夹'}</strong><small>{workspaceState === 'connected' ? '重新读取当前题库与用户数据' : '连接本地目录并启用实时保存'}</small></span></button><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); switchWorkspace() }}><FolderOpen/><span><strong>切换题库文件夹</strong><small>选择另一套本地题库目录</small></span></button></div></section>
            <section><span>导入与素材</span><div><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); importRef.current?.click() }}><FileUp/><span><strong>导入题库</strong><small>载入 JSON 题库或完整备份</small></span></button><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); imageImportRef.current?.click() }}><FileImage/><span><strong>导入图片</strong><small>按命名规则匹配题图与解析图</small></span></button></div></section>
            <section><span>规则与管理</span><div><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); setNamingHelpOpen(true) }}><CircleHelp/><span><strong>图片命名参考</strong><small>查看批量导入的文件命名规范</small></span></button><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); setSettingsOpen(true) }}><SettingsIcon/><span><strong>题库与数据管理</strong><small>清理标记、重置或删除题库</small></span></button></div></section>
            <section><span>导出与备份</span><div><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); setExportOpen(true) }}><FileText/><span><strong>导出题目</strong><small>按当前范围生成 PDF 或图片</small></span></button><button role="menuitem" onClick={() => { setSettingsToolsOpen(false); exportData() }}><Download/><span><strong>完整备份</strong><small>保存题库、学习记录和题目笔记</small></span></button></div></section>
          </div>}
        </div>
        <a className="github-link" href={githubRepositoryUrl} target="_blank" rel="noreferrer" aria-label="在 GitHub 查看考研学习空间" title="在 GitHub 查看项目"><GitHubMark/></a>
      </div>
    </header>

    <div className={activePage === 'profile' ? 'body-grid profile-mode' : 'body-grid'}>
      {activePage === 'study' && <>{sidebar && <div className="scrim" onClick={() => setSidebar(false)}/>}
      <aside className={sidebar ? 'open' : ''}>
        <div className="aside-mobile-title"><strong>题库导航</strong><button onClick={() => setSidebar(false)}><X/></button></div>
        <p className="eyebrow">题库类型</p>
        <div className="bank-select-row"><span className="bank-select-icon"><BookOpen size={17}/></span><select aria-label="选择题库" value={bank.id} onChange={event => { const selected = banks.find(item => item.id === event.target.value); if (selected) selectBank(selected) }}>{subjectBanks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rename-button" aria-label={`重命名题库 ${bank.name}`} onClick={() => openRename('bank', bank.id, bank.name)}><Pencil size={13}/></button></div>
        <div className="selected-bank-meta">{protectedBankIds.has(bank.id) ? '默认题库' : bank.source === 'local' ? '自建题库' : '远程题库'} · {bank.chapters.length} 章 · {bankQuestionEntries.length} 道题</div>
        <button className="new-bank-button" onClick={() => { setNewBankSubject(subject); setNewBankOpen(true) }}><Plus size={16}/>新建题库</button>
        <button className={view === 'wrong' ? 'wrong-book active' : 'wrong-book'} onClick={showReviewBook}><AlertCircle size={17}/><span><strong>本题库不熟练题</strong><small>{binaryFilterMode ? '当前题库中的错误题' : '包含模糊和错题'}</small></span><em>{binaryFilterMode ? counts.wrong : counts.vague + counts.wrong}</em></button>
        <div className="divider"/>
        <p className="eyebrow">章节导航</p>
        <div className="chapter-scroll"><div className="chapter-tree">{bank.chapters.map(chapter => {
          const chapterProgress = navigationProgress(chapter.sections.flatMap(sectionItem => sectionItem.questions), statuses, binaryFilterMode)
          const sectionGroups: SidebarSectionGroup[] = bank.id === 'english-exams'
            ? groupEnglishSections(chapter.sections)
            : [{ key: 'all', label: '', sections: chapter.sections }]
          return <div className={bank.chapters.length === 1 ? 'chapter single-chapter' : 'chapter'} key={chapter.id}>
            {bank.chapters.length > 1 && <div className="chapter-title"><button className="chapter-toggle" aria-expanded={expandedChapterIds.has(chapter.id)} onClick={() => toggleChapter(chapter.id)}>{expandedChapterIds.has(chapter.id) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{chapter.name}</span><em>{sectionGroups.length}</em><small className="nav-progress" title={`已标记 ${chapterProgress.marked}/${chapterProgress.total} 题`}>{chapterProgress.label}</small></button><button className="rename-button" aria-label={`重命名章节 ${chapter.name}`} onClick={() => openRename('chapter', chapter.id, chapter.name)}><Pencil size={12}/></button></div>}
            {(bank.chapters.length === 1 || expandedChapterIds.has(chapter.id)) && sectionGroups.map(group => {
              const groupProgress = navigationProgress(group.sections.flatMap(sectionItem => sectionItem.questions), statuses, binaryFilterMode)
              return <div key={`${chapter.id}-${group.key}`} className={group.label ? 'english-section-group' : undefined}>
                {group.label && <div className="english-section-group-heading"><span>{group.label}</span><small title={`已标记 ${groupProgress.marked}/${groupProgress.total} 题`}>{groupProgress.label}</small></div>}
                {group.sections.map(s => {
                  const sectionProgress = navigationProgress(s.questions, statuses, binaryFilterMode)
                  const label = group.key === 'all' ? s.name : englishSectionLabel(s, group.key)
                  return <button key={s.id} onClick={() => selectSection(s.id)} className={view === 'section' && s.id === sectionId ? 'section active' : 'section'}><span>{label}</span><small className="nav-progress" title={`已标记 ${sectionProgress.marked}/${sectionProgress.total} 题`}>{sectionProgress.label}</small></button>
                })}
              </div>
            })}
          </div>
        })}{bank.chapters.length === 0 && <div className="empty-chapters">还没有章节<br/><small>点击顶部“图片”批量导入</small></div>}</div></div>
        <div className="aside-summary"><strong>学习概览</strong>{binaryFilterMode ? <div className="binary-summary"><span><i/>{counts.none} 未标记</span><span><i className="green"/>{counts.proficient} 正确</span><span><i className="red"/>{counts.wrong} 错误</span></div> : <div><span><i className="green"/>{counts.proficient} 熟练</span><span><i className="yellow"/>{counts.vague} 模糊</span><span><i className="red"/>{counts.wrong} 错题</span></div>}</div>
      </aside></>}

      <main className={activePage === 'profile' ? 'profile-main' : ''}>
        {activePage === 'profile' ? <LearningDashboard banks={banks} statuses={statuses} activities={activities} notes={questionNotes} selectedBankId={profileBankId} onSelectedBankIdChange={setProfileBankId} onQuestionStatusChange={markDashboardQuestion} onQuestionReviewStatusChange={markDashboardReview} onQuestionNoteChange={updateQuestionNote}/> : <>
        <div className="page-head"><div><span className="breadcrumb">{bank.name} <ChevronRight size={13}/>{view === 'section' && currentChapter && <>{currentChapter.name} <ChevronRight size={13}/></>}{view === 'wrong' ? '本题库不熟练题' : section?.name || '未选择'}</span><div className="page-head-title-row"><h1>{view === 'wrong' ? '本题库不熟练题' : section?.name || '请选择具体节题目'}</h1><p>{view === 'wrong' ? `按章节和小节分组 · 共 ${reviewQuestions.length} 道不熟练题` : section ? `共 ${section.questions.length} 道题` : '从左侧选择一个章节开始学习'}</p></div></div>
          <div className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setQuestionIndex(0) }} placeholder={view === 'wrong' ? '搜索不熟练题' : '搜索当前小节'}/></div>
        </div>

        <div className="filter-row"><Filter size={16}/><span>筛选</span>{filterOptions.map(s => <button key={s} className={filter === s ? 'chip active' : 'chip'} onClick={() => { setFilter(s); setQuestionIndex(0) }}>{s === 'all' ? '全部' : (binaryFilterMode ? binaryStatusMeta[s].label : statusMeta[s].label)}</button>)}</div>

        {question && view === 'section' && (section?.passage || section?.passageImageUrls?.length || isPartBSection) ? <div className="passage-study-shell"><div className="passage-study">
          <section className="passage-questions" aria-label="题目与选项">
            <div className="passage-block-heading passage-block-heading-actions"><div><span>QUESTIONS & ANSWERS</span><h2>题目与选项</h2><p>答案与解析默认收起，原文置于题目之后。</p></div><button className="batch-answer-toggle" aria-expanded={allPassageAnswersOpen} onClick={toggleAllPassageAnswers}><CircleHelp size={16}/>{allPassageAnswersOpen ? '全部收起' : '全部展开'}<ChevronDown className={allPassageAnswersOpen ? 'rotated' : ''} size={15}/></button></div>
            {isPartBSection && sharedPartBOptions.length > 0 && <section className="part-b-choice-bank" aria-label="Part B 备选项"><div><span>OPTION BANK</span><h3>{partBOptionBankMeta.title}</h3><p>{partBOptionBankMeta.description}</p>{section?.partBSequence && <p className="part-b-sequence"><strong>已知顺序框架</strong>{section.partBSequence}</p>}</div><div className={hasLongPartBOptions ? 'part-b-shared-options long-options' : 'part-b-shared-options'}>{sharedPartBOptions.map((option, index) => <div key={index}>{option}</div>)}</div></section>}
            {filteredQuestions.map(item => {
              const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode)
              const itemStatusMeta = questionStatusMeta(item, itemStatus, binaryFilterMode)
              const itemAnswerOpen = expandedPassageAnswers.has(item.id)
              const itemHasAnswerImages = Boolean(item.answerImageKeys?.length || item.answerImageUrl)
              const itemUsesImageAnswer = itemHasAnswerImages && isImageAnswerPlaceholder(item.answer)
              const withoutRepeatedNumber = item.text.trim().replace(new RegExp(`^${item.number}\\s*[.\\uFF0E、)]\\s*`), '')
              const itemQuestionText = /^Blank\s+\d+\.?$/i.test(withoutRepeatedNumber) ? '' : withoutRepeatedNumber
              return <article className="passage-question" id={`question-${item.id}`} key={item.id}>
                <div className="passage-question-head"><span className="number">{String(item.number).padStart(2, '0')}</span><span className={`current-status ${itemStatus}`}>{itemStatusMeta.icon} {itemStatusMeta.label}</span></div>
                {itemQuestionText && <p className="passage-question-text">{itemQuestionText}</p>}
                <AssetGallery keys={item.imageKeys} urls={item.imageUrl ? [item.imageUrl] : []} alt="题目配图"/>
                {item.options && !isPartBSection && <div className="passage-options">{item.options.map((option, index) => <div key={index}>{option}</div>)}</div>}
                <button className="passage-answer-toggle" aria-expanded={itemAnswerOpen} onClick={() => togglePassageAnswer(item.id)}><CircleHelp size={16}/>{itemAnswerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={itemAnswerOpen ? 'rotated' : ''} size={15}/></button>
                {itemAnswerOpen && <div className="passage-answer">{!itemUsesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{item.answer}</strong></div>}<div className={itemUsesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}><span>{itemUsesImageAnswer ? '参考答案和解析' : '原版解析'}</span>{itemHasAnswerImages ? <AssetGallery keys={item.answerImageKeys} urls={item.answerImageUrl ? [item.answerImageUrl] : []} alt={itemUsesImageAnswer ? '参考答案和解析' : '原版解析截图'} eager/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div></div>}
                <QuestionNotePanel questionId={item.id} note={questionNotes[item.id]} onChange={note => updateQuestionNote(item.id, note)}/>
                <div className="passage-status"><div className="passage-markers">{readingTypePicker(item)}<span>掌握情况</span></div><div>{masteryChoices(item, binaryFilterMode).map(s => { const meta = questionStatusMeta(item, s, binaryFilterMode); return <button key={s} className={itemStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => markQuestion(item.id, itemStatus === s ? 'none' : s, item)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
              </article>
            })}
          </section>
          {(section?.passage || section?.passageImageUrls?.length) && <article className="source-passage">
            <div className="passage-block-heading"><span>ORIGINAL TEXT</span><h2>原文</h2><p>{section.passageImageUrls?.length ? '扫描版原卷无可靠文本层，按原页完整展示。' : '已清理 PDF 强制换行，按完整句子与阅读行宽重新排版。'}</p></div>
            {section.passage && <div className="source-copy">{formatPassageParagraphs(section.passage).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
            {section.passageImageUrls?.length && <div className="source-scan"><AssetGallery urls={section.passageImageUrls} alt="Part B 原卷原文"/></div>}
          </article>}
        </div><nav className="question-nav passage-question-nav" aria-label={showFullPaperNavigation ? '全卷导航' : '题号导航'}><div><strong>{showFullPaperNavigation ? '全卷导航' : '题号导航'}</strong><small>点击快速跳转</small></div><div className="number-grid">{showFullPaperNavigation ? currentPaperEntries.map(entry => { const item = entry.question; const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={item.id === question.id ? 'true' : undefined} title={`${entry.sectionName} · 第 ${item.number} 题`} className={`${item.id === question.id ? 'selected ' : ''}${itemStatus}`} onClick={() => navigateToBankQuestion(entry)}>{item.number}</button> }) : filteredQuestions.map((item, index) => { const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={index === questionIndex ? 'true' : undefined} title={`第 ${item.number} 题`} className={`${index === questionIndex ? 'selected ' : ''}${itemStatus}`} onClick={() => jumpToPassageQuestion(item.id, index)}>{item.number}</button> })}</div><div className="legend"><span><i/>未标记</span><span><i className="green"/>正确</span><span><i className="red"/>错误</span></div><div className="nav-accuracy"><span>本卷正确率</span><strong>{formatRate(currentNavigationStats.accuracy)}</strong><small>{currentNavigationStats.marked} 道题已标记</small></div></nav></div> : question ? <div className="study-layout">
          <section className="question-card">
            <div className="question-top"><div><span className="number">{String(question.number).padStart(2,'0')}</span>{currentQuestionEntry && <span className="wrong-context">{currentQuestionEntry.chapterName} · {currentQuestionEntry.sectionName}</span>}</div><nav className="question-top-pager" aria-label="上下题切换"><button disabled={questionIndex === 0} onClick={() => moveQuestion(-1)}><span>←</span> 上一题</button><em>{questionIndex + 1} / {filteredQuestions.length}</em><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => moveQuestion(1)}>下一题 <span>→</span></button></nav><span className={`current-status ${currentQuestionStatus}`}>{currentQuestionStatusMeta.icon} {currentQuestionStatusMeta.label}</span></div>
            <div className="question-content">{questionText && <p>{questionText}</p>}<AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图"/>{question.options && <div className="options">{question.options.map((o, i) => <div key={i}>{o}</div>)}</div>}</div>
            <button className="answer-toggle passage-answer-toggle standard-answer-toggle" onClick={() => setAnswerOpen(v => !v)}><CircleHelp size={19}/>{answerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={answerOpen ? 'rotated' : ''} size={18}/></button>
            {answerOpen && <div className={`${hasAnswerImages ? 'answer answer-with-images' : 'answer'} passage-answer standard-answer-panel`}>{!usesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{question.answer}</strong></div>}<div className={usesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}><span>{usesImageAnswer ? '参考答案和解析' : '原版解析'}</span>{hasAnswerImages ? <AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt={usesImageAnswer ? '参考答案和解析' : '原版解析截图'} eager/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div>{question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}</div>}
            <QuestionNotePanel questionId={question.id} note={questionNotes[question.id]} onChange={note => updateQuestionNote(question.id, note)}/>
            <div className="status-bar"><div className="status-labels">{readingTypePicker(question)}<span>掌握情况</span></div><div>{masteryChoices(question, binaryFilterMode).map(s => { const meta = questionStatusMeta(question, s, binaryFilterMode); return <button key={s} className={currentQuestionStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => mark(currentQuestionStatus === s ? 'none' : s)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
            <div className="pager"><button disabled={questionIndex === 0} onClick={() => moveQuestion(-1)}>← 上一题</button><span>{questionIndex + 1} / {filteredQuestions.length}</span><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => moveQuestion(1)}>下一题 →</button></div>
          </section>
          <nav className={view === 'wrong' ? 'question-nav review-question-nav' : 'question-nav'} aria-label={showFullPaperNavigation ? '全卷导航' : view === 'wrong' ? '不熟练题导航' : '题号导航'}>
            <div><strong>{showFullPaperNavigation ? '全卷导航' : view === 'wrong' ? '不熟练题导航' : '题号导航'}</strong><small>{view === 'wrong' ? `${reviewNavigationGroups.length} 个小节` : '点击快速跳转'}</small></div>
            {view === 'wrong' ? <div className="review-nav-groups">{reviewNavigationGroups.map(group => <section key={group.id}><span>{group.label}</span><div className="number-grid">{group.entries.map(entry => { const index = filteredQuestions.findIndex(item => item.id === entry.question.id); const navStatus = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); return <button key={entry.question.id} title={`${group.label} · 第 ${entry.question.number} 题`} className={`${index === questionIndex ? 'selected ' : ''}${navStatus}`} onClick={() => { setQuestionIndex(index); setAnswerOpen(false) }}>{entry.question.number}</button> })}</div></section>)}</div> : <div className="number-grid">{showFullPaperNavigation ? currentPaperEntries.map(entry => { const q = entry.question; const navStatus = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode); return <button key={q.id} aria-current={q.id === question.id ? 'true' : undefined} title={`${entry.sectionName} · 第 ${q.number} 题`} className={`${q.id === question.id ? 'selected ' : ''}${navStatus}`} onClick={() => navigateToBankQuestion(entry)}>{q.number}</button> }) : filteredQuestions.map((q, i) => { const navStatus = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode); return <button key={q.id} title={`第 ${q.number} 题`} className={`${i === questionIndex ? 'selected ' : ''}${navStatus}`} onClick={() => { setQuestionIndex(i); setAnswerOpen(false) }}>{q.number}</button> })}</div>}
            <div className="legend">{view !== 'wrong' && <><span><i/>未标记</span><span><i className="green"/>{binaryFilterMode ? '正确' : '熟练'}</span></>}{!binaryFilterMode && <span><i className="yellow"/>模糊</span>}<span><i className="red"/>{binaryFilterMode ? '错误' : '错题'}</span></div>
            {view === 'wrong' ? <div className="review-nav-summary">{!binaryFilterMode && <span><i className="yellow"/>模糊 <strong>{counts.vague}</strong></span>}<span><i className="red"/>{binaryFilterMode ? '错误' : '错题'} <strong>{counts.wrong}</strong></span></div> : <div className="nav-accuracy"><span>{showFullPaperNavigation ? '本卷正确率' : '本节正确率'}</span><strong>{formatRate(currentNavigationStats.accuracy)}</strong><small>{currentNavigationStats.marked} 道题已标记</small></div>}
          </nav>
        </div> : <div className="no-results"><Search size={32}/><h2>{view === 'wrong' && reviewQuestions.length === 0 ? '不熟练题已经清空' : '没有符合条件的题目'}</h2><p>{view === 'wrong' && reviewQuestions.length === 0 ? '很好，当前题库没有模糊或错误的题目。' : '尝试更换筛选条件或清空搜索词。'}</p><button onClick={() => view === 'wrong' && reviewQuestions.length === 0 ? setView('section') : (setFilter('all'), setQuery(''))}><RotateCcw size={16}/>{view === 'wrong' && reviewQuestions.length === 0 ? '返回当前小节' : '重置筛选'}</button></div>}

        {printMode && printJob && <section className="print-sheet" aria-hidden="true" ref={printSheetRef}>
          <div className="print-title"><h1>{printJob.title}</h1><p>{printJob.subtitle}</p></div>
          {Array.from({ length: Math.ceil(printJob.questions.length / printJob.perPage) }, (_, index) => <ExportPage key={index} questions={printJob.questions.slice(index * printJob.perPage, (index + 1) * printJob.perPage)} statuses={printJob.statuses} pageNumber={index + 1} showType={false}/>) }
        </section>}
        </>}
      </main>
    </div>
    {toast && <div className="toast">{toast}</div>}
    {newBankOpen && <div className="modal-backdrop" onClick={() => setNewBankOpen(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-bank-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNewBankOpen(false)}><X/></button><span className="modal-icon"><BookOpen/></span><h2 id="new-bank-title">新建题库</h2><p>先选择学科并起一个名字，再点击顶部“图片”选择素材目录，章节和题目会自动生成。</p><label>所属学科<select value={newBankSubject} onChange={event => setNewBankSubject(event.target.value as Subject)}><option value="math">数学</option><option value="english">英语</option><option value="professional">专业课</option></select></label><label>题库名称<input autoFocus value={newBankName} onChange={event => setNewBankName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createBank() }} placeholder={newBankSubject === 'professional' ? '例如：计算机专业基础综合' : '例如：线性代数强化题'}/></label><button className="primary-button" onClick={createBank}>创建并开始导入</button></section></div>}
    {namingHelpOpen && <div className="modal-backdrop" onClick={() => setNamingHelpOpen(false)}><section className="modal-card naming-card" role="dialog" aria-modal="true" aria-labelledby="naming-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNamingHelpOpen(false)}><X/></button><span className="modal-icon"><FileImage/></span><h2 id="naming-title">图片命名标准</h2><p>Q 表示题目，A 表示答案；后面依次是章号－小节号－题号。</p><div className="naming-example"><code>Q-01-1-01.png</code><span>单张题目图</span><code>Q-01-1-01.1.png</code><span>多图组成时的第 1 张</span><code>Q-01-1-01.2.png</code><span>多图组成时的第 2 张</span><code>A-01-1-01.png</code><span>单张答案图</span><code>A-01-1-01.1.png</code><span>多张答案中的第 1 张</span><code>A-01-1-01.2.png</code><span>多张答案中的第 2 张</span></div><h3>文件夹命名标准</h3><code className="folder-example">01 行列式 1-基础</code><p>自动生成“行列式”章节和“基础”小节。未按以上标准命名的图片会被跳过。</p><button className="primary-button" onClick={() => setNamingHelpOpen(false)}>我知道了</button></section></div>}
    {exportOpen && <ExportDialog banks={banks} statuses={statuses} defaultBankId={bank.id} defaultSectionId={sectionId} onClose={() => setExportOpen(false)} onPdf={printExport} onNotice={setToast}/>}
    {renameTarget && <div className="modal-backdrop" onClick={() => setRenameTarget(null)}><section className="modal-card rename-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setRenameTarget(null)}><X/></button><span className="modal-icon"><Pencil/></span><h2 id="rename-title">重命名{renameTarget.kind === 'bank' ? '题库' : '章节'}</h2><p>只修改显示名称，不会改变题目、图片或学习状态。</p><label>新名称<input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyRename() }} placeholder={renameTarget.name}/></label><button className="primary-button" onClick={applyRename}>保存名称</button></section></div>}
    {settingsOpen && <SettingsDialog banks={banks} activeBankId={bank.id} builtInIds={new Set(builtInBanks.map(item => item.id))} protectedBankIds={protectedBankIds} onClose={() => setSettingsOpen(false)} onClearMarks={clearMarks} onExportBank={exportSingleBank} onResetBank={resetManagedBank} onDeleteBank={deleteManagedBank} onRestoreBuiltIns={restoreBuiltIns} onFactoryReset={factoryReset}/>}
  </div>
}
