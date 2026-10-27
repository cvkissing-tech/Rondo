import { createServer, type Server } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join, relative, isAbsolute, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
const previews = new Map<string, { server: Server; url: string }>()
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
}
// Standard-library static preview, so ES module games work without file:// CORS.
export async function previewHtml(workspace: string, file: string): Promise<string> {
  const root = await realpath(workspace)
  const existing = previews.get(root)
  if (existing)
    return (
      existing.url +
      relative(root, file).replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')
    )
  const token = randomUUID()
  const server = createServer(async (req, res) => {
    try {
      const route = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
      if (!route.startsWith('/' + token + '/')) {
        res.writeHead(404).end()
        return
      }
      const name = route.slice(token.length + 2)
      if (name.split('/').some((part) => part.startsWith('.') || part === '..')) {
        res.writeHead(403).end()
        return
      }
      const target = await realpath(join(root, name)),
        child = relative(root, target)
      if (!child || child.startsWith('..') || isAbsolute(child)) {
        res.writeHead(403).end()
        return
      }
      const info = await stat(target)
      if (!info.isFile() || info.size > 16 * 1024 * 1024) {
        res.writeHead(413).end()
        return
      }
      const bytes = await readFile(target)
      res.writeHead(200, {
        'Content-Type': mime[extname(target).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      })
      res.end(bytes)
    } catch {
      res.writeHead(404).end('Preview file unavailable')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('本地预览端口不可用')
  const url = `http://127.0.0.1:${address.port}/${token}/`
  previews.set(root, { server, url })
  return (
    url + relative(root, file).replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')
  )
}
export async function closePreviews() {
  await Promise.all(
    [...previews.values()].map(
      ({ server }) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
  previews.clear()
}
