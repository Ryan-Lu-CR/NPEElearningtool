import { useEffect, useState } from 'react'
import { ChevronDown, CircleHelp, X } from 'lucide-react'
import AssetGallery from './AssetGallery'
import { isImageAnswerPlaceholder } from './questionPresentation'
import type { Question, QuestionStatus } from './types'

interface DashboardQuestionDialogProps {
  bankName: string
  chapterName: string
  sectionName: string
  question: Question
  status: QuestionStatus
  binaryMode: boolean
  onStatusChange: (status: QuestionStatus, answerRevealed: boolean) => void
  onClose: () => void
}

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' },
  proficient: { label: '熟练', icon: '✓' },
  vague: { label: '模糊', icon: '?' },
  wrong: { label: '错题', icon: '×' },
}

export default function DashboardQuestionDialog({ bankName, chapterName, sectionName, question, status, binaryMode, onStatusChange, onClose }: DashboardQuestionDialogProps) {
  const [answerOpen, setAnswerOpen] = useState(false)
  const effectiveStatus = binaryMode && status === 'vague' ? 'none' : status
  const choices: QuestionStatus[] = binaryMode ? ['proficient', 'wrong'] : ['proficient', 'vague', 'wrong']
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

  return <div className="dashboard-question-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dashboard-question-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-question-title">
      <header className="dashboard-question-dialog-head">
        <div><span>{bankName}</span><small>{chapterName} · {sectionName}</small></div>
        <button onClick={onClose} aria-label="关闭题目弹窗"><X size={19}/></button>
      </header>
      <div className="dashboard-question-dialog-scroll">
        <div className="dashboard-question-title-row">
          <div><span className="number">{String(question.number).padStart(2, '0')}</span>{question.type && <span className="type">{question.type}</span>}</div>
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
              ? <AssetGallery keys={question.answerImageKeys} urls={question.answerImageUrl ? [question.answerImageUrl] : []} alt={usesImageAnswer ? '参考答案和解析' : '解析截图'}/>
              : question.analysis ? <p>{question.analysis}</p> : <p className="analysis-missing">暂未收录解析</p>}
          </div>
          {question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}
        </div>}
      </div>
      <footer className="dashboard-question-status">
        <span>掌握情况</span>
        <div>{choices.map(choice => <button key={choice} className={effectiveStatus === choice ? `status-button ${choice} active` : `status-button ${choice}`} onClick={() => onStatusChange(effectiveStatus === choice ? 'none' : choice, answerOpen)}><b>{statusMeta[choice].icon}</b>{labelFor(choice)}</button>)}</div>
      </footer>
    </section>
  </div>
}
