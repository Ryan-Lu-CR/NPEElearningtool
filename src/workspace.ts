import type { QuestionBank, QuestionStatus } from './types'
import type { StudyActivity } from './studyActivity'
import { validateStudyRounds, type StudyRounds } from './studyRounds'
import { DEFAULT_USER_SETTINGS, validateUserSettings, type UserSettings } from './userSettings'

const DB_NAME = 'npee-workspace'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'question-bank-root'
export const WORKSPACE_MANIFEST = '题库数据.json'
export const WORKSPACE_USER_DATA = '用户数据.json'
export const BUILTIN_ENGLISH_VERSION = 6

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options: { id: string; mode: 'readwrite' }): Promise<FileSystemDirectoryHandle>
}

export interface WorkspaceImageFile {
  file: File
  relativePath: string
  bankFolder: string
}

export interface WorkspaceManifest {
  version: 1
  builtinEnglishVersion?: number
  updatedAt: string
  banks: QuestionBank[]
  /** 兼容旧版清单；新写入的项目数据不再包含用户标记。 */
  statuses?: Record<string, QuestionStatus>
  folders?: Record<string, string>
}

export interface WorkspaceUserData {
  version: number
  updatedAt: string
  rounds?: StudyRounds
  /** 兼容 v2 及更早版本，读取后会迁移到第 1 轮。 */
  statuses?: Record<string, QuestionStatus>
  activities?: StudyActivity[]
  settings?: UserSettings
}

export interface DefaultWorkspaceIndex {
  name: string
  manifest: WorkspaceManifest | null
  userData: WorkspaceUserData | null
  images: Array<{ name: string; relativePath: string; bankFolder: string; url: string }>
}

export async function readDefaultWorkspace(): Promise<DefaultWorkspaceIndex> {
  const response = await fetch('/api/default-workspace/index')
  if (!response.ok) throw new Error('无法自动连接默认题库')
  return response.json() as Promise<DefaultWorkspaceIndex>
}

export function createWorkspaceManifest(banks: QuestionBank[], folders: Record<string, string> = {}): WorkspaceManifest {
  return { version: 1, builtinEnglishVersion: BUILTIN_ENGLISH_VERSION, updatedAt: new Date().toISOString(), banks, folders }
}

export function createWorkspaceUserData(rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS): WorkspaceUserData {
  return { version: 3, updatedAt: new Date().toISOString(), rounds: validateStudyRounds(rounds), settings: validateUserSettings(settings) }
}

export async function writeDefaultWorkspaceManifest(banks: QuestionBank[], folders: Record<string, string> = {}) {
  const manifest = createWorkspaceManifest(banks, folders)
  const response = await fetch('/api/default-workspace/manifest', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest, null, 2) })
  if (!response.ok) throw new Error('默认题库数据写入失败')
}

export async function writeDefaultWorkspaceUserData(rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS) {
  const userData = createWorkspaceUserData(rounds, settings)
  const response = await fetch('/api/default-workspace/user-data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData, null, 2) })
  if (!response.ok) throw new Error('用户数据写入失败')
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法保存题库文件夹授权'))
  })
}

export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openDatabase()
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return handle
}

export async function clearWorkspaceHandle() {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(HANDLE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export function isMissingWorkspaceError(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

export async function hasWorkspacePermission(handle: FileSystemDirectoryHandle, request = false) {
  const writableHandle = handle as WritableDirectoryHandle
  const options = { mode: 'readwrite' } as const
  if (await writableHandle.queryPermission(options) === 'granted') return true
  return request && await writableHandle.requestPermission(options) === 'granted'
}

export async function chooseWorkspace() {
  if (!('showDirectoryPicker' in window)) throw new Error('当前浏览器不支持文件夹实时同步，请使用最新版 Chrome 或 Edge')
  const handle = await (window as DirectoryPickerWindow).showDirectoryPicker({ id: 'npee-question-bank-workspace', mode: 'readwrite' })
  await saveWorkspaceHandle(handle)
  return handle
}

export async function writeWorkspaceManifest(handle: FileSystemDirectoryHandle, banks: QuestionBank[], folders: Record<string, string> = {}) {
  const fileHandle = await handle.getFileHandle(WORKSPACE_MANIFEST, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(createWorkspaceManifest(banks, folders), null, 2))
  await writable.close()
}

export async function writeWorkspaceUserData(handle: FileSystemDirectoryHandle, rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS) {
  const fileHandle = await handle.getFileHandle(WORKSPACE_USER_DATA, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(createWorkspaceUserData(rounds, settings), null, 2))
  await writable.close()
}

export async function readWorkspaceManifest(handle: FileSystemDirectoryHandle): Promise<WorkspaceManifest | null> {
  try {
    const file = await (await handle.getFileHandle(WORKSPACE_MANIFEST)).getFile()
    return JSON.parse(await file.text()) as WorkspaceManifest
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

export async function readWorkspaceUserData(handle: FileSystemDirectoryHandle): Promise<WorkspaceUserData | null> {
  try {
    const file = await (await handle.getFileHandle(WORKSPACE_USER_DATA)).getFile()
    return JSON.parse(await file.text()) as WorkspaceUserData
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

export function resolveWorkspaceImagePath(relativePath: string, bankFolders: string[] = []) {
  const normalized = relativePath.replaceAll('\\', '/')
  const knownFolder = [...bankFolders]
    .map(folder => folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find(folder => normalized.startsWith(`${folder}/`))
  if (knownFolder) return { bankFolder: knownFolder, relativePath: normalized.slice(knownFolder.length + 1) }
  const separator = normalized.indexOf('/')
  return separator < 0
    ? { bankFolder: '', relativePath: normalized }
    : { bankFolder: normalized.slice(0, separator), relativePath: normalized.slice(separator + 1) }
}

async function collectImages(directory: FileSystemDirectoryHandle, prefix: string, bankFolders: string[], output: WorkspaceImageFile[]) {
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith('.')) continue
    const relativePath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') await collectImages(handle, relativePath, bankFolders, output)
    else if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)) {
      const resolved = resolveWorkspaceImagePath(relativePath, bankFolders)
      output.push({ file: await handle.getFile(), ...resolved })
    }
  }
}

export async function scanWorkspaceImages(handle: FileSystemDirectoryHandle, bankFolders: string[] = []) {
  const output: WorkspaceImageFile[] = []
  for await (const [name, child] of handle.entries()) {
    if (name.startsWith('.') || name === WORKSPACE_MANIFEST || name === WORKSPACE_USER_DATA) continue
    if (child.kind === 'directory') await collectImages(child, name, bankFolders, output)
    else if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)) output.push({ file: await child.getFile(), relativePath: name, bankFolder: '' })
  }
  return output
}

export function safeFolderName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名题库'
}

export async function createBankFolder(handle: FileSystemDirectoryHandle, name: string) {
  const folderName = safeFolderName(name)
  await handle.getDirectoryHandle(folderName, { create: true })
  return folderName
}

export async function removeBankFolder(handle: FileSystemDirectoryHandle, folderName: string) {
  await handle.removeEntry(folderName, { recursive: true })
}
