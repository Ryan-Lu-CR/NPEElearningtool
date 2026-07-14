import { useEffect, useMemo, useState } from 'react'
import { FileImage, FileText, X } from 'lucide-react'
import AssetGallery from './AssetGallery'
import { getAssetFiles } from './assets'
import { safeFolderName } from './workspace'
import type { Question, QuestionBank, QuestionStatus } from './types'

export interface ExportJob {
  title: string
  subtitle: string
  questions: Question[]
  perPage: 1 | 2
  statuses: Record<string, QuestionStatus>
}

interface Props {
  banks: QuestionBank[]
  statuses: Record<string, QuestionStatus>
  defaultBankId: string
  defaultSectionId: string
  onClose: () => void
  onPdf: (job: ExportJob) => void
  onNotice: (message: string) => void
}

interface WritableFileHandle { createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }
interface DirectoryHandle {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options: { create: boolean }): Promise<WritableFileHandle>
}
type ExportStatusFilter = QuestionStatus | 'all' | 'review'

const statusOptions: Array<{ value: ExportStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' }, { value: 'review', label: '错题和模糊' }, { value: 'none', label: '未标记' }, { value: 'proficient', label: '熟练' }, { value: 'vague', label: '模糊' }, { value: 'wrong', label: '错题' }
]
const exportStatusLabels: Record<QuestionStatus, string> = { none: '未标记', proficient: '熟练', vague: '模糊', wrong: '错题' }

export function splitPages(questions: Question[], perPage: number) {
  return Array.from({ length: Math.ceil(questions.length / perPage) }, (_, index) => questions.slice(index * perPage, (index + 1) * perPage))
}

export function filterQuestionsForExport(questions: Question[], status: ExportStatusFilter, statuses: Record<string, QuestionStatus>) {
  return questions.filter(question => {
    const questionStatus = statuses[question.id] || 'none'
    return status === 'all' || (status === 'review' ? questionStatus === 'wrong' || questionStatus === 'vague' : questionStatus === status)
  })
}

function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '题库导出' }
export function dateFolderName(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
export function originalAssetName(key: string) {
  const name = decodeURIComponent(key.replaceAll('\\', '/').split('/').pop() || '题目图片')
  return safeName(name.replace(/^\d+-(?=Q-)/i, ''))
}
export function imageExportFolderName(bankName: string, chapterName: string, sectionName: string, date = new Date()) {
  return safeFolderName([dateFolderName(date), bankName || '题库', chapterName || '章节', sectionName || '小节'].join('-'))
}
function fileNameFromUrl(url: string, questionNumber: number) {
  try {
    const parsed = new URL(url, window.location.href)
    const path = parsed.searchParams.get('path') || parsed.pathname
    const sourceName = decodeURIComponent(path.replaceAll('\\', '/').split('/').pop() || '')
    if (sourceName && /\.[a-z0-9]+$/i.test(sourceName)) return safeName(sourceName)
  } catch { /* Use a stable fallback below. */ }
  return `Q-${String(questionNumber).padStart(2, '0')}.png`
}

function nextFrame() { return new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
function rejectAfter(ms: number, message: string) { return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)) }

export async function waitForExportContent(container: HTMLElement, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (container.querySelector('[data-export-asset-state="loading"]')) {
    if (Date.now() >= deadline) throw new Error('题目图片加载超时，请检查题库图片后重试')
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  if (container.querySelector('[data-export-asset-state="error"]')) throw new Error('题目图片读取失败，请重新连接题库文件夹后重试')

  const images = Array.from(container.querySelectorAll('img'))
  const loadImages = Promise.all(images.map(async image => {
    if (!image.complete) await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error(`图片加载失败：${image.alt || '题目图片'}`)), { once: true })
    })
    if (!image.naturalWidth) throw new Error(`图片加载失败：${image.alt || '题目图片'}`)
    if (image.decode) await image.decode().catch(() => { throw new Error(`图片解码失败：${image.alt || '题目图片'}`) })
  }))
  await Promise.race([loadImages, rejectAfter(Math.max(1, deadline - Date.now()), '题目图片加载超时，请检查题库图片后重试')])
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, rejectAfter(Math.max(1, deadline - Date.now()), '页面字体加载超时，请重试')])
  await nextFrame()
  await nextFrame()
}

