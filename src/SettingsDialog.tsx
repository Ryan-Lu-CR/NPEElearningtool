import { useEffect, useState } from 'react'
import { Database, Download, Eraser, HardDrive, RefreshCcw, RotateCcw, Trash2, X } from 'lucide-react'
import type { QuestionBank, QuestionStatus } from './types'

interface Props {
  banks: QuestionBank[]
  activeBankId: string
  builtInIds: Set<string>
  protectedBankIds: Set<string>
  onClose: () => void
  onClearMarks: (bankId: string | 'all', status: QuestionStatus | 'all') => void
  onExportBank: (bank: QuestionBank) => void
  onResetBank: (bank: QuestionBank) => Promise<void>
  onDeleteBank: (bank: QuestionBank) => Promise<void>
  onRestoreBuiltIns: () => Promise<void>
  onFactoryReset: () => Promise<void>
}

function questionCount(bank: QuestionBank) { return bank.chapters.reduce((sum, chapter) => sum + chapter.sections.reduce((sectionSum, section) => sectionSum + section.questions.length, 0), 0) }
function formatBytes(bytes?: number) { if (!bytes) return '0 MB'; return `${(bytes / 1024 / 1024).toFixed(bytes > 1024 ** 3 ? 0 : 1)} MB` }

export default function SettingsDialog(props: Props) {
  const [markBankId, setMarkBankId] = useState<string | 'all'>(props.activeBankId)
  const [markStatus, setMarkStatus] = useState<QuestionStatus | 'all'>('all')
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({})
  const [pending, setPending] = useState<{ title: string; description: string; run: () => Promise<void> | void } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { navigator.storage?.estimate().then(result => setStorage({ usage: result.usage, quota: result.quota })).catch(() => {}) }, [])
  async function confirmAction() { if (!pending) return; setBusy(true); try { await pending.run(); setPending(null) } finally { setBusy(false) } }

  return <div className="modal-backdrop settings-backdrop" onClick={props.onClose}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
      <button className="modal-close" aria-label="关闭" onClick={props.onClose}><X/></button>
      <div className="settings-heading"><span><Database/></span><div><h2 id="settings-title">设置与数据管理</h2><p>批量管理标注、题库和本地数据</p></div></div>

      <section className="settings-section">
        <div className="settings-section-title"><Eraser/><div><h3>批量删除标注</h3><p>清除掌握状态，不会删除任何题目或图片</p></div></div>
        <div className="settings-inline-form"><select value={markBankId} onChange={event => setMarkBankId(event.target.value)}><option value="all">所有题库</option>{props.banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select><select value={markStatus} onChange={event => setMarkStatus(event.target.value as QuestionStatus | 'all')}><option value="all">全部标注</option><option value="proficient">仅熟练</option><option value="vague">仅模糊</option><option value="wrong">仅错题</option></select><button onClick={() => setPending({ title: '确认删除标注？', description: '所选范围内的学习标注将被清除，题目和图片不受影响。', run: () => props.onClearMarks(markBankId, markStatus) })}>清除标注</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><HardDrive/><div><h3>题库数据</h3><p>导出、重置或删除单个题库</p></div></div>
        <div className="settings-bank-list">{props.banks.map(bank => <div className="settings-bank" key={bank.id}><div><strong>{bank.name}</strong><span>{bank.chapters.length} 章 · {questionCount(bank)} 题 · {props.protectedBankIds.has(bank.id) ? '默认' : props.builtInIds.has(bank.id) ? '内置' : '自建'}</span></div><div><button aria-label={`导出 ${bank.name}`} onClick={() => props.onExportBank(bank)}><Download/></button>{!props.protectedBankIds.has(bank.id) && <><button aria-label={`重置 ${bank.name}`} onClick={() => setPending({ title: `重置“${bank.name}”？`, description: props.builtInIds.has(bank.id) ? '将恢复内置题库的初始内容，并清除该题库的标注和本地图片。' : '将保留题库名称，但清空全部章节、题目、标注和本地图片。', run: () => props.onResetBank(bank) })}><RotateCcw/></button><button className="danger-icon" aria-label={`删除 ${bank.name}`} disabled={props.banks.length <= 1} onClick={() => setPending({ title: `删除“${bank.name}”？`, description: '该题库的章节、题目、标注和本地图片都将永久删除。', run: () => props.onDeleteBank(bank) })}><Trash2/></button></>}</div></div>)}</div>
      </section>

      <section className="settings-section settings-global">
        <div className="storage-row"><div><strong>浏览器本地存储</strong><span>已用 {formatBytes(storage.usage)} / 可用配额 {formatBytes(storage.quota)}</span></div><div className="storage-bar"><i style={{ width: `${Math.min(100, ((storage.usage || 0) / (storage.quota || 1)) * 100)}%` }}/></div></div>
        <div className="global-actions"><button onClick={() => setPending({ title: '恢复内置题库？', description: '内置示例题库将恢复到初始内容，自建题库不会受到影响。', run: props.onRestoreBuiltIns })}><RefreshCcw/>恢复内置题库</button><button className="danger-action" onClick={() => setPending({ title: '恢复出厂设置？', description: '默认题库会保留；其他自建题库、图片、学习标注和位置记录都将永久删除。', run: props.onFactoryReset })}><Trash2/>清空全部并恢复出厂</button></div>
      </section>

      {pending && <div className="settings-confirm"><div><strong>{pending.title}</strong><p>{pending.description}</p></div><div><button onClick={() => setPending(null)} disabled={busy}>取消</button><button className="confirm-danger" onClick={confirmAction} disabled={busy}>{busy ? '处理中…' : '确认执行'}</button></div></div>}
    </section>
  </div>
}
