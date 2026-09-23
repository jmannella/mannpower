import { execFileSync } from 'node:child_process'
import { addDays, lastSunday, todayISO } from '../src/domain/dates'

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
    expect(r.out).toContain('## Nutrition')
    expect(r.out).toContain('- Complete days logged: 7 of 7')
    expect(r.out).toContain('Double double')
  })

  test('fails clearly without a token', () => {
    const r = run(['--week', '2026-09-13'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('MANNPOWER_TOKEN')
  })

  test('--week last reports the most recent completed week whatever day it runs', () => {
    const end = lastSunday(todayISO())
    const r = run(['--file', 'scripts/fixtures/week.json', '--week', 'last'])
    expect(r.code).toBe(0)
    expect(r.out).toContain(`# Mannpower weekly digest, ${addDays(end, -6)} to ${end}`)
  })

  test('a --week flag without a value is rejected', () => {
    const r = run(['--file', 'scripts/fixtures/week.json', '--week'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('Bad --week value')
  })

  test('includes the Recovery section', () => {
    const r = run(['--file', 'scripts/fixtures/week.json', '--week', '2026-09-13'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('## Recovery')
    expect(r.out).toContain('IM8 Daily Essentials')
    expect(r.out).toContain('Drinks: 2 this week')
  })
}, 30000)
