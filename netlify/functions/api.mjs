// Netlify Function wrapper around the wallet API.
//
// The API is plain request/response, so it runs fine as a serverless function
// and the app plus its backend can live on one Netlify site. The WebSocket
// relay is the exception -- it holds connections open and still needs a Node
// host (see render.yaml / Dockerfile).
//
// Routed by netlify.toml: /api/* -> /.netlify/functions/api/:splat

import { Readable } from 'node:stream'
import { openDb } from '../../server/api/db.js'
import { createApi } from '../../server/api/routes.js'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

// Reused across warm invocations so each request does not reopen the pool.
let apiPromise = null
function getApi() {
  if (!apiPromise) {
    apiPromise = openDb().then((db) => createApi(db, ALLOWED_ORIGINS))
  }
  return apiPromise
}

/** Adapt a Web Request to the node-style (req, res) the API expects. */
export default async function handler(request) {
  const api = await getApi()
  const url = new URL(request.url)
  const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.text()

  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = request.method
  req.url = url.pathname + url.search
  req.headers = Object.fromEntries(request.headers.entries())

  return new Promise((resolve) => {
    const chunks = []
    let status = 200
    let headers = {}

    const res = {
      headersSent: false,
      writeHead(code, hdrs) {
        status = code
        headers = { ...headers, ...(hdrs || {}) }
        this.headersSent = true
      },
      setHeader(k, v) {
        headers[k] = v
      },
      write(chunk) {
        chunks.push(Buffer.from(chunk))
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk))
        resolve(new Response(Buffer.concat(chunks).toString('utf8') || null, { status, headers }))
      },
    }

    api(req, res)
      .then((handled) => {
        if (!handled && !res.headersSent) {
          resolve(new Response(JSON.stringify({ error: 'not_found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }))
        }
      })
      .catch((err) => {
        console.error('API function error:', err)
        resolve(new Response(JSON.stringify({ error: 'server_error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }))
      })
  })
}

export const config = { path: '/api/*' }
