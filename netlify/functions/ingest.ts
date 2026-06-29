import { isAuthorized } from './lib/auth'
import { handleIngest, type IngestBody } from './lib/ingestHandler'
import { BlobEntryStore } from './lib/store'
import { API_RATE_LIMIT, AUTH_FAILURE_RATE_LIMIT, checkRateLimit, rateLimitedResponse } from './lib/rateLimit'

export const config = { path: '/api/ingest' }

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  if (!isAuthorized(req.headers.get('authorization'), process.env.INGEST_TOKEN)) {
    const limit = checkRateLimit(req, AUTH_FAILURE_RATE_LIMIT)
    if (limit.limited) return rateLimitedResponse(limit)
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const limit = checkRateLimit(req, API_RATE_LIMIT)
  if (limit.limited) return rateLimitedResponse(limit)

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return new Response(JSON.stringify({ error: 'invalid-json' }), { status: 400 })
  }

  const result = await handleIngest(body, new BlobEntryStore())
  if (result.status === 'error') {
    return new Response(JSON.stringify(result), { status: 400 })
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