export function ExportPage({ questions, statuses = {}, pageNumber, showType = true }: { questions: Question[]; statuses?: Record<string, QuestionStatus>; pageNumber: number; showType?: boolean }) {
  return <article className={`export-page${questions.length > 1 ? ' export-page-two-up' : ''}`}>
    {questions.map(question => {
      const text = (question.type === '图片题' || question.imageUrl || question.imageKeys?.length) && question.text === `第 ${question.number} 题` ? '' : question.text
      const questionStatus = statuses[question.id] || 'none'
      return <section className="export-question" key={question.id}>
        <div className="export-question-title"><strong>{String(question.number).padStart(2, '0')}</strong><span className={`export-mastery ${questionStatus}`}>{exportStatusLabels[questionStatus]}</span>{showType && question.type && <span>{question.type}</span>}</div>
        {text && <p>{text}</p>}
        <AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图" trackExportLoading/>
        {question.options?.map(option => <p className="export-option" key={option}>{option}</p>)}
      </section>
    })}
    <footer>第 {pageNumber} 页</footer>
  </article>
}

export default function ExportDialog({ banks, statuses, defaultBankId, defaultSectionId, onClose, onPdf, onNotice }: Props) {
  const [bankId, setBankId] = useState(defaultBankId)
  const initialBank = banks.find(bank => bank.id === defaultBankId) || banks[0]
  const initialChapter = initialBank?.chapters.find(chapter => chapter.sections.some(section => section.id === defaultSectionId)) || initialBank?.chapters[0]
  const [chapterId, setChapterId] = useState(initialChapter?.id || '')
  const [sectionId, setSectionId] = useState(defaultSectionId || initialChapter?.sections[0]?.id || '')
  const [status, setStatus] = useState<ExportStatusFilter>('all')
  const [perPage, setPerPage] = useState<1 | 2>(2)
  const [exporting, setExporting] = useState(false)

  const bank = banks.find(item => item.id === bankId) || banks[0]
  const chapter = bank?.chapters.find(item => item.id === chapterId) || bank?.chapters[0]
  const section = chapter?.sections.find(item => item.id === sectionId) || chapter?.sections[0]

  useEffect(() => {
    if (!bank) return
    if (!bank.chapters.some(item => item.id === chapterId)) { setChapterId(bank.chapters[0]?.id || ''); setSectionId(bank.chapters[0]?.sections[0]?.id || '') }
  }, [bankId, bank, chapterId])
  useEffect(() => { if (chapter && !chapter.sections.some(item => item.id === sectionId)) setSectionId(chapter.sections[0]?.id || '') }, [chapter, sectionId])

  const questions = useMemo(() => filterQuestionsForExport(section?.questions || [], status, statuses), [section, status, statuses])
  const pages = useMemo(() => splitPages(questions, perPage), [questions, perPage])
  const counts = (section?.questions || []).reduce((result, question) => { result[statuses[question.id] || 'none']++; return result }, { none: 0, proficient: 0, vague: 0, wrong: 0 })
  const job: ExportJob = { title: bank?.name || '题库导出', subtitle: `${chapter?.name || ''} · ${section?.name || ''}`, questions, perPage, statuses }

  async function exportImages() {
    if (!questions.length) { onNotice('当前条件下没有可导出的题目'); return }
    const picker = (window as Window & { showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker
    if (!picker) { onNotice('当前浏览器不支持复制到文件夹，请使用最新版 Chrome 或 Edge'); return }
    let directory: DirectoryHandle
    try { directory = await picker.call(window, { id: 'npee-question-image-export', mode: 'readwrite' }) } catch (error) {
      if ((error as DOMException).name === 'AbortError') return
      onNotice(error instanceof Error ? error.message : '无法打开目标文件夹'); return
    }
    setExporting(true)
    try {
      const folderName = imageExportFolderName(bank?.name || '', chapter?.name || '', section?.name || '')
      const sectionDirectory = await directory.getDirectoryHandle(folderName, { create: true })
      const writtenNames = new Set<string>()
      let skippedQuestions = 0
      for (const question of questions) {
        const assets = await getAssetFiles(question.imageKeys || [])
        const sources: Array<{ name: string; blob: Blob }> = assets.map(asset => ({ name: originalAssetName(asset.key), blob: asset.blob }))
        if (!sources.length && question.imageUrl) {
          const response = await fetch(question.imageUrl)
          if (!response.ok) throw new Error(`第 ${question.number} 题图片读取失败`)
          sources.push({ name: fileNameFromUrl(question.imageUrl, question.number), blob: await response.blob() })
        }
        if (!sources.length) { skippedQuestions++; continue }
        for (const source of sources) {
          let filename = source.name
          if (writtenNames.has(filename)) {
            const prefix = String(question.number).padStart(2, '0')
            filename = `${prefix}-${source.name}`
            let duplicate = 2
            while (writtenNames.has(filename)) filename = `${prefix}-${duplicate++}-${source.name}`
          }
          writtenNames.add(filename)
          const file = await sectionDirectory.getFileHandle(filename, { create: true })
          const writable = await file.createWritable(); await writable.write(source.blob); await writable.close()
        }
      }
      onNotice(`已复制 ${writtenNames.size} 张原图到 ${folderName}${skippedQuestions ? `，跳过 ${skippedQuestions} 道无图片题目` : ''}`); onClose()
    } catch (error) { onNotice(error instanceof Error ? error.message : '题目图片复制失败') } finally { setExporting(false) }
  }

  return <div className="modal-backdrop export-backdrop" onClick={onClose}>
    <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={event => event.stopPropagation()}>
      <button className="modal-close" aria-label="关闭" onClick={onClose}><X/></button>
      <h2 id="export-title">导出题目</h2><p>选择范围、状态和页面布局</p>
      <div className="export-form-grid">
        <label>题库<select value={bank?.id || ''} onChange={event => setBankId(event.target.value)}>{banks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>章<select value={chapter?.id || ''} onChange={event => { setChapterId(event.target.value); const next = bank?.chapters.find(item => item.id === event.target.value); setSectionId(next?.sections[0]?.id || '') }}>{bank?.chapters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="full">节<select value={section?.id || ''} onChange={event => setSectionId(event.target.value)}>{chapter?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="export-stats"><div><span>总题目</span><strong>{section?.questions.length || 0}</strong></div><div className="green-stat"><span>熟练</span><strong>{counts.proficient}</strong></div><div className="yellow-stat"><span>模糊</span><strong>{counts.vague}</strong></div><div className="red-stat"><span>错题</span><strong>{counts.wrong}</strong></div></div>
      <div className="export-options">
        <label>状态<select value={status} onChange={event => setStatus(event.target.value as ExportStatusFilter)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>布局<select value={perPage} onChange={event => setPerPage(Number(event.target.value) as 1 | 2)}><option value="1">每页 1 题</option><option value="2">每页 2 题</option></select></label>
      </div>
      <div className="export-progress"><span>符合条件</span><strong>{questions.length} 题 / {pages.length} 页</strong></div>
      <div className="export-actions"><button disabled={!questions.length || exporting} onClick={() => onPdf(job)}><FileText/>导出 PDF</button><button disabled={!questions.length || exporting} onClick={exportImages}><FileImage/>{exporting ? '正在复制…' : '复制原图到文件夹'}</button></div>
      {!questions.length && <p className="export-empty">暂无符合条件的题目</p>}
    </section>
  </div>
}
