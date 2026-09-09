import { readFileSync } from 'node:fs'
import { GitHubContents } from '../src/sync/github'
import { validateDataset } from '../src/domain/validate'
import { digestMarkdown, weeklyDigest } from '../src/stats/digest'
import { addDays, parseISO, todayISO, weekStart } from '../src/domain/dates'

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

/** Sunday of the most recent completed week: today if today is Sunday, otherwise last Sunday. */
function defaultWeekEnd(): string {
  const today = todayISO()
  return parseISO(today).getDay() === 0 ? today : addDays(weekStart(today), -1)
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

async function main(): Promise<void> {
  const weekArg = arg('--week')
  const weekEndDate = weekArg === undefined ? defaultWeekEnd() : weekArg
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
