import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, CircleHelp, Download, FileImage, FileText, FileUp, Filter, FolderOpen, FolderSync, Menu, Pencil, Plus, RotateCcw, Search, Settings as SettingsIcon, X } from 'lucide-react'
import type { Question, QuestionBank, QuestionStatus, ReadingQuestionType, Section } from './types'
import { loadBanks, loadNavigation, loadStatuses, renameBank, renameChapter, saveBanks, saveNavigation, saveStatuses, validateBanks, validateStatuses } from './store'
import { deleteAssets } from './assets'
import AssetGallery from './AssetGallery'
import ExportDialog, { ExportPage, type ExportJob } from './ExportDialog'
import SettingsDialog from './SettingsDialog'
import { assetKeysForBank, clearQuestionStatuses, orderedQuestionEntriesForBank, questionIdsForBank, removeBank, resetBankData } from './bankManagement'
import { builtInBanks, defaultBankIds, englishBanks } from './data'
import { mergeImageEntries } from './imageImport'
import { BUILTIN_ENGLISH_VERSION, chooseWorkspace, clearWorkspaceHandle, createBankFolder, hasWorkspacePermission, isMissingWorkspaceError, loadWorkspaceHandle, readDefaultWorkspace, readWorkspaceManifest, readWorkspaceUserData, removeBankFolder, safeFolderName, scanWorkspaceImages, writeDefaultWorkspaceManifest, writeDefaultWorkspaceUserData, writeWorkspaceManifest, writeWorkspaceUserData } from './workspace'
import { formatPassageParagraphs } from './passageFormatting'

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '熟练', icon: '✓' }, vague: { label: '模糊', icon: '?' }, wrong: { label: '错题', icon: '×' }
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

type Subject = 'math' | 'english'
const bankSubject = (item: QuestionBank): Subject => item.id.startsWith('english-') || /英语/i.test(item.name) ? 'english' : 'math'
const protectedBankIds = new Set<string>(defaultBankIds)

