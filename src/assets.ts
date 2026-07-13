const DB_NAME = 'npee-question-assets'
const STORE_NAME = 'assets'
const DB_VERSION = 1

export interface AssetInput { key: string; file: File }

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
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    inputs.forEach(({ key, file }) => store.put({ key, blob: file, name: file.name, type: file.type, updatedAt: Date.now() }))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('图片写入失败，可能已超出浏览器存储空间'))
    transaction.onabort = () => reject(transaction.error || new Error('图片写入已中止'))
  })
  database.close()
}

export async function getAssetBlobs(keys: string[]): Promise<Blob[]> {
  if (!keys.length) return []
  const database = await openDatabase()
  const blobs = await Promise.all(keys.map(key => new Promise<Blob | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null)
    request.onerror = () => reject(request.error)
  })))
  database.close()
  return blobs.filter((blob): blob is Blob => blob !== null)
}

export type ImageKind = 'question' | 'answer'
export interface ImageMatch { questionId: string; kind: ImageKind; order: number }

export function parseImageFilename(filename: string, questionIds: Set<string>): ImageMatch | null {
  const basename = filename.replace(/\.[^.]+$/, '')
  const canonical = basename.match(/^(q|a)__(.+?)(?:__(\d+))?$/i)
  if (canonical) {
    const questionId = canonical[2]
    if (!questionIds.has(questionId)) return null
    return { questionId, kind: canonical[1].toLowerCase() === 'q' ? 'question' : 'answer', order: Number(canonical[3] || 1) }
  }
  for (const questionId of questionIds) {
    if (basename === questionId) return { questionId, kind: 'question', order: 1 }
    const suffix = basename.slice(questionId.length)
    const friendly = suffix.match(/^(?:__|_|-)(q|question|题目|a|answer|答案)(?:(?:__|_|-)(\d+))?$/i)
    if (friendly) return { questionId, kind: /^(a|answer|答案)$/i.test(friendly[1]) ? 'answer' : 'question', order: Number(friendly[2] || 1) }
  }
  return null
}
