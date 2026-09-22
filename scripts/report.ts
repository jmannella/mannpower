import { readFileSync } from 'node:fs'
import { GitHubContents } from '../src/sync/github'
import { validateDataset } from '../src/domain/validate'
import { digestMarkdown, weeklyDigest } from '../src/stats/digest'
import { lastSunday, todayISO, weekEnd } from '../src/domain/dates'

class ReportError extends Error {}

function fail(message: string): never {
  throw new ReportError(message)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  const next = process.argv[i + 1]
  if (!next || next.startsWith('--')) return ''
  return next
}

/** The Sunday ending the week that contains today. On the scheduled Sunday run that is today; midweek it is the current, partial week. */
function defaultWeekEnd(): string {
  return weekEnd(todayISO())
}

async function loadRaw(): Promise<string> {
  const file = arg('--file')
  if (file) return readFileSync(file, 'utf8')
  const token = process.env.MANNPOWER_TOKEN
  const repo = process.env.MANNPOWER_DATA_REPO || 'jmannella/mannpower-data'
  if (!token) fail('MANNPOWER_TOKEN is not set. Copy .env.example to .env and add the fine-grained token for the data repo.')
  const remote = await new GitHubContents(token, repo).get()
  if (!remote) fail(`data.json was not found in ${repo}. Has the phone synced yet?`)
  return remote.content
}

/** --week takes a Sunday date, or `last` for the most recent Sunday on or before today. The scheduled run uses `last` so a run that slips past Sunday still reports the week that just ended instead of the empty new one. */
function resolveWeek(weekArg: string | undefined): string {
  if (weekArg === undefined) return defaultWeekEnd()
  if (weekArg === 'last') return lastSunday(todayISO())
  return weekArg
}

async function main(): Promise<void> {
  const weekEndDate = resolveWeek(arg('--week'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEndDate)) fail(`Bad --week value: ${weekEndDate}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(await loadRaw())
  } catch (e) {
    fail(`Could not read the dataset: ${e instanceof Error ? e.message : String(e)}`)
  }
  const v = validateDataset(parsed)
  if (!v.ok) fail(`Dataset failed validation: ${v.errors.join('; ')}`)
  process.stdout.write(digestMarkdown(weeklyDigest(v.dataset, weekEndDate)) + '\n')
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 1
})
