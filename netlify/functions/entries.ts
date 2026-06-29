import type { Context } from '@netlify/functions'
import { isAuthorized } from './lib/auth'
import { BlobEntryStore } from './lib/store'
import { listEntries, createEntry, updateEntryById, deleteEntryById, type NewManualEntry } from './lib/entriesHandler'
import { API_RATE_LIMIT, AUTH_FAILURE_RATE_LIMIT, checkRateLimit, rateLimitedResponse } from './lib/rateLimit'

export const config = { path: ['/api/entries', '/api/entries/:id'] }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

async function parseJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (!isAuthorized(req.headers.get('authorization'), process.env.INGEST_TOKEN)) {
    const limit = checkRateLimit(req, AUTH_FAILURE_RATE_LIMIT)
    if (limit.limited) return rateLimitedResponse(limit)
    return json({ error: 'unauthorized' }, 401)
  }

  const limit = checkRateLimit(req, API_RATE_LIMIT)
  if (limit.limited) return rateLimitedResponse(limit)

  const store = new BlobEntryStore()
  const id = context.params?.id

  if (req.method === 'GET' && !id) {
    return json(await listEntries(store))
  }
  if (req.method === 'POST' && !id) {
    const body = await parseJson<NewManualEntry>(req)
    if (!body) return json({ error: 'invalid-json' }, 400)
    return json(await createEntry(body, store), 201)
  }
  if (req.method === 'PUT' && id) {
    const patch = await parseJson<Record<string, unknown>>(req)
    if (!patch) return json({ error: 'invalid-json' }, 400)
    const updated = await updateEntryById(id, patch, store)
    return updated ? json(updated) : json({ error: 'not-found' }, 404)
  }
  if (req.method === 'DELETE' && id) {
    const ok = await deleteEntryById(id, store)
    return ok ? json({ status: 'deleted' }) : json({ error: 'not-found' }, 404)
  }
  return json({ error: 'method-not-allowed' }, 405)
}
