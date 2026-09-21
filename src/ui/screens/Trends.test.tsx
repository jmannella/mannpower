import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { saveDay, saveMeal, savePain, saveSettings, saveWorkout } from '../../data/repo'
import Trends from './Trends'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await saveWorkout({ id: 'a', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '', entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }] })
  await saveDay({ date: '2026-09-01', bodyWeight: 250, steps: 9000, cardio: [{ id: 'c', type: 'Desk treadmill', minutes: 30 }], updatedAt: '' })
  await savePain({ id: 'p', date: '2026-09-01', area: 'lower_back', severity: 3, limited: true, createdAt: '' })
})

describe('Trends', () => {
  test('renders every chart section and the range chips', async () => {
    render(<MemoryRouter><Trends /></MemoryRouter>)
    for (const title of ['Body weight', 'Weekly volume by muscle', 'Weekly sets by muscle', 'Strength', 'Steps and cardio', 'Trainer vs solo', 'Pain timeline']) {
      expect(await screen.findByText(title)).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('combobox', { name: 'Exercise' })).toHaveDisplayValue('Back Squat')
    expect(await screen.findByText('Lower back')).toBeInTheDocument()
  })

  test('shows the nutrition charts and stat row once meals exist', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal({ id: 'm', date: '2026-09-01', time: '12:00', description: 'Lunch', source: 'quick', items: [{ name: 'Lunch', kind: 'food', calories: 2100, protein: 150 }], createdAt: '', updatedAt: '' })
    render(<MemoryRouter><Trends /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Calories' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Protein' })).toBeInTheDocument()
    const targetStat = screen.getByText('Target kcal').closest('.big-number') as HTMLElement
    expect(within(targetStat).getByText('2200')).toBeInTheDocument()
  })

  test('hides the nutrition charts until a meal is logged', async () => {
    render(<MemoryRouter><Trends /></MemoryRouter>)
    expect(await screen.findByText('Body weight')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Calories' })).not.toBeInTheDocument()
  })
})