export default function App() {
  const [banks, setBanks] = useState(loadBanks)
  const [statuses, setStatuses] = useState(loadStatuses)
  const [bankId, setBankId] = useState(banks[0]?.id || '')
  const [sectionId, setSectionId] = useState(banks[0]?.chapters[0]?.sections[0]?.id || '')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [expandedPassageAnswers, setExpandedPassageAnswers] = useState<Set<string>>(() => new Set())
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set(banks[0]?.chapters[0] ? [banks[0].chapters[0].id] : []))
  const [filter, setFilter] = useState<QuestionStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [view, setView] = useState<'section' | 'wrong'>('section')
  const [toast, setToast] = useState('')
  const [printMode, setPrintMode] = useState(false)
  const [printJob, setPrintJob] = useState<ExportJob | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newBankOpen, setNewBankOpen] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [namingHelpOpen, setNamingHelpOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ kind: 'bank' | 'chapter'; id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [navigationReady, setNavigationReady] = useState(false)
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceState, setWorkspaceState] = useState<'none' | 'available' | 'syncing' | 'connected' | 'error'>('none')
  const [workspaceFolders, setWorkspaceFolders] = useState<Record<string, string>>({})
  const [defaultWorkspaceConnected, setDefaultWorkspaceConnected] = useState(false)
  const workspaceReady = useRef(false)
  const importRef = useRef<HTMLInputElement>(null)
  const imageImportRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!saveBanks(banks)) setToast('浏览器存储空间不足，题库修改尚未保存；请连接题库文件夹或先导出备份') }, [banks])
  useEffect(() => { if (!saveStatuses(statuses)) setToast('学习标记保存失败，请先导出备份后检查浏览器存储空间') }, [statuses])
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
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceUserData(statuses)
        : workspaceHandle ? writeWorkspaceUserData(workspaceHandle, statuses) : Promise.resolve()
      save.catch(() => setWorkspaceState('error'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [statuses, workspaceHandle, workspaceState, defaultWorkspaceConnected])
  useEffect(() => {
    const saved = loadNavigation()
    if (saved) {
      const savedBank = banks.find(item => item.id === saved.bankId)
      const savedSection = savedBank?.chapters.flatMap(chapter => chapter.sections).find(item => item.id === saved.sectionId)
      if (savedBank && savedSection) {
        const savedQuestions = saved.view === 'wrong'
          ? orderedQuestionEntriesForBank(savedBank).map(entry => entry.question).filter(item => statuses[item.id] === 'wrong')
          : savedSection.questions
        const savedChapter = savedBank.chapters.find(chapter => chapter.sections.some(item => item.id === savedSection.id))
        setBankId(savedBank.id); setSectionId(savedSection.id); setView(saved.view)
        if (savedChapter) setExpandedChapterIds(new Set([savedChapter.id]))
        setQuestionIndex(Math.max(0, savedQuestions.findIndex(item => item.id === saved.questionId)))
      }
    }
    setNavigationReady(true)
  }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const finishPrinting = () => { setPrintMode(false); setPrintJob(null) }
    window.addEventListener('afterprint', finishPrinting)
    return () => window.removeEventListener('afterprint', finishPrinting)
  }, [])

  const bank = banks.find(b => b.id === bankId) || banks[0]
  const subject = bankSubject(bank)
  const subjectBanks = banks.filter(item => bankSubject(item) === subject)
  const section: Section | undefined = bank?.chapters.flatMap(c => c.sections).find(s => s.id === sectionId)
  const bankQuestionEntries = useMemo(() => orderedQuestionEntriesForBank(bank), [bank])
  const wrongEntries = useMemo(() => bankQuestionEntries.filter(entry => statuses[entry.question.id] === 'wrong'), [bankQuestionEntries, statuses])
  const wrongQuestions = useMemo(() => wrongEntries.map(entry => entry.question), [wrongEntries])
  const sourceQuestions = view === 'wrong' ? wrongQuestions : (section?.questions || [])
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
  const filterOptions: Array<QuestionStatus | 'all'> = binaryFilterMode ? ['all', 'none', 'wrong', 'proficient'] : ['all', 'none', 'wrong', 'vague', 'proficient']
  const filteredQuestions = useMemo(() => sourceQuestions.filter(q => {
    const matchesStatus = filter === 'all' || effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode) === filter
    const readingLabel = readingTypeMeta.find(item => item.value === q.readingType)?.label || ''
    const haystack = `${q.text} ${q.answer} ${q.analysis} ${readingLabel}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [sourceQuestions, filter, query, statuses, binaryFilterMode])
  const question = filteredQuestions[Math.min(questionIndex, Math.max(0, filteredQuestions.length - 1))]
  const questionText = question && (question.type === '图片题' || question.imageUrl || question.imageKeys?.length) && question.text === `第 ${question.number} 题` ? '' : question?.text
  const hasAnswerImages = Boolean(question?.answerImageKeys?.length || question?.answerImageUrl)
  const currentQuestionEntry = view === 'wrong' ? wrongEntries.find(entry => entry.question.id === question?.id) : undefined
  const currentQuestionStatus = effectiveQuestionStatus(question, question ? statuses[question.id] || 'none' : 'none', binaryFilterMode)
  const currentQuestionStatusMeta = questionStatusMeta(question, currentQuestionStatus, binaryFilterMode)
  const counts = bankQuestionEntries.reduce((acc, entry) => { const s = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); acc[s]++; return acc }, { none: 0, proficient: 0, vague: 0, wrong: 0 })
  const allPassageAnswersOpen = filteredQuestions.length > 0 && filteredQuestions.every(item => expandedPassageAnswers.has(item.id))

  useEffect(() => {
    if (!navigationReady) return
    saveNavigation({ bankId: bank?.id || '', sectionId, questionId: question?.id || '', view })
  }, [navigationReady, bank?.id, sectionId, question?.id, view])

  function selectBank(next: QuestionBank) {
    setBankId(next.id); setSectionId(next.chapters[0]?.sections[0]?.id || ''); setExpandedChapterIds(new Set(next.chapters[0] ? [next.chapters[0].id] : [])); setQuestionIndex(0); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setFilter('all'); setView('section'); setSidebar(false)
  }
  function selectSubject(nextSubject: Subject) {
    const nextBank = banks.find(item => bankSubject(item) === nextSubject)
    if (nextBank) selectBank(nextBank)
    else setToast(nextSubject === 'english' ? '还没有英语题库' : '还没有数学题库')
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
  function showWrongBook() { setView('wrong'); setFilter('all'); setQuery(''); setQuestionIndex(0); setAnswerOpen(false); setExpandedPassageAnswers(new Set()); setSidebar(false) }
  function markQuestion(questionId: string, status: QuestionStatus, targetQuestion?: Question) {
    const item = targetQuestion || bankQuestionEntries.find(entry => entry.question.id === questionId)?.question
    setStatuses(prev => ({ ...prev, [questionId]: status })); setToast(`已标记为“${questionStatusMeta(item, status, binaryFilterMode).label}”`)
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
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, banks, statuses }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `本地题库备份-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  function exportSingleBank(targetBank: QuestionBank) {
    const blob = new Blob([JSON.stringify({ version: 1, banks: [targetBank] }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${targetBank.name.replace(/[\\/:*?"<>|]/g, '-')}.json`; link.click(); URL.revokeObjectURL(url); setToast(`已导出“${targetBank.name}”`)
  }
  function clearMarks(targetBankId: string | 'all', status: QuestionStatus | 'all') {
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
    setBanks(defaults); setStatuses({}); setBankId(defaults[0].id); setSectionId(defaults[0].chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setView('section'); setSettingsOpen(false); setToast('已恢复出厂设置，默认题库已保留')
  }
  function printExport(job: ExportJob) {
    if (!job.questions.length) { setToast('当前条件下没有可导出的题目'); return }
    setPrintJob(job); setExportOpen(false)
    setToast('正在打开打印预览，可选择“另存为 PDF”')
    setPrintMode(true)
    setTimeout(() => window.print(), 500)
  }
  async function importData(file?: File) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()); const imported = validateBanks(parsed)
      setBanks(prev => [...prev.filter(b => !imported.some(i => i.id === b.id)), ...imported])
      if (parsed.statuses) setStatuses(prev => ({ ...prev, ...validateStatuses(parsed.statuses) }))
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
      let nextBanks = index.manifest ? validateBanks(index.manifest) : structuredClone(banks)
      if (index.manifest && index.manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        const englishIds = new Set(englishBanks.map(bank => bank.id))
        nextBanks = [...nextBanks.filter(bank => !englishIds.has(bank.id)), ...structuredClone(englishBanks)]
      }
      const storedStatuses = index.userData?.statuses || index.manifest?.statuses
      const nextStatuses = storedStatuses ? validateStatuses(storedStatuses) : statuses
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
      const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
      const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
      if (activeBank && !activeSections.some(item => item.id === sectionId)) {
        setBankId(activeBank.id); setSectionId(activeSections[0]?.id || ''); setQuestionIndex(0)
      }
      workspaceReady.current = false
      setBanks(result.banks); setStatuses(nextStatuses); setWorkspaceFolders(folders); setWorkspaceHandle(null); setDefaultWorkspaceConnected(true); setWorkspaceState('connected')
      window.setTimeout(() => {
        workspaceReady.current = true
        Promise.all([writeDefaultWorkspaceManifest(result.banks, folders), writeDefaultWorkspaceUserData(nextStatuses)]).catch(() => setWorkspaceState('error'))
      }, 0)
      setToast(`已自动连接“${index.name}”${result.imported ? `，识别 ${result.imported} 张图片` : ''}`)
      return true
    } catch {
      setDefaultWorkspaceConnected(false); setWorkspaceState('none')
      return false
    }
  }

  async function loadWorkspace(handle: FileSystemDirectoryHandle) {
    setWorkspaceState('syncing')
    try {
      if (!await hasWorkspacePermission(handle, true)) throw new Error('未获得题库文件夹读写权限')
      const [manifest, userData] = await Promise.all([readWorkspaceManifest(handle), readWorkspaceUserData(handle)])
      let nextBanks = manifest ? validateBanks(manifest) : structuredClone(banks)
      let seededEnglishCount = 0
      if (manifest && manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        const englishIds = new Set(englishBanks.map(bank => bank.id))
        seededEnglishCount = englishBanks.length
        nextBanks = [...nextBanks.filter(bank => !englishIds.has(bank.id)), ...structuredClone(englishBanks)]
      }
      const storedStatuses = userData?.statuses || manifest?.statuses
      const nextStatuses = storedStatuses ? validateStatuses(storedStatuses) : statuses
      const images = await scanWorkspaceImages(handle)
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
      const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
      const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
      if (activeBank && !activeSections.some(item => item.id === sectionId)) {
        setBankId(activeBank.id)
        setSectionId(activeSections[0]?.id || '')
        setQuestionIndex(0)
      }
      workspaceReady.current = false
      setBanks(result.banks); setStatuses(nextStatuses); setWorkspaceFolders(folders); setWorkspaceHandle(handle); setDefaultWorkspaceConnected(false)
      setWorkspaceState('connected')
      window.setTimeout(() => {
        workspaceReady.current = true
        Promise.all([writeWorkspaceManifest(handle, result.banks, folders), writeWorkspaceUserData(handle, nextStatuses)]).catch(() => setWorkspaceState('error'))
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
        void Promise.all([writeWorkspaceManifest(workspaceHandle, banks, workspaceFolders), writeWorkspaceUserData(workspaceHandle, statuses)]).catch(() => {})
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
    const created: QuestionBank = { id: `local-${Date.now()}`, name, description: '自建本地题库', source: 'local', chapters: [] }
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

  return <div className="app-shell">
    <header>
      <button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu/></button>
      <div className="brand"><span className="brand-mark"><BookOpen size={20}/></span><div><strong>本地题库</strong><small>QUESTION BANK</small></div></div>
      <nav className="subject-nav" aria-label="学科导航">
        <button className={subject === 'math' ? 'active' : ''} onClick={() => selectSubject('math')}>数学</button>
        <button className={subject === 'english' ? 'active' : ''} onClick={() => selectSubject('english')}>英语</button>
      </nav>
      <div className="header-center"><span className={`source-dot ${workspaceState === 'connected' ? 'workspace-on' : ''}`}/>{workspaceState === 'connected' ? `已同步：${defaultWorkspaceConnected ? '默认题库' : workspaceHandle?.name}` : workspaceState === 'syncing' ? '正在同步题库文件夹…' : '本地增强模式 · 数据与位置自动保存'}</div>
      <div className="header-actions">
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e => importData(e.target.files?.[0])}/>
        <input ref={node => { imageImportRef.current = node; node?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple accept="image/*" onChange={e => importImages(e.target.files)}/>
        <div className="header-action-group import-tools">
          <button className={workspaceState === 'connected' ? 'tool-button workspace-connected primary-tool' : 'tool-button primary-tool'} title="连接本地题库文件夹并实时同步" onClick={connectWorkspace}><FolderSync/><span>{workspaceState === 'connected' ? '已连接' : '题库文件夹'}</span></button>
          {workspaceState === 'connected' && <button className="tool-button" title="切换到其他本地题库目录" aria-label="切换本地题库" onClick={switchWorkspace}><FolderOpen/><span>切换题库</span></button>}
          <button className="tool-button" title="导入 JSON 题库" onClick={() => importRef.current?.click()}><FileUp/><span>导入</span></button>
          <button className="tool-button" title="批量导入题目图和答案图" onClick={() => imageImportRef.current?.click()}><FileImage/><span>图片</span></button>
        </div>
        <div className="header-action-group utility-tools">
          <button className="tool-button icon-tool" title="查看图片命名参考" aria-label="图片命名参考" onClick={() => setNamingHelpOpen(true)}><CircleHelp/></button>
          <button className="tool-button icon-tool" title="设置与数据管理" aria-label="设置与数据管理" onClick={() => setSettingsOpen(true)}><SettingsIcon/></button>
        </div>
        <div className="header-action-group output-tools">
          <button className="tool-button" title="导出 PDF 或图片" onClick={() => setExportOpen(true)}><FileText/><span>导出</span></button>
          <button className="tool-button" title="备份题库数据" onClick={exportData}><Download/><span>备份</span></button>
        </div>
      </div>
    </header>

    <div className="body-grid">
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)}/>} 
      <aside className={sidebar ? 'open' : ''}>
        <div className="aside-mobile-title"><strong>题库导航</strong><button onClick={() => setSidebar(false)}><X/></button></div>
        <p className="eyebrow">题库类型</p>
        <div className="bank-select-row"><span className="bank-select-icon"><BookOpen size={17}/></span><select aria-label="选择题库" value={bank.id} onChange={event => { const selected = banks.find(item => item.id === event.target.value); if (selected) selectBank(selected) }}>{subjectBanks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rename-button" aria-label={`重命名题库 ${bank.name}`} onClick={() => openRename('bank', bank.id, bank.name)}><Pencil size={13}/></button></div>
        <div className="selected-bank-meta">{bank.description || (bank.source === 'local' ? '本地题库' : '远程题库')} · {bank.chapters.length} 章</div>
        <button className="new-bank-button" onClick={() => setNewBankOpen(true)}><Plus size={16}/>新建题库</button>
        <button className={view === 'wrong' ? 'wrong-book active' : 'wrong-book'} onClick={showWrongBook}><AlertCircle size={17}/><span><strong>本题库错题本</strong><small>当前题库中的错题</small></span><em>{counts.wrong}</em></button>
        <div className="divider"/>
        <p className="eyebrow">章节导航</p>
        <div className="chapter-scroll"><div className="chapter-tree">{bank.chapters.map(chapter => <div className="chapter" key={chapter.id}>
          <div className="chapter-title"><button className="chapter-toggle" aria-expanded={expandedChapterIds.has(chapter.id)} onClick={() => toggleChapter(chapter.id)}>{expandedChapterIds.has(chapter.id) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{chapter.name}</span><em>{chapter.sections.length}</em></button><button className="rename-button" aria-label={`重命名章节 ${chapter.name}`} onClick={() => openRename('chapter', chapter.id, chapter.name)}><Pencil size={12}/></button></div>
          {expandedChapterIds.has(chapter.id) && chapter.sections.map(s => <button key={s.id} onClick={() => selectSection(s.id)} className={s.id === sectionId ? 'section active' : 'section'}><span>{s.name}</span><em>{s.questions.length}</em></button>)}
        </div>)}{bank.chapters.length === 0 && <div className="empty-chapters">还没有章节<br/><small>点击顶部“图片”批量导入</small></div>}</div></div>
        <div className="aside-summary"><strong>学习概览</strong>{binaryFilterMode ? <div className="binary-summary"><span><i/>{counts.none} 未标记</span><span><i className="green"/>{counts.proficient} 正确</span><span><i className="red"/>{counts.wrong} 错误</span></div> : <div><span><i className="green"/>{counts.proficient} 熟练</span><span><i className="yellow"/>{counts.vague} 模糊</span><span><i className="red"/>{counts.wrong} 错题</span></div>}</div>
      </aside>

      <main>
        <div className="page-head"><div><span className="breadcrumb">{bank.name} <ChevronRight size={13}/> {view === 'wrong' ? '本题库错题本' : section?.name || '未选择'}</span><h1>{view === 'wrong' ? '本题库错题本' : section?.name || '请选择具体节题目'}</h1><p>{view === 'wrong' ? `按章节和题号排列 · 共 ${wrongQuestions.length} 道错题` : section ? `共 ${section.questions.length} 道题 · 学习进度实时保存` : '从左侧选择一个章节开始学习'}</p></div>
          <div className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setQuestionIndex(0) }} placeholder={view === 'wrong' ? '搜索全部错题' : '搜索当前小节'}/></div>
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
              const withoutRepeatedNumber = item.text.trim().replace(new RegExp(`^${item.number}\\s*[.\\uFF0E、)]\\s*`), '')
              const itemQuestionText = /^Blank\s+\d+\.?$/i.test(withoutRepeatedNumber) ? '' : withoutRepeatedNumber
              return <article className="passage-question" id={`question-${item.id}`} key={item.id}>
                <div className="passage-question-head"><span className="number">{String(item.number).padStart(2, '0')}</span><span className={`current-status ${itemStatus}`}>{itemStatusMeta.icon} {itemStatusMeta.label}</span></div>
                {itemQuestionText && <p className="passage-question-text">{itemQuestionText}</p>}
                <AssetGallery keys={item.imageKeys} urls={item.imageUrl ? [item.imageUrl] : []} alt="题目配图"/>
                {item.options && !isPartBSection && <div className="passage-options">{item.options.map((option, index) => <div key={index}>{option}</div>)}</div>}
                <button className="passage-answer-toggle" aria-expanded={itemAnswerOpen} onClick={() => togglePassageAnswer(item.id)}><CircleHelp size={16}/>{itemAnswerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={itemAnswerOpen ? 'rotated' : ''} size={15}/></button>
                {itemAnswerOpen && <div className="passage-answer"><div className="answer-result"><span>参考答案</span><strong>{item.answer}</strong></div><div className="answer-analysis"><span>原版解析</span>{(item.answerImageKeys?.length || item.answerImageUrl) ? <AssetGallery keys={item.answerImageKeys} urls={item.answerImageUrl ? [item.answerImageUrl] : []} alt="原版解析截图"/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div></div>}
                <div className="passage-status"><div className="passage-markers">{readingTypePicker(item)}<span>掌握情况</span></div><div>{masteryChoices(item, binaryFilterMode).map(s => { const meta = questionStatusMeta(item, s, binaryFilterMode); return <button key={s} className={itemStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => markQuestion(item.id, itemStatus === s ? 'none' : s, item)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
              </article>
            })}
          </section>
          {(section?.passage || section?.passageImageUrls?.length) && <article className="source-passage">
            <div className="passage-block-heading"><span>ORIGINAL TEXT</span><h2>原文</h2><p>{section.passageImageUrls?.length ? '扫描版原卷无可靠文本层，按原页完整展示。' : '已清理 PDF 强制换行，按完整句子与阅读行宽重新排版。'}</p></div>
            {section.passage && <div className="source-copy">{formatPassageParagraphs(section.passage).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
            {section.passageImageUrls?.length && <div className="source-scan"><AssetGallery urls={section.passageImageUrls} alt="Part B 原卷原文"/></div>}
          </article>}
        </div><nav className="question-nav passage-question-nav" aria-label="题号导航"><div><strong>题号导航</strong><small>点击快速跳转</small></div><div className="number-grid">{filteredQuestions.map((item, index) => { const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={index === questionIndex ? 'true' : undefined} title={`第 ${item.number} 题`} className={`${index === questionIndex ? 'selected ' : ''}${itemStatus}`} onClick={() => jumpToPassageQuestion(item.id, index)}>{item.number}</button> })}</div><div className="legend"><span><i/>未标记</span><span><i className="green"/>正确</span><span><i className="red"/>错误</span></div></nav></div> : question ? <div className="study-layout">
          <section className="question-card">
            <div className="question-top"><div><span className="number">{String(question.number).padStart(2,'0')}</span>{question.type && <span className="type">{question.type}</span>}{currentQuestionEntry && <span className="wrong-context">{currentQuestionEntry.chapterName} · {currentQuestionEntry.sectionName}</span>}</div><span className={`current-status ${currentQuestionStatus}`}>{currentQuestionStatusMeta.icon} {currentQuestionStatusMeta.label}</span></div>
            <div className="question-content">{questionText && <p>{questionText}</p>}<AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图"/>{question.options && <div className="options">{question.options.map((o, i) => <div key={i}>{o}</div>)}</div>}</div>
            <div className="status-bar"><div className="status-labels">{readingTypePicker(question)}<span>掌握情况</span></div><div>{masteryChoices(question, binaryFilterMode).map(s => { const meta = questionStatusMeta(question, s, binaryFilterMode); return <button key={s} className={currentQuestionStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => mark(currentQuestionStatus === s ? 'none' : s)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
            <button className="answer-toggle" onClick={() => setAnswerOpen(v => !v)}><CircleHelp size={19}/>{answerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={answerOpen ? 'rotated' : ''} size={18}/></button>
            {answerOpen && <div className={hasAnswerImages ? 'answer answer-with-images' : 'answer'}><div className="answer-result"><span>参考答案</span><strong>{question.answer}</strong></div><div className="answer-analysis"><span>原版解析</span>{hasAnswerImages ? <AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt="原版解析截图"/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div>{question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}</div>}
            <div className="pager"><button disabled={questionIndex === 0} onClick={() => { setQuestionIndex(i => i - 1); setAnswerOpen(false) }}>← 上一题</button><span>{questionIndex + 1} / {filteredQuestions.length}</span><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => { setQuestionIndex(i => i + 1); setAnswerOpen(false) }}>下一题 →</button></div>
          </section>
          <nav className="question-nav"><div><strong>题号导航</strong><small>{view === 'wrong' ? '章-题号' : '点击快速跳转'}</small></div><div className="number-grid">{filteredQuestions.map((q, i) => { const entry = view === 'wrong' ? wrongEntries.find(item => item.question.id === q.id) : undefined; const navStatus = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode); return <button key={q.id} title={entry ? `${entry.chapterName} · 第 ${q.number} 题` : `第 ${q.number} 题`} className={`${i === questionIndex ? 'selected ' : ''}${navStatus}`} onClick={() => { setQuestionIndex(i); setAnswerOpen(false) }}>{entry ? `${entry.chapterIndex + 1}-${q.number}` : q.number}</button> })}</div><div className="legend"><span><i/>未标记</span><span><i className="green"/>{binaryFilterMode ? '正确' : '熟练'}</span>{!binaryFilterMode && <span><i className="yellow"/>模糊</span>}<span><i className="red"/>{binaryFilterMode ? '错误' : '错题'}</span></div></nav>
        </div> : <div className="no-results"><Search size={32}/><h2>{view === 'wrong' && wrongQuestions.length === 0 ? '错题已经清空' : '没有符合条件的题目'}</h2><p>{view === 'wrong' && wrongQuestions.length === 0 ? '很好，继续练习其他章节巩固掌握情况。' : '尝试更换筛选条件或清空搜索词。'}</p><button onClick={() => view === 'wrong' && wrongQuestions.length === 0 ? setView('section') : (setFilter('all'), setQuery(''))}><RotateCcw size={16}/>{view === 'wrong' && wrongQuestions.length === 0 ? '返回当前小节' : '重置筛选'}</button></div>}

        {printMode && printJob && <section className="print-sheet" aria-hidden="true">
          <div className="print-title"><h1>{printJob.title}</h1><p>{printJob.subtitle}</p></div>
          {Array.from({ length: Math.ceil(printJob.questions.length / printJob.perPage) }, (_, index) => <ExportPage key={index} questions={printJob.questions.slice(index * printJob.perPage, (index + 1) * printJob.perPage)} includeAnswers={printJob.includeAnswers} pageNumber={index + 1} showType={false}/>) }
        </section>}
      </main>
    </div>
    {toast && <div className="toast">{toast}</div>}
    {newBankOpen && <div className="modal-backdrop" onClick={() => setNewBankOpen(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-bank-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNewBankOpen(false)}><X/></button><span className="modal-icon"><BookOpen/></span><h2 id="new-bank-title">新建题库</h2><p>先起一个名字，再点击顶部“图片”选择素材目录，章节和题目会自动生成。</p><label>题库名称<input autoFocus value={newBankName} onChange={event => setNewBankName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createBank() }} placeholder="例如：线性代数强化题"/></label><button className="primary-button" onClick={createBank}>创建并开始导入</button></section></div>}
    {namingHelpOpen && <div className="modal-backdrop" onClick={() => setNamingHelpOpen(false)}><section className="modal-card naming-card" role="dialog" aria-modal="true" aria-labelledby="naming-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNamingHelpOpen(false)}><X/></button><span className="modal-icon"><FileImage/></span><h2 id="naming-title">图片命名标准</h2><p>Q 表示题目，A 表示答案；后面依次是章号－小节号－题号。</p><div className="naming-example"><code>Q-01-1-01.png</code><span>单张题目图</span><code>Q-01-1-01.1.png</code><span>多图组成时的第 1 张</span><code>Q-01-1-01.2.png</code><span>多图组成时的第 2 张</span><code>A-01-1-01.png</code><span>单张答案图</span><code>A-01-1-01.1.png</code><span>多张答案中的第 1 张</span><code>A-01-1-01.2.png</code><span>多张答案中的第 2 张</span></div><h3>文件夹命名标准</h3><code className="folder-example">01 行列式 1-基础</code><p>自动生成“行列式”章节和“基础”小节。未按以上标准命名的图片会被跳过。</p><button className="primary-button" onClick={() => setNamingHelpOpen(false)}>我知道了</button></section></div>}
    {exportOpen && <ExportDialog banks={banks} statuses={statuses} defaultBankId={bank.id} defaultSectionId={sectionId} onClose={() => setExportOpen(false)} onPdf={printExport} onNotice={setToast}/>}
    {renameTarget && <div className="modal-backdrop" onClick={() => setRenameTarget(null)}><section className="modal-card rename-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setRenameTarget(null)}><X/></button><span className="modal-icon"><Pencil/></span><h2 id="rename-title">重命名{renameTarget.kind === 'bank' ? '题库' : '章节'}</h2><p>只修改显示名称，不会改变题目、图片或学习状态。</p><label>新名称<input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyRename() }} placeholder={renameTarget.name}/></label><button className="primary-button" onClick={applyRename}>保存名称</button></section></div>}
    {settingsOpen && <SettingsDialog banks={banks} activeBankId={bank.id} builtInIds={new Set(builtInBanks.map(item => item.id))} protectedBankIds={protectedBankIds} onClose={() => setSettingsOpen(false)} onClearMarks={clearMarks} onExportBank={exportSingleBank} onResetBank={resetManagedBank} onDeleteBank={deleteManagedBank} onRestoreBuiltIns={restoreBuiltIns} onFactoryReset={factoryReset}/>}
  </div>
}
