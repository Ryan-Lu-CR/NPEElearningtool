import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadDefaultBanks } from './data'
import './styles.css'
import './compact-header.css'
import './learning-dashboard.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<div className="empty-app"><h1>正在加载题库…</h1></div>)

loadDefaultBanks()
  .then(() => root.render(<React.StrictMode><App /></React.StrictMode>))
  .catch(error => root.render(<div className="empty-app"><h1>题库加载失败</h1><p>{error instanceof Error ? error.message : '请刷新页面重试'}</p><button onClick={() => location.reload()}>重新加载</button></div>))
