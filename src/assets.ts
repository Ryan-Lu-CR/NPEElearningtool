const DB_NAME = 'npee-question-assets'
const STORE_NAME = 'assets'
const DB_VERSION = 1
const assetUrls = new Map<string, string>()
const assetListeners = new Set<() => void>()
let assetRevision = 0

export interface AssetInput { key: string; file: File; url?: string }

export function subscribeAssetChanges(listener: () => void) {
  assetListeners.add(listener)
  return () => { assetListeners.delete(listener) }
}

export function getAssetRevision() { return assetRevision }

function notifyAssetChanges() {
  assetRevision++
  assetListeners.forEach(listener => listener())
}

function registerAssetUrl(key: string, url: string) {
  const previous = assetUrls.get(key)
  if (previous?.startsWith('blob:') && previous !== url) URL.revokeObjectURL(previous)
  assetUrls.set(key, url)
}

export function readableAssetStorageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/Failed to write blobs|TimestampError|Unable to create writable file|IO error/i.test(message))
    return new Error('浏览器图片缓存写入失败。请刷新页面重试；工作区图片将直接从文件夹读取。')
  return error instanceof Error ? error : new Error(message)
}

async function removeLegacyCachedAssets(keys: string[]) {
  if (!keys.length || typeof indexedDB === 'undefined') return
  let database: IDBDatabase | undefined
  try {
    database = await openDatabase()
    const activeDatabase = database
    await new Promise<void>((resolve, reject) => {
      const transaction = activeDatabase.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      keys.forEach(key => store.delete(key))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch { /* Direct workspace URLs remain usable if legacy-cache cleanup fails. */ }
  finally { database?.close() }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开图片素材库'))
  })
}

export async function putAssets(inputs: AssetInput[]) {
  if (!inputs.length) return
  const urlInputs = inputs.filter((input): input is AssetInput & { url: string } => Boolean(input.url))
  urlInputs.forEach(input => registerAssetUrl(input.key, input.url))
  if (urlInputs.length) notifyAssetChanges()
  void removeLegacyCachedAssets(urlInputs.map(input => input.key))
  const blobInputs = inputs.filter(input => !input.url)
  if (!blobInputs.length) return
  let database: IDBDatabase
  try { database = await openDatabase() } catch (error) { throw readableAssetStorageError(error) }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      blobInputs.forEach(({ key, file }) => store.put({ key, blob: file, name: file.name, type: file.type, updatedAt: Date.now() }))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('图片写入失败，可能已超出浏览器存储空间'))
      transaction.onabort = () => reject(transaction.error || new Error('图片写入已中止'))
    })
  } catch (error) { throw readableAssetStorageError(error) }
  finally { database.close() }
  notifyAssetChanges()
}

async function resolveAssetBlobs(keys: string[]): Promise<Array<Blob | null>> {
  if (!keys.length) return []
  const records: Array<{ blob?: Blob; url?: string } | null> = keys.map(key => assetUrls.has(key) ? { url: assetUrls.get(key)! } : null)
  const missing = keys.map((key, index) => ({ key, index })).filter(({ index }) => records[index] === null)
  if (missing.length) {
    const database = await openDatabase()
    try {
      const stored = await Promise.all(missing.map(({ key }) => new Promise<{ blob?: Blob; url?: string } | null>((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })))
      missing.forEach(({ index }, position) => { records[index] = stored[position] })
    } finally { database.close() }
  }
  return Promise.all(records.map(async record => {
    if (record?.blob instanceof Blob) return record.blob
    if (record?.url) { const response = await fetch(record.url); return response.ok ? response.blob() : null }
    return null
  }))
}

export async function getAssetBlobs(keys: string[]): Promise<Blob[]> {
  return (await resolveAssetBlobs(keys)).filter((blob): blob is Blob => blob !== null)
}

export async function getAssetFiles(keys: string[]) {
  const blobs = await resolveAssetBlobs(keys)
  return keys.flatMap((key, index) => blobs[index] ? [{ key, blob: blobs[index] as Blob }] : [])
}

export async function deleteAssets(keys: string[]) {
  if (!keys.length) return
  const storedKeys = keys.filter(key => {
    const url = assetUrls.get(key)
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    return !assetUrls.delete(key)
  })
  if (!storedKeys.length) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite'); const store = transaction.objectStore(STORE_NAME)
    storedKeys.forEach(key => store.delete(key)); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function clearAssets() {
  assetUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url) })
  assetUrls.clear()
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite'); transaction.objectStore(STORE_NAME).clear()
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export type ImageKind = 'question' | 'answer'

export interface StructuredImageMatch {
  chapterCode: string
  chapterName: string
  sectionCode: string
  sectionName: string
  questionCode: string
  kind: ImageKind
  order: number
}

export function parseStructuredImagePath(relativePath: string, filename: string): StructuredImageMatch | null {
  const basename = filename.replace(/\.[^.]+$/, '')
  const match = basename.match(/^(Q|A)-(\d+)-(\d+)-(\d+)(?:\.(\d+))?$/i)
  if (!match) return null
  const [, kindToken, chapterCode, sectionCode, questionCode, orderToken] = match
  const folders = relativePath.split('/').slice(0, -1)
  const folderPattern = new RegExp(`^0*${Number(chapterCode)}\\s*(.+?)\\s+0*${Number(sectionCode)}[-_ ](.+?)$`, 'i')
  const folderMatch = folders.map(folder => folder.includes('.') ? null : folder.match(folderPattern)).find(Boolean)
  return {
    chapterCode,
    chapterName: folderMatch?.[1]?.trim() || `第 ${chapterCode} 章`,
    sectionCode,
    sectionName: folderMatch?.[2]?.trim() || `第 ${sectionCode} 节`,
    questionCode,
    kind: kindToken.toUpperCase() === 'A' ? 'answer' : 'question',
    order: Number(orderToken || 1)
  }
}
