import type { BodyArea } from '../domain/types'

export const BODY_AREAS: { id: BodyArea; label: string }[] = [
  { id: 'neck', label: 'Neck' },
  { id: 'shoulder_left', label: 'Left shoulder' },
  { id: 'shoulder_right', label: 'Right shoulder' },
  { id: 'elbow_left', label: 'Left elbow' },
  { id: 'elbow_right', label: 'Right elbow' },
  { id: 'wrist_left', label: 'Left wrist' },
  { id: 'wrist_right', label: 'Right wrist' },
  { id: 'upper_back', label: 'Upper back' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'hip_left', label: 'Left hip' },
  { id: 'hip_right', label: 'Right hip' },
  { id: 'knee_left', label: 'Left knee' },
  { id: 'knee_right', label: 'Right knee' },
  { id: 'ankle_left', label: 'Left ankle' },
  { id: 'ankle_right', label: 'Right ankle' },
  { id: 'other', label: 'Other' },
]

export function bodyAreaLabel(area: BodyArea): string {
  return BODY_AREAS.find((a) => a.id === area)?.label ?? area
}
