/** Preset variation tags offered on a workout card. Free text is also allowed. */
export const VARIATION_GROUPS: { label: string; tags: string[] }[] = [
  { label: 'Position and grip', tags: ['Seated', 'Standing', 'Lying', 'Incline', 'Decline', 'Kneeling', 'Half-kneeling', 'Single-arm', 'Single-leg', 'Alternating', 'Wide grip', 'Close grip', 'Neutral grip'] },
  { label: 'Tempo', tags: ['Tempo 3-1-1', 'Tempo 4-0-1', '3 second hold', 'Pause', 'Slow eccentric', '1.5 reps', 'Isometric hold', 'Explosive'] },
  { label: 'Equipment', tags: ['Barbell', 'Dumbbell', 'Kettlebell', 'Cable', 'Band', 'Machine', 'Smith machine', 'Bodyweight'] },
]

/** Split a stored variation string into its tags. */
export function variationTags(variation?: string): string[] {
  return (variation ?? '').split(',').map((t) => t.trim()).filter(Boolean)
}

/** Join tags back into the stored form. */
export function joinVariation(tags: string[]): string | undefined {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean)
  return cleaned.length ? cleaned.join(', ') : undefined
}

/** Canonical form for comparing variants: lowercased tags in a stable order. Plain lift is the empty string. */
export function normalizeVariation(variation?: string): string {
  return variationTags(variation).map((t) => t.toLowerCase()).sort().join(', ')
}
