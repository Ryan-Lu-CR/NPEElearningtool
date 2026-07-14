import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const MANIFEST = '题库数据.json'
const USER_DATA = '用户数据.json'
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif)$/i
const STRUCTURED_IMAGE_PATTERN = /^(?:Q|A)-\d+-\d+-\d+(?:\.\d+)?\.(?:png|jpe?g|webp|gif|bmp|avif)$/i
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif'
}

function defaultWorkspacePlugin(): Plugin {
  const root = path.resolve(process.cwd(), '默认题库')
  const userDataRoot = path.resolve(process.cwd(), '用户数据')
  function resolveBankPath(relativePath: string, bankFolders: string[]) {
    const knownFolder = [...bankFolders]
      .sort((left, right) => right.length - left.length)
      .find(folder => relativePath.startsWith(`${folder}/`))
    if (knownFolder) return { bankFolder: knownFolder, relativePath: relativePath.slice(knownFolder.length + 1) }
    const separator = relativePath.indexOf('/')
    return separator < 0
      ? { bankFolder: '', relativePath }
      : { bankFolder: relativePath.slice(0, separator), relativePath: relativePath.slice(separator + 1) }
  }
  async function scan(bankFolders: string[], directory = root, prefix = ''): Promise<Array<{ name: string; relativePath: string; bankFolder: string; url: string }>> {
    const output: Array<{ name: string; relativePath: string; bankFolder: string; url: string }> = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === MANIFEST) continue
      const absolute = path.join(directory, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) output.push(...await scan(bankFolders, absolute, relativePath))
      else if (entry.isFile() && STRUCTURED_IMAGE_PATTERN.test(entry.name)) {
        const modified = (await stat(absolute)).mtimeMs
        const resolved = resolveBankPath(relativePath, bankFolders)
        output.push({ name: entry.name, ...resolved, url: `/api/default-workspace/file?path=${encodeURIComponent(path.relative(root, absolute))}&v=${modified}` })
      }
    }
    return output
  }
  const configureWorkspaceServer = (server: { middlewares: Connect.Server }) => {
      server.middlewares.use('/api/default-workspace/index', async (_request, response) => {
        try {
          let manifest = null
          let userData = null
          try { manifest = JSON.parse(await readFile(path.join(root, MANIFEST), 'utf8')) } catch {}
          try { userData = JSON.parse(await readFile(path.join(userDataRoot, USER_DATA), 'utf8')) } catch {}
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          const bankFolders = Object.values((manifest as { folders?: Record<string, string> } | null)?.folders || {})
          response.end(JSON.stringify({ name: '默认题库', manifest, userData, images: await scan(bankFolders) }))
        } catch (error) { response.statusCode = 500; response.end(error instanceof Error ? error.message : '默认题库扫描失败') }
      })
      server.middlewares.use('/api/default-workspace/file', async (request, response) => {
        try {
          const relative = new URL(request.url || '', 'http://localhost').searchParams.get('path') || ''
          const absolute = path.resolve(root, relative)
          if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) { response.statusCode = 403; response.end(); return }
          const [resolvedRoot, resolvedFile] = await Promise.all([realpath(root), realpath(absolute)])
          if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) { response.statusCode = 403; response.end(); return }
          response.setHeader('Content-Type', IMAGE_CONTENT_TYPES[path.extname(resolvedFile).toLowerCase()] || 'application/octet-stream')
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          createReadStream(resolvedFile).on('error', () => { response.statusCode = 404; response.end() }).pipe(response)
        } catch { response.statusCode = 404; response.end() }
      })
      server.middlewares.use('/api/default-workspace/manifest', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf8')
            JSON.parse(content)
            await writeFile(path.join(root, MANIFEST), content)
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '写入失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/user-data', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf8')
            JSON.parse(content)
            await mkdir(userDataRoot, { recursive: true })
            await writeFile(path.join(userDataRoot, USER_DATA), content)
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '写入失败') }
        })
      })
  }
  return {
    name: 'default-question-bank-workspace',
    handleHotUpdate(context) {
      if (path.resolve(context.file) === path.join(root, MANIFEST)) return []
    },
    configureServer: configureWorkspaceServer,
    configurePreviewServer: configureWorkspaceServer
  }
}

export default defineConfig({ plugins: [react(), defaultWorkspacePlugin()] })
