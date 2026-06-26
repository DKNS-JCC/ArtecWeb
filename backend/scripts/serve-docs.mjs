/**
 * Servidor estático mínimo (sin dependencias) para previsualizar la
 * documentación generada del backend.
 *
 * Sirve `docs/back` por HTTP usando sólo módulos nativos de Node
 * (`node:http`, `node:fs`). Incluye una guarda anti–path-traversal y avisa si
 * la documentación aún no se ha generado.
 *
 * Uso:  npm run docs:serve   (desde la carpeta backend)
 * Puerto configurable con la variable de entorno DOCS_PORT (por defecto 8089).
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../docs/back', import.meta.url))
const PORT = Number(process.env.DOCS_PORT) || 8089

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
}

if (!existsSync(ROOT)) {
  console.error('No existe docs/back. Ejecuta primero:  npm run docs:jsdoc')
  process.exit(1)
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = normalize(join(ROOT, p))
    if (!file.startsWith(ROOT)) {
      res.writeHead(403)
      return res.end('Forbidden')
    }
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
  }
}).listen(PORT, () => {
  console.log(`Documentación del backend en  http://localhost:${PORT}/`)
  console.log('Pulsa Ctrl+C para detener.')
})
