import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In locale le funzioni di /api girano dentro Vite, così basta "npm run dev".
// Su Vercel le stesse funzioni diventano serverless in automatico.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
        if (name.startsWith('_')) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const query = Object.fromEntries(url.searchParams)
          let body
          if (req.method === 'POST') {
            const chunks = []
            for await (const c of req) chunks.push(c)
            try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { body = {} }
          }
          const wrap = {
            status(c) { res.statusCode = c; return wrap },
            setHeader: (k, v) => res.setHeader(k, v),
            json(d) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)) },
          }
          await mod.default({ method: req.method, query, body }, wrap)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({ plugins: [react(), localApi()] })
