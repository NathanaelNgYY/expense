export interface RateLimitPolicy {
  name: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  limited: boolean
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

export const AUTH_FAILURE_RATE_LIMIT: RateLimitPolicy = {
  name: 'auth-failure',
  limit: 10,
  windowMs: 60_000,
}

export const API_RATE_LIMIT: RateLimitPolicy = {
  name: 'api',
  limit: 300,
  windowMs: 60_000,
}

const buckets = new Map<string, Bucket>()

function clientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim() || 'unknown'

  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 10_000) return

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function checkRateLimit(
  req: Request,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  pruneExpiredBuckets(now)

  const key = `${policy.name}:${clientIp(req)}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs })
    return { limited: false, retryAfterSeconds: 0 }
  }

  current.count += 1
  if (current.count <= policy.limit) {
    return { limited: false, retryAfterSeconds: 0 }
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export function rateLimitedResponse(result: RateLimitResult): Response {
  return new Response(JSON.stringify({ error: 'rate-limited' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(result.retryAfterSeconds),
    },
  })
}

export function resetRateLimits(): void {
  buckets.clear()
}
