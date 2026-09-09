import type { DayRecord } from '../domain/types'
import { addDays, inRange, weekEnd } from '../domain/dates'

export interface StepsSummary {
  total: number
  mean?: number
  daysLogged: number
  daysAtGoal: number
  bestDay?: { date: string; steps: number }
}

export function stepsSummary(days: DayRecord[], from: string, to: string, goal?: number): StepsSummary {
  const logged = days.filter((d) => d.steps !== undefined && inRange(d.date, from, to))
  const out: StepsSummary = { total: 0, daysLogged: logged.length, daysAtGoal: 0 }
  for (const d of logged) {
    const steps = d.steps as number
    out.total += steps
    if (goal !== undefined && steps >= goal) out.daysAtGoal += 1
    if (!out.bestDay || steps > out.bestDay.steps) out.bestDay = { date: d.date, steps }
  }
  if (logged.length) out.mean = out.total / logged.length
  return out
}

export interface CardioSummary {
  minutes: number
  sessions: number
  byType: Record<string, { minutes: number; sessions: number }>
}

export function dayCardioMinutes(day: DayRecord): number {
  return day.cardio.reduce((sum, c) => sum + c.minutes, 0)
}

export function cardioSummary(days: DayRecord[], from: string, to: string): CardioSummary {
  const out: CardioSummary = { minutes: 0, sessions: 0, byType: {} }
  for (const d of days) {
    if (!inRange(d.date, from, to)) continue
    for (const c of d.cardio) {
      out.minutes += c.minutes
      out.sessions += 1
      const t = out.byType[c.type] ?? { minutes: 0, sessions: 0 }
      t.minutes += c.minutes
      t.sessions += 1
      out.byType[c.type] = t
    }
  }
  return out
}

export function weeklyActivitySeries(
  days: DayRecord[], fromWeekStart: string, toWeekStart: string, goal?: number,
): { week: string; steps: StepsSummary; cardio: CardioSummary }[] {
  const out: { week: string; steps: StepsSummary; cardio: CardioSummary }[] = []
  let week = fromWeekStart
  while (week <= toWeekStart) {
    out.push({ week, steps: stepsSummary(days, week, weekEnd(week), goal), cardio: cardioSummary(days, week, weekEnd(week)) })
    week = addDays(week, 7)
  }
  return out
}
