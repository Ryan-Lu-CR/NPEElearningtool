import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileImage, FileText, X } from 'lucide-react'
import { toBlob } from 'html-to-image'
import AssetGallery from './AssetGallery'
import type { Question, QuestionBank, QuestionStatus } from './types'

export interface ExportJob {
  title: string
  subtitle: string
  questions: Question[]
  perPage: 1 | 2
  includeAnswers: boolean
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
interface DirectoryHandle { getFileHandle(name: string, options: { create: boolean }): Promise<WritableFileHandle> }

const statusOptions: Array<{ value: QuestionStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' }, { value: 'none', label: '未标记' }, { value: 'proficient', label: '熟练' }, { value: 'vague', label: '模糊' }, { value: 'wrong', label: '错题' }
]

export function splitPages(questions: Question[], perPage: number) {
  return Array.from({ length: Math.ceil(questions.length / perPage) }, (_, index) => questions.slice(index * perPage, (index + 1) * perPage))
}

export function filterQuestionsForExport(questions: Question[], status: QuestionStatus | 'all', statuses: Record<string, QuestionStatus>) {
  return questions.filter(question => status === 'all' || (statuses[question.id] || 'none') === status)
}

function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '题库导出' }

async function waitForImages(container: HTMLElement) {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => resolve(), { once: true })
  })))
}

export function ExportPage({ questions, includeAnswers, pageNumber, showType = true }: { questions: Question[]; includeAnswers: boolean; pageNumber: number; showType?: boolean }) {
  return <article className="export-page">
    {questions.map(question => {
      const text = question.type === '图片题' && question.text === `第 ${question.number} 题` ? '' : question.text
      return <section className="export-question" key={question.id}>
        <div className="export-question-title"><strong>{String(question.number).padStart(2, '0')}</strong>{showType && <span>{question.type}</span>}</div>
        {text && <p>{text}</p>}
        <AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图"/>
        {question.options?.map(option => <p className="export-option" key={option}>{option}</p>)}
        {includeAnswers && <div className="export-answer"><b>答案：{question.answer}</b><p>{question.analysis}</p><AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt="答案配图"/></div>}
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
  const [status, setStatus] = useState<QuestionStatus | 'all'>('all')
  const [perPage, setPerPage] = useState<1 | 2>(2)
  const [includeAnswers, setIncludeAnswers] = useState(true)
  const [exporting, setExporting] = useState(false)
  const pagesRef = useRef<HTMLDivElement>(null)

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
  const job: ExportJob = { title: bank?.name || '题库导出', subtitle: `${chapter?.name || ''} · ${section?.name || ''}`, questions, perPage, includeAnswers }

  async function exportImages() {
    if (!questions.length || !pagesRef.current) { onNotice('当前条件下没有可导出的题目'); return }
    let directory: DirectoryHandle | null = null
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker
    try { if (picker) directory = await picker.call(window) } catch (error) { if ((error as DOMException).name === 'AbortError') return }
    setExporting(true)
    try {
      await waitForImages(pagesRef.current)
      const nodes = Array.from(pagesRef.current.querySelectorAll<HTMLElement>('.export-page'))
      for (let index = 0; index < nodes.length; index++) {
        const blob = await toBlob(nodes[index], { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true })
        if (!blob) throw new Error('图片生成失败')
        const filename = `${safeName(job.title)}-${safeName(section?.name || '题目')}-${String(index + 1).padStart(3, '0')}.png`
        if (directory) {
          const file = await directory.getFileHandle(filename, { create: true }); const writable = await file.createWritable(); await writable.write(blob); await writable.close()
        } else {
          const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
        }
      }
      onNotice(`已导出 ${nodes.length} 张高清图片${directory ? '到所选文件夹' : ''}`); onClose()
    } catch (error) { onNotice(error instanceof Error ? error.message : '图片导出失败') } finally { setExporting(false) }
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
        <label>状态<select value={status} onChange={event => setStatus(event.target.value as QuestionStatus | 'all')}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>布局<select value={perPage} onChange={event => setPerPage(Number(event.target.value) as 1 | 2)}><option value="1">每页 1 题</option><option value="2">每页 2 题</option></select></label>
        <label className="check-option"><input type="checkbox" checked={includeAnswers} onChange={event => setIncludeAnswers(event.target.checked)}/>包含答案解析</label>
      </div>
      <div className="export-progress"><span>符合条件</span><strong>{questions.length} 题 / {pages.length} 页</strong></div>
      <div className="export-actions"><button disabled={!questions.length || exporting} onClick={() => onPdf(job)}><FileText/>导出 PDF</button><button disabled={!questions.length || exporting} onClick={exportImages}><FileImage/>{exporting ? '正在生成…' : '图片到文件夹'}</button></div>
      {!questions.length && <p className="export-empty">暂无符合条件的题目</p>}
      <div className="image-export-stage" ref={pagesRef}>{pages.map((page, index) => <ExportPage key={index} questions={page} includeAnswers={includeAnswers} pageNumber={index + 1} showType={false}/>)}</div>
    </section>
  </div>
}
