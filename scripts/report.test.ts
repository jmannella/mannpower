import { execFileSync } from 'node:child_process'

function run(args: string[], env: Record<string, string> = {}) {
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/report.ts', ...args], {
      encoding: 'utf8', env: { ...process.env, MANNPOWER_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout, err: err.stderr }
  }
}

describe('report script', () => {
  test('prints the digest for a fixture week', () => {
    const r = run(['--file', 'scripts/fixtures/week.json', '--week', '2026-09-13'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('# Mannpower weekly digest, 2026-09-07 to 2026-09-13')
    expect(r.out).toContain('## Summary')
    expect(r.out).toContain('Stalled: Back Squat at 185 lb')
    expect(r.out).toContain('PR Barbell Bench Press')
    expect(r.out).toContain('Lower back')
    expect(r.out).toContain('```json')
  })

  test('fails clearly without a token', () => {
    const r = run(['--week', '2026-09-13'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('MANNPOWER_TOKEN')
  })
}, 30000)
