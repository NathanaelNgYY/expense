import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface VercelHeader {
  key: string
  value: string
}

interface VercelHeaderRule {
  source: string
  headers: VercelHeader[]
}

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as { headers: VercelHeaderRule[] }

describe('Vercel security headers', () => {
  it('allows only the required API and monitoring origins in connect-src', () => {
    const globalRule = vercelConfig.headers.find((rule) => rule.source === '/(.*)')
    const csp = globalRule?.headers.find((header) => header.key === 'Content-Security-Policy')?.value
    const connectSources = csp
      ?.split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .find(([directive]) => directive === 'connect-src')
      ?.slice(1)

    expect(connectSources).toEqual([
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://o4511727901736960.ingest.de.sentry.io',
    ])
  })
})
