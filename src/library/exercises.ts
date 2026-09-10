import type { Exercise, MuscleGroup } from '../domain/types'

function ex(id: string, name: string, primary: MuscleGroup, secondary: MuscleGroup[] = [], aliases?: string[]): Exercise {
  return aliases ? { id, name, primary, secondary, custom: false, aliases } : { id, name, primary, secondary, custom: false }
}

export const BUILTIN_EXERCISES: Exercise[] = [
  // Chest
  ex('barbell-bench-press', 'Barbell Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'chest', ['shoulders', 'triceps']),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('incline-dumbbell-bench-press', 'Incline Dumbbell Bench Press', 'chest', ['shoulders', 'triceps']),
  ex('decline-bench-press', 'Decline Bench Press', 'chest', ['triceps']),
  ex('machine-chest-press', 'Machine Chest Press', 'chest', ['triceps']),
  ex('smith-machine-bench-press', 'Smith Machine Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('push-up', 'Push-Up', 'chest', ['triceps', 'core']),
  ex('cable-fly', 'Cable Fly', 'chest'),
  ex('dumbbell-fly', 'Dumbbell Fly', 'chest'),
  ex('pec-deck', 'Pec Deck', 'chest'),
  ex('dip', 'Dip', 'chest', ['triceps']),
  // Back
  ex('deadlift', 'Deadlift', 'back', ['hamstrings', 'glutes']),
  ex('barbell-row', 'Barbell Row', 'back', ['biceps']),
  ex('pendlay-row', 'Pendlay Row', 'back', ['biceps']),
  ex('dumbbell-row', 'Dumbbell Row', 'back', ['biceps']),
  ex('meadows-row', 'Meadows Row', 'back', ['biceps']),
  ex('pull-up', 'Pull-Up', 'back', ['biceps']),
  ex('chin-up', 'Chin-Up', 'back', ['biceps']),
  ex('lat-pulldown', 'Lat Pulldown', 'back', ['biceps']),
  ex('seated-cable-row', 'Seated Cable Row', 'back', ['biceps']),
  ex('t-bar-row', 'T-Bar Row', 'back', ['biceps']),
  ex('chest-supported-row', 'Chest-Supported Row', 'back', ['biceps']),
  ex('machine-row', 'Machine Row', 'back', ['biceps']),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back'),
  ex('rack-pull', 'Rack Pull', 'back', ['glutes', 'hamstrings']),
  ex('inverted-row', 'Inverted Row', 'back', ['biceps']),
  ex('back-extension', 'Back Extension', 'back', ['glutes', 'hamstrings']),
  // Shoulders
  ex('overhead-press', 'Overhead Press', 'shoulders', ['triceps']),
  ex('push-press', 'Push Press', 'shoulders', ['triceps']),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', ['triceps']),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', ['triceps']),
  ex('arnold-press', 'Arnold Press', 'shoulders', ['triceps']),
  ex('landmine-press', 'Landmine Press', 'shoulders', ['chest', 'triceps']),
  ex('lateral-raise', 'Lateral Raise', 'shoulders'),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders'),
  ex('front-raise', 'Front Raise', 'shoulders'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', ['back']),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'shoulders', ['back']),
  ex('face-pull', 'Face Pull', 'shoulders', ['back']),
  ex('upright-row', 'Upright Row', 'shoulders', ['biceps']),
  // Biceps
  ex('barbell-curl', 'Barbell Curl', 'biceps'),
  ex('ez-bar-curl', 'EZ-Bar Curl', 'biceps'),
  ex('dumbbell-curl', 'Dumbbell Curl', 'biceps'),
  ex('hammer-curl', 'Hammer Curl', 'biceps'),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'biceps'),
  ex('preacher-curl', 'Preacher Curl', 'biceps'),
  ex('cable-curl', 'Cable Curl', 'biceps'),
  ex('concentration-curl', 'Concentration Curl', 'biceps'),
  ex('machine-curl', 'Machine Curl', 'biceps'),
  // Triceps
  ex('triceps-pushdown', 'Triceps Pushdown', 'triceps'),
  ex('rope-pushdown', 'Rope Pushdown', 'triceps'),
  ex('overhead-triceps-extension', 'Overhead Triceps Extension', 'triceps'),
  ex('skull-crusher', 'Skull Crusher', 'triceps'),
  ex('close-grip-bench-press', 'Close-Grip Bench Press', 'triceps', ['chest']),
  ex('dumbbell-kickback', 'Dumbbell Kickback', 'triceps'),
  ex('bench-dip', 'Bench Dip', 'triceps', ['chest']),
  ex('machine-triceps-extension', 'Machine Triceps Extension', 'triceps'),
  // Quads
  ex('back-squat', 'Back Squat', 'quads', ['glutes', 'core']),
  ex('front-squat', 'Front Squat', 'quads', ['core']),
  ex('box-squat', 'Box Squat', 'quads', ['glutes']),
  ex('smith-machine-squat', 'Smith Machine Squat', 'quads', ['glutes']),
  ex('goblet-squat', 'Goblet Squat', 'quads', ['glutes']),
  ex('belt-squat', 'Belt Squat', 'quads', ['glutes']),
  ex('leg-press', 'Leg Press', 'quads', ['glutes']),
  ex('hack-squat', 'Hack Squat', 'quads', ['glutes']),
  ex('leg-extension', 'Leg Extension', 'quads'),
  ex('sissy-squat', 'Sissy Squat', 'quads'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes']),
  ex('walking-lunge', 'Walking Lunge', 'quads', ['glutes']),
  ex('reverse-lunge', 'Reverse Lunge', 'quads', ['glutes']),
  ex('step-up', 'Step-Up', 'quads', ['glutes']),
  // Hamstrings
  ex('romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back']),
  ex('stiff-leg-deadlift', 'Stiff-Leg Deadlift', 'hamstrings', ['glutes', 'back']),
  ex('single-leg-rdl', 'Single-Leg Romanian Deadlift', 'hamstrings', ['glutes']),
  ex('lying-leg-curl', 'Lying Leg Curl', 'hamstrings'),
  ex('seated-leg-curl', 'Seated Leg Curl', 'hamstrings'),
  ex('nordic-curl', 'Nordic Curl', 'hamstrings'),
  ex('good-morning', 'Good Morning', 'hamstrings', ['back', 'glutes']),
  ex('glute-ham-raise', 'Glute-Ham Raise', 'hamstrings', ['glutes']),
  // Glutes
  ex('hip-thrust', 'Hip Thrust', 'glutes', ['hamstrings']),
  ex('barbell-glute-bridge', 'Barbell Glute Bridge', 'glutes', ['hamstrings']),
  ex('sumo-deadlift', 'Sumo Deadlift', 'glutes', ['hamstrings', 'back']),
  ex('cable-kickback', 'Cable Kickback', 'glutes'),
  ex('cable-pull-through', 'Cable Pull-Through', 'glutes', ['hamstrings']),
  ex('hip-abduction-machine', 'Hip Abduction Machine', 'glutes'),
  ex('kettlebell-swing', 'Kettlebell Swing', 'glutes', ['hamstrings', 'core']),
  // Calves
  ex('standing-calf-raise', 'Standing Calf Raise', 'calves'),
  ex('seated-calf-raise', 'Seated Calf Raise', 'calves'),
  ex('leg-press-calf-raise', 'Leg Press Calf Raise', 'calves'),
  ex('donkey-calf-raise', 'Donkey Calf Raise', 'calves'),
  // Core
  ex('plank', 'Plank', 'core'),
  ex('side-plank', 'Side Plank', 'core'),
  ex('cable-crunch', 'Cable Crunch', 'core'),
  ex('machine-crunch', 'Machine Crunch', 'core'),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core'),
  ex('ab-wheel-rollout', 'Ab Wheel Rollout', 'core'),
  ex('russian-twist', 'Russian Twist', 'core'),
  ex('dead-bug', 'Dead Bug', 'core'),
  ex('bird-dog', 'Bird Dog', 'core'),
  ex('pallof-press', 'Pallof Press', 'core'),
  ex('decline-sit-up', 'Decline Sit-Up', 'core'),
  ex('farmers-carry', "Farmer's Carry", 'core', ['back']),
  // Added Sept 10 2026 from the first real session
  ex('trap-bar-deadlift', 'Trap Bar Deadlift', 'back', ['hamstrings', 'glutes', 'quads'], ['hex bar deadlift']),
  ex('kettlebell-deadlift', 'Kettlebell Deadlift', 'hamstrings', ['glutes', 'back']),
  ex('landmine-row', 'Landmine Row', 'back', ['biceps']),
  ex('assisted-pull-up', 'Assisted Pull-Up', 'back', ['biceps']),
  ex('single-arm-cable-row', 'Single-Arm Cable Row', 'back', ['biceps']),
  ex('barbell-shrug', 'Barbell Shrug', 'back'),
  ex('dumbbell-shrug', 'Dumbbell Shrug', 'back'),
  ex('dumbbell-pullover', 'Dumbbell Pullover', 'chest', ['back']),
  ex('incline-machine-press', 'Incline Machine Press', 'chest', ['shoulders', 'triceps']),
  ex('machine-lateral-raise', 'Machine Lateral Raise', 'shoulders'),
  ex('y-raise', 'Y Raise', 'shoulders', ['back']),
  ex('reverse-curl', 'Reverse Curl', 'biceps'),
  ex('wrist-curl', 'Wrist Curl', 'biceps'),
  ex('spider-curl', 'Spider Curl', 'biceps'),
  ex('diamond-push-up', 'Diamond Push-Up', 'triceps', ['chest']),
  ex('single-arm-pushdown', 'Single-Arm Pushdown', 'triceps'),
  ex('sled-push', 'Sled Push', 'quads', ['glutes', 'calves']),
  ex('sled-pull', 'Sled Pull', 'hamstrings', ['glutes', 'back']),
  ex('box-jump', 'Box Jump', 'quads', ['glutes', 'calves']),
  ex('wall-ball', 'Wall Ball', 'quads', ['shoulders', 'core']),
  ex('banded-lateral-walk', 'Banded Lateral Walk', 'glutes', [], ['side band steps', 'lateral band walk']),
  ex('monster-walk', 'Monster Walk', 'glutes'),
  ex('clamshell', 'Clamshell', 'glutes'),
  ex('glute-bridge', 'Glute Bridge', 'glutes', ['hamstrings']),
  ex('single-leg-calf-raise', 'Single-Leg Calf Raise', 'calves'),
  ex('medicine-ball-slam', 'Medicine Ball Slam', 'core', ['back', 'shoulders']),
  ex('suitcase-carry', 'Suitcase Carry', 'core', ['back']),
  ex('mountain-climber', 'Mountain Climber', 'core'),
  ex('hanging-knee-raise', 'Hanging Knee Raise', 'core'),
  ex('sit-up', 'Sit-Up', 'core'),
]

/** Lifts that take a 10 lb jump when stalled: big lower body barbell and machine compound lifts. Everything else gets 5 lb. */
const BIG_LIFT_IDS = new Set([
  'back-squat', 'front-squat', 'box-squat', 'smith-machine-squat', 'belt-squat', 'leg-press', 'hack-squat',
  'deadlift', 'sumo-deadlift', 'trap-bar-deadlift', 'romanian-deadlift', 'stiff-leg-deadlift', 'rack-pull',
  'hip-thrust', 'barbell-glute-bridge', 'good-morning',
])

export function suggestedIncrement(exercise: Exercise): 5 | 10 {
  return BIG_LIFT_IDS.has(exercise.id) ? 10 : 5
}

/** Case-insensitive search over names and aliases. Blank query returns nothing. */
export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return exercises.filter((e) => e.name.toLowerCase().includes(q) || (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)))
}
