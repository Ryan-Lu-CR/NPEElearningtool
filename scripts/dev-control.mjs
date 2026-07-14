#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const viteArgs = ['--host', '127.0.0.1', '--clearScreen', 'false', ...process.argv.slice(2)]

let server = null
let stopping = false
let operating = false

function printControls() {
  console.log('\n终端控制：[R] 重启服务  [Q] 关闭服务')
  controller.prompt()
}

function startServer() {
  console.log('\n正在启动考研学习空间...')
  server = spawn(process.execPath, [viteCli, ...viteArgs], {
    cwd: projectRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const current = server
  current.once('exit', (code, signal) => {
    if (server === current) server = null
    if (!stopping && !operating) {
      console.log(`\n服务已停止${signal ? `（${signal}）` : code ? `（退出码 ${code}）` : ''}。`)
      printControls()
    }
  })
}

function stopServer() {
  const current = server
  if (!current || current.exitCode !== null) return Promise.resolve()
  return new Promise(resolve => {
    const forceTimer = setTimeout(() => {
      if (current.exitCode === null) current.kill('SIGKILL')
    }, 3000)
    current.once('exit', () => {
      clearTimeout(forceTimer)
      resolve()
    })
    current.kill('SIGTERM')
  })
}

async function restartServer() {
  if (operating) return
  operating = true
  console.log('\n正在重启服务...')
  await stopServer()
  startServer()
  operating = false
  printControls()
}

async function closeController(exitCode = 0) {
  if (stopping) return
  stopping = true
  operating = true
  controller.close()
  console.log('\n正在关闭服务...')
  await stopServer()
  console.log('服务已关闭。')
  process.exit(exitCode)
}

const controller = createInterface({ input: process.stdin, output: process.stdout })
controller.setPrompt('请输入指令 > ')
controller.on('line', line => {
  const command = line.trim().toLowerCase()
  if (command === 'r') void restartServer()
  else if (command === 'q') void closeController()
  else {
    console.log('无效指令，请输入 R（重启）或 Q（关闭）。')
    controller.prompt()
  }
})
controller.on('close', () => {
  if (!stopping) void closeController()
})

process.on('SIGINT', () => void closeController())
process.on('SIGTERM', () => void closeController())
process.on('SIGHUP', () => void closeController())

startServer()
printControls()
