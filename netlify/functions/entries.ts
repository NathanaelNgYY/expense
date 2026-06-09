import type { Context } from '@netlify/functions'
import { isAuthorized } from './lib/auth'
import { BlobEntryStore } from './lib/store'
import { listEntries, createEntry, updateEntryById, deleteEntryById, type NewManualEntry } from './lib/entriesHandler'

export const config = { path: ['/api/entries', '/api/entries/:id'] }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (!isAuthorized(req.headers.get('authorization'), process.env.INGEST_TOKEN)) {
    return json({ error: 'unauthorized' }, 401)
  }
  const store = new BlobEntryStore()
  const id = context.params?.id

  if (req.method === 'GET' && !id) {
    return json(await listEntries(store))
  }
  if (req.method === 'POST' && !id) {
    const body = (await req.json()) as NewManualEntry
    return json(await createEntry(body, store), 201)
  }
  if (req.method === 'PUT' && id) {
    const patch = (await req.json()) as Record<string, unknown>
    const updated = await updateEntryById(id, patch, store)
    return updated ? json(updated) : json({ error: 'not-found' }, 404)
  }
  if (req.method === 'DELETE' && id) {
    const ok = await deleteEntryById(id, store)
    return ok ? json({ status: 'deleted' }) : json({ error: 'not-found' }, 404)
  }
  return json({ error: 'method-not-allowed' }, 405)
}
