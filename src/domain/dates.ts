const MS_PER_DAY = 86_400_000
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseISO(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now)
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function addDays(date: string, n: number): string {
  const d = parseISO(date)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Monday of the week containing date. */
export function weekStart(date: string): string {
  const d = parseISO(date)
  const offset = (d.getDay() + 6) % 7
  return addDays(date, -offset)
}

/** Sunday of the week containing date. */
export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / MS_PER_DAY)
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  let d = from
  while (d <= to) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

export function formatShort(date: string): string {
  const d = parseISO(date)
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`
}

export function formatWeekLabel(weekStartDate: string): string {
  const d = parseISO(weekStartDate)
  return `${MON[d.getMonth()]} ${d.getDate()}`
}
