import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DraftBook from './DraftBookPanel'
import { loadDefaultBanks } from './data'
import './styles.css'
import './scrollbars.css'
import './compact-header.css'
import './learning-dashboard.css'
import './question-notes.css'
import './notes.css'
import './timer.css'
import './draftbook.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

function renderPage(content: React.ReactNode) {
  root.render(<React.StrictMode><>{content}<DraftBook/></></React.StrictMode>)
}

renderPage(<div className="empty-app"><h1>正在加载题库…</h1></div>)

loadDefaultBanks()
  .then(() => renderPage(<App/>))
  .catch(error => renderPage(<div className="empty-app"><h1>题库加载失败</h1><p>{error instanceof Error ? error.message : '请刷新页面重试'}</p><button onClick={() => location.reload()}>重新加载</button></div>))
