import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, CircleHelp, Download, FileImage, FileText, FileUp, Filter, Menu, Plus, RotateCcw, Search, X } from 'lucide-react'
import type { Question, QuestionBank, QuestionStatus, Section } from './types'
import { loadBanks, loadStatuses, saveBanks, saveStatuses, validateBanks, validateStatuses } from './store'
import { parseImageFilename, parseStructuredImagePath, putAssets, type StructuredImageMatch } from './assets'
import AssetGallery from './AssetGallery'

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '熟练', icon: '✓' }, vague: { label: '模糊', icon: '?' }, wrong: { label: '错题', icon: '×' }
}

export default function App() {
  const [banks, setBanks] = useState(loadBanks)
  const [statuses, setStatuses] = useState(loadStatuses)
  const [bankId, setBankId] = useState(banks[0]?.id || '')
  const [sectionId, setSectionId] = useState(banks[0]?.chapters[0]?.sections[0]?.id || '')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [filter, setFilter] = useState<QuestionStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  const [view, setView] = useState<'section' | 'wrong'>('section')
  const [toast, setToast] = useState('')
  const [printMode, setPrintMode] = useState(false)
  const [newBankOpen, setNewBankOpen] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [namingHelpOpen, setNamingHelpOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const imageImportRef = useRef<HTMLInputElement>(null)

  useEffect(() => saveBanks(banks), [banks])
  useEffect(() => saveStatuses(statuses), [statuses])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const finishPrinting = () => setPrintMode(false)
    window.addEventListener('afterprint', finishPrinting)
    return () => window.removeEventListener('afterprint', finishPrinting)
  }, [])

  const bank = banks.find(b => b.id === bankId) || banks[0]
  const section: Section | undefined = bank?.chapters.flatMap(c => c.sections).find(s => s.id === sectionId)
  const allQuestions = useMemo(() => banks.flatMap(b => b.chapters.flatMap(c => c.sections.flatMap(s => s.questions))), [banks])
  const wrongQuestions = useMemo(() => allQuestions.filter(q => statuses[q.id] === 'wrong'), [allQuestions, statuses])
  const sourceQuestions = view === 'wrong' ? wrongQuestions : (section?.questions || [])
  const filteredQuestions = useMemo(() => sourceQuestions.filter(q => {
    const matchesStatus = filter === 'all' || (statuses[q.id] || 'none') === filter
    const haystack = `${q.text} ${q.answer} ${q.analysis}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [sourceQuestions, filter, query, statuses])
  const question = filteredQuestions[Math.min(questionIndex, Math.max(0, filteredQuestions.length - 1))]
  const counts = allQuestions.reduce((acc, q) => { const s = statuses[q.id] || 'none'; acc[s]++; return acc }, { none: 0, proficient: 0, vague: 0, wrong: 0 })

  function selectBank(next: QuestionBank) {
    setBankId(next.id); setSectionId(next.chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setAnswerOpen(false); setView('section'); setSidebar(false)
  }
  function selectSection(id: string) { setSectionId(id); setQuestionIndex(0); setAnswerOpen(false); setView('section'); setSidebar(false) }
  function showWrongBook() { setView('wrong'); setFilter('all'); setQuery(''); setQuestionIndex(0); setAnswerOpen(false); setSidebar(false) }
  function mark(status: QuestionStatus) {
    if (!question) return
    setStatuses(prev => ({ ...prev, [question.id]: status })); setToast(`已标记为“${statusMeta[status].label}”`)
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, banks, statuses }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `研途题库备份-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  function printSection() {
    if (!sourceQuestions.length) { setToast('当前视图没有可导出的题目'); return }
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
    const questionIds = new Set(allQuestions.map(item => item.id))
    const updates = new Map<string, { question: Array<{ key: string; order: number }>; answer: Array<{ key: string; order: number }> }>()
    const structuredQuestions = new Map<string, StructuredImageMatch>()
    const assets = [] as Array<{ key: string; file: File }>
    let skipped = 0
    for (const file of files) {
      let match = parseImageFilename(file.name, questionIds)
      if (!match) {
        const structured = parseStructuredImagePath(file.webkitRelativePath || file.name, file.name)
        if (structured) {
          const questionId = `${bank.id}-${structured.chapterCode}-${structured.sectionCode}-${structured.questionCode}`
          match = { questionId, kind: structured.kind, order: structured.order }
          structuredQuestions.set(questionId, structured)
        }
      }
      if (!match) { skipped++; continue }
      const key = `${match.questionId}/${match.kind}/${match.order}-${file.name}`
      const update = updates.get(match.questionId) || { question: [], answer: [] }
      update[match.kind].push({ key, order: match.order }); updates.set(match.questionId, update); assets.push({ key, file })
    }
    if (!assets.length) { setToast(`没有图片匹配题目 ID，已跳过 ${skipped} 个文件`); return }
    try {
      await putAssets(assets)
      const definitions = [...structuredQuestions.entries()]
      setBanks(previous => {
        const expanded = previous.map(item => {
          if (item.id !== bank.id || !definitions.length) return item
          const clone = structuredClone(item)
          for (const [questionId, definition] of definitions) {
            const chapterId = `${bank.id}-chapter-${definition.chapterCode}`
            const sectionIdForImport = `${chapterId}-section-${definition.sectionCode}`
            let chapter = clone.chapters.find(entry => entry.id === chapterId)
            if (!chapter) { chapter = { id: chapterId, name: definition.chapterName, sections: [] }; clone.chapters.push(chapter) }
            let targetSection = chapter.sections.find(entry => entry.id === sectionIdForImport)
            if (!targetSection) { targetSection = { id: sectionIdForImport, name: definition.sectionName, questions: [] }; chapter.sections.push(targetSection) }
            if (!targetSection.questions.some(entry => entry.id === questionId)) targetSection.questions.push({
              id: questionId,
              number: Number(definition.questionCode),
              type: '图片题',
              text: `第 ${Number(definition.questionCode)} 题`,
              answer: '见答案图片',
              analysis: '暂无文字解析'
            })
            targetSection.questions.sort((a, b) => a.number - b.number)
          }
          clone.chapters.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }))
          return clone
        })
        return expanded.map(item => ({ ...item, chapters: item.chapters.map(chapter => ({ ...chapter, sections: chapter.sections.map(currentSection => ({ ...currentSection, questions: currentSection.questions.map(currentQuestion => {
        const update = updates.get(currentQuestion.id)
        if (!update) return currentQuestion
        const questionKeys = update.question.sort((a, b) => a.order - b.order).map(entry => entry.key)
        const answerKeys = update.answer.sort((a, b) => a.order - b.order).map(entry => entry.key)
        return {
          ...currentQuestion,
          imageKeys: [...new Set([...(currentQuestion.imageKeys || []), ...questionKeys])],
          answerImageKeys: [...new Set([...(currentQuestion.answerImageKeys || []), ...answerKeys])]
        }
      }) })) })) }))
      })
      const firstDefinition = definitions[0]?.[1]
      if (firstDefinition) {
        setSectionId(`${bank.id}-chapter-${firstDefinition.chapterCode}-section-${firstDefinition.sectionCode}`)
        setView('section')
      }
      setToast(`已导入 ${assets.length} 张图片，匹配 ${updates.size} 道题${structuredQuestions.size ? `，自动新建/补全 ${structuredQuestions.size} 道` : ''}${skipped ? `，跳过 ${skipped} 张` : ''}`)
    } catch (error) { setToast(error instanceof Error ? error.message : '图片导入失败') }
    if (imageImportRef.current) imageImportRef.current.value = ''
  }
  function createBank() {
    const name = newBankName.trim()
    if (!name) { setToast('请输入题库名称'); return }
    const created: QuestionBank = { id: `local-${Date.now()}`, name, description: '自建本地题库', source: 'local', chapters: [] }
    setBanks(previous => [...previous, created]); setBankId(created.id); setSectionId(''); setView('section'); setNewBankName(''); setNewBankOpen(false); setToast(`已新建“${name}”，现在可以批量导入图片`)
  }

  if (!bank) return <div className="empty-app"><BookOpen size={42}/><h1>还没有题库</h1><button onClick={() => importRef.current?.click()}>导入题库</button><input ref={importRef} hidden type="file" accept=".json" onChange={e => importData(e.target.files?.[0])}/></div>

  return <div className="app-shell">
    <header>
      <button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu/></button>
      <div className="brand"><span className="brand-mark"><BookOpen size={20}/></span><div><strong>本地题库</strong><small>QUESTION BANK</small></div></div>
      <div className="header-center"><span className="source-dot"/>本地增强模式 · 数据仅保存在此设备</div>
      <div className="header-actions">
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e => importData(e.target.files?.[0])}/>
        <input ref={node => { imageImportRef.current = node; node?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple accept="image/*" onChange={e => importImages(e.target.files)}/>
        <button className="ghost" onClick={() => importRef.current?.click()}><FileUp size={17}/>导入</button>
        <button className="ghost" title="批量导入题目图和答案图" onClick={() => imageImportRef.current?.click()}><FileImage size={17}/>图片</button>
        <button className="icon-ghost" title="查看图片命名参考" aria-label="图片命名参考" onClick={() => setNamingHelpOpen(true)}><CircleHelp size={18}/></button>
        <button className="ghost" onClick={printSection}><FileText size={17}/>PDF</button>
        <button className="ghost" onClick={exportData}><Download size={17}/>备份</button>
      </div>
    </header>

    <div className="body-grid">
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)}/>} 
      <aside className={sidebar ? 'open' : ''}>
        <div className="aside-mobile-title"><strong>题库导航</strong><button onClick={() => setSidebar(false)}><X/></button></div>
        <p className="eyebrow">题库类型</p>
        <button className="new-bank-button" onClick={() => setNewBankOpen(true)}><Plus size={16}/>新建题库</button>
        <div className="bank-list">{banks.map(b => <button key={b.id} className={b.id === bank.id ? 'bank active' : 'bank'} onClick={() => selectBank(b)}>
          <span className="book-icon"><BookOpen size={17}/></span><span><strong>{b.name}</strong><small>{b.description || (b.source === 'local' ? '本地题库' : '远程题库')}</small></span><ChevronRight size={17}/>
        </button>)}</div>
        <button className={view === 'wrong' ? 'wrong-book active' : 'wrong-book'} onClick={showWrongBook}><AlertCircle size={17}/><span><strong>全局错题本</strong><small>汇总所有题库中的错题</small></span><em>{counts.wrong}</em></button>
        <div className="divider"/>
        <p className="eyebrow">章节导航</p>
        <div className="chapter-tree">{bank.chapters.map(chapter => <div className="chapter" key={chapter.id}>
          <div className="chapter-title"><ChevronDown size={16}/><span>{chapter.name}</span></div>
          {chapter.sections.map(s => <button key={s.id} onClick={() => selectSection(s.id)} className={s.id === sectionId ? 'section active' : 'section'}><span>{s.name}</span><em>{s.questions.length}</em></button>)}
        </div>)}</div>
        <div className="aside-summary"><strong>学习概览</strong><div><span><i className="green"/>{counts.proficient} 熟练</span><span><i className="yellow"/>{counts.vague} 模糊</span><span><i className="red"/>{counts.wrong} 错题</span></div></div>
      </aside>

      <main>
        <div className="page-head"><div><span className="breadcrumb">{view === 'wrong' ? '学习中心' : bank.name} <ChevronRight size={13}/> {view === 'wrong' ? '全局错题本' : section?.name || '未选择'}</span><h1>{view === 'wrong' ? '全局错题本' : section?.name || '请选择具体节题目'}</h1><p>{view === 'wrong' ? `汇总 ${wrongQuestions.length} 道错题 · 修改掌握状态后自动移出` : section ? `共 ${section.questions.length} 道题 · 学习进度实时保存` : '从左侧选择一个章节开始学习'}</p></div>
          <div className="search"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setQuestionIndex(0) }} placeholder={view === 'wrong' ? '搜索全部错题' : '搜索当前小节'}/></div>
        </div>

        <div className="filter-row"><Filter size={16}/><span>筛选</span>{(['all','none','wrong','vague','proficient'] as const).map(s => <button key={s} className={filter === s ? 'chip active' : 'chip'} onClick={() => { setFilter(s); setQuestionIndex(0) }}>{s === 'all' ? '全部' : statusMeta[s].label}</button>)}</div>

        {question ? <div className="study-layout">
          <section className="question-card">
            <div className="question-top"><div><span className="number">{String(question.number).padStart(2,'0')}</span><span className="type">{question.type}</span></div><span className={`current-status ${(statuses[question.id] || 'none')}`}>{statusMeta[statuses[question.id] || 'none'].icon} {statusMeta[statuses[question.id] || 'none'].label}</span></div>
            <div className="question-content"><p>{question.text}</p><AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图"/>{question.options && <div className="options">{question.options.map((o, i) => <div key={i}>{o}</div>)}</div>}</div>
            <div className="status-bar"><span>掌握情况</span><div>{(['proficient','vague','wrong'] as const).map(s => <button key={s} className={(statuses[question.id] || 'none') === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => mark((statuses[question.id] || 'none') === s ? 'none' : s)}><b>{statusMeta[s].icon}</b>{statusMeta[s].label}</button>)}</div></div>
            <button className="answer-toggle" onClick={() => setAnswerOpen(v => !v)}><CircleHelp size={19}/>{answerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={answerOpen ? 'rotated' : ''} size={18}/></button>
            {answerOpen && <div className="answer"><div><span>参考答案</span><strong>{question.answer}</strong></div><div><span>解题思路</span><p>{question.analysis}</p><AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt="答案配图"/></div>{question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}</div>}
            <div className="pager"><button disabled={questionIndex === 0} onClick={() => { setQuestionIndex(i => i - 1); setAnswerOpen(false) }}>← 上一题</button><span>{questionIndex + 1} / {filteredQuestions.length}</span><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => { setQuestionIndex(i => i + 1); setAnswerOpen(false) }}>下一题 →</button></div>
          </section>
          <nav className="question-nav"><div><strong>题号导航</strong><small>点击快速跳转</small></div><div className="number-grid">{filteredQuestions.map((q, i) => <button key={q.id} className={`${i === questionIndex ? 'selected ' : ''}${statuses[q.id] || 'none'}`} onClick={() => { setQuestionIndex(i); setAnswerOpen(false) }}>{q.number}</button>)}</div><div className="legend"><span><i/>未标记</span><span><i className="green"/>熟练</span><span><i className="yellow"/>模糊</span><span><i className="red"/>错题</span></div></nav>
        </div> : <div className="no-results"><Search size={32}/><h2>{view === 'wrong' && wrongQuestions.length === 0 ? '错题已经清空' : '没有符合条件的题目'}</h2><p>{view === 'wrong' && wrongQuestions.length === 0 ? '很好，继续练习其他章节巩固掌握情况。' : '尝试更换筛选条件或清空搜索词。'}</p><button onClick={() => view === 'wrong' && wrongQuestions.length === 0 ? setView('section') : (setFilter('all'), setQuery(''))}><RotateCcw size={16}/>{view === 'wrong' && wrongQuestions.length === 0 ? '返回当前小节' : '重置筛选'}</button></div>}

        {printMode && <section className="print-sheet" aria-hidden="true">
          <div className="print-title"><h1>{view === 'wrong' ? '全局错题本' : bank.name}</h1><p>{view === 'wrong' ? `共 ${wrongQuestions.length} 道错题` : `${bank.chapters.find(c => c.sections.some(s => s.id === sectionId))?.name} · ${section?.name}`}</p></div>
          {sourceQuestions.map(q => <article key={q.id} className="print-question">
            <h2>{q.number}. {q.text}</h2>
            {q.options?.map(option => <p key={option}>{option}</p>)}
            <AssetGallery keys={q.imageKeys} urls={q.imageUrl ? [q.imageUrl] : []} alt="题目配图"/>
            <div className="print-answer"><strong>答案：{q.answer}</strong><p>解析：{q.analysis}</p><AssetGallery keys={q.answerImageKeys} urls={q.answerImageUrl ? [q.answerImageUrl] : []} alt="答案配图"/></div>
          </article>)}
        </section>}
      </main>
    </div>
    {toast && <div className="toast">{toast}</div>}
    {newBankOpen && <div className="modal-backdrop" onClick={() => setNewBankOpen(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-bank-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNewBankOpen(false)}><X/></button><span className="modal-icon"><BookOpen/></span><h2 id="new-bank-title">新建题库</h2><p>先起一个名字，再点击顶部“图片”选择素材目录，章节和题目会自动生成。</p><label>题库名称<input autoFocus value={newBankName} onChange={event => setNewBankName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createBank() }} placeholder="例如：线性代数强化题"/></label><button className="primary-button" onClick={createBank}>创建并开始导入</button></section></div>}
    {namingHelpOpen && <div className="modal-backdrop" onClick={() => setNamingHelpOpen(false)}><section className="modal-card naming-card" role="dialog" aria-modal="true" aria-labelledby="naming-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNamingHelpOpen(false)}><X/></button><span className="modal-icon"><FileImage/></span><h2 id="naming-title">图片命名参考</h2><p>兼容你现有的三段数字格式：章号－小节号－题号。</p><div className="naming-example"><code>01-1-01.png</code><span>第 01 章 / 第 1 节 / 第 01 题，默认题目图</span><code>01-1-01-Q-2.png</code><span>同一题的第 2 张题目图</span><code>01-1-01-A-1.png</code><span>同一题的第 1 张答案图</span><code>01-1-01-A-2.png</code><span>同一题的第 2 张答案图</span></div><h3>文件夹也能自动识别名称</h3><code className="folder-example">01 行列式 1-基础.assets</code><p>自动生成“行列式”章节和“基础”小节。Q 表示题目，A 表示答案；编号可继续增加，没有数量限制。</p><button className="primary-button" onClick={() => setNamingHelpOpen(false)}>我知道了</button></section></div>}
  </div>
}
