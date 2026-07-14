import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/ci.yml'),
  'utf8',
).replaceAll('\r\n', '\n')

function stepNamed(name: string): string {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  if (start === -1) throw new Error(`Missing CI step: ${name}`)

  const nextStep = workflow.indexOf('\n      - name: ', start + marker.length)
  return workflow.slice(start, nextStep === -1 ? undefined : nextStep)
}

describe('CI enforcement', () => {
  it('blocks merges when a high-severity dependency audit fails', () => {
    const auditStep = stepNamed('Audit dependencies')

    expect(auditStep).toContain('run: npm audit --audit-level=high')
    expect(auditStep).not.toContain('continue-on-error: true')
  })

  it.each(['verify', 'rls', 'e2e'])('keeps the %s gate in CI', (job) => {
    expect(workflow).toMatch(new RegExp(`^  ${job}:$`, 'm'))
  })

  it('runs for pull requests targeting main', () => {
    expect(workflow).toMatch(/pull_request:\n    branches: \[main\]/)
  })
})
