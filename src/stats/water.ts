import { DEFAULT_WATER_GOAL, type DayRecord } from '../domain/types'
import { inRange } from '../domain/dates'

export interface WaterWeek {
  daysLogged: number
  avgGlasses?: number
  daysAtGoal: number
  goal: number
}

export function waterWeek(days: DayRecord[], start: string, end: string, goal?: number): WaterWeek {
  const target = goal !== undefined && goal > 0 ? goal : DEFAULT_WATER_GOAL
  const logged = days
    .filter((d) => d.waterGlasses !== undefined && inRange(d.date, start, end))
    .map((d) => d.waterGlasses as number)

  return {
    daysLogged: logged.length,
    avgGlasses: logged.length === 0 ? undefined : logged.reduce((a, b) => a + b, 0) / logged.length,
    daysAtGoal: logged.filter((g) => g >= target).length,
    goal: target,
  }
}
