import { useLiveQuery } from 'dexie-react-hooks'
import { getDay, getSettings, getWorkoutByDate, listDays, listExercises, listPain, listWorkouts } from '../data/repo'

export function useSettings() {
  return useLiveQuery(() => getSettings(), [])
}
export function useExercises() {
  return useLiveQuery(() => listExercises(), []) ?? []
}
export function useWorkouts() {
  return useLiveQuery(() => listWorkouts(), []) ?? []
}
export function useDays() {
  return useLiveQuery(() => listDays(), []) ?? []
}
export function usePain() {
  return useLiveQuery(() => listPain(), []) ?? []
}
export function useDay(date: string) {
  return useLiveQuery(() => getDay(date), [date])
}
export function useWorkoutByDate(date: string) {
  return useLiveQuery(() => getWorkoutByDate(date), [date])
}
