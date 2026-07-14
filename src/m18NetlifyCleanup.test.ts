import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('M18 retired Netlify architecture', () => {
  it('has no Netlify runtime, configuration, or package dependency', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const packages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }

    expect(existsSync(resolve(root, 'netlify'))).toBe(false)
    expect(existsSync(resolve(root, 'netlify.toml'))).toBe(false)
    expect(Object.keys(packages).filter(name => name.startsWith('@netlify/'))).toEqual([])
  })

  it('keeps custom-token ingestion on the Supabase Edge Function contract', () => {
    const config = read('supabase/config.toml')
    const liveTestScript = read('scripts/test-ingest.ps1')

    expect(existsSync(resolve(root, 'supabase/functions/ingest/index.ts'))).toBe(true)
    expect(existsSync(resolve(root, 'supabase/functions/ingest/handler.ts'))).toBe(true)
    expect(config).toMatch(/\[functions\.ingest\][\s\S]*?verify_jwt\s*=\s*false/)
    expect(liveTestScript).toContain('/functions/v1/ingest')
    expect(liveTestScript).not.toMatch(/netlify|\/api\/ingest/i)
  })

  it('describes only the active Vercel and Supabase architecture in current guidance', () => {
    const currentGuidance = `${read('README.md')}\n${read('AGENTS.md')}`

    expect(currentGuidance).not.toMatch(/frozen Netlify|Netlify fallback|netlify dev|@netlify\//i)
    expect(currentGuidance).toContain('Vercel')
    expect(currentGuidance).toContain('Supabase')
  })
})
