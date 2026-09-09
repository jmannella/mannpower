import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../../data/db'
import { getWorkoutByDate, saveWorkout } from '../../data/repo'
import Workout from './Workout'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderWorkout(date = '2026-09-08') {
  return render(
    <MemoryRouter initialEntries={[`/workout/${date}`]}>
      <Routes>
        <Route path="/workout/:date" element={<Workout />} />
        <Route path="/history" element={<div>History page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Workout', () => {
  test('search, add an exercise, log a set, see it saved', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'back squ')
    await userEvent.click(await screen.findByRole('button', { name: 'Back Squat' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add set' }))
    const weightInput = await screen.findByLabelText('Set 1 weight')
    await userEvent.clear(weightInput)
    await userEvent.type(weightInput, '185')
    const repsInput = await screen.findByLabelText('Set 1 reps')
    await userEvent.clear(repsInput)
    await userEvent.type(repsInput, '5')
    await userEvent.tab()
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries[0].exerciseId).toBe('back-squat')
      expect(w?.entries[0].sets).toEqual([{ weight: 185, reps: 5, warmup: false }])
    })
  })

  test('shows last time and flags a PR, then finish shows the summary', async () => {
    await saveWorkout({
      id: 'prev', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e', exerciseId: 'back-squat', sets: [{ weight: 175, reps: 5, warmup: false }] }],
    })
    await saveWorkout({
      id: 'cur', date: '2026-09-08', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e2', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }],
    })
    renderWorkout()
    expect(await screen.findByText(/Last time: 175 x 5/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('925')).toBeInTheDocument() // total volume
    expect(screen.getByText(/Back Squat.*e1RM/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('History page')).toBeInTheDocument()
  })

  test('trainer toggle updates the workout', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'plank')
    await userEvent.click(await screen.findByRole('button', { name: 'Plank' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Solo' }))
    await waitFor(async () => {
      expect((await getWorkoutByDate('2026-09-08'))?.withTrainer).toBe(false)
    })
  })

  test('custom exercise is created from the search box', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'Sled Push')
    await userEvent.click(await screen.findByRole('button', { name: /Add "Sled Push"/ }))
    // "Quads" appears in both the main and the also-works rows until a main muscle is picked; the first is the main row.
    await userEvent.click((await screen.findAllByRole('button', { name: 'Quads' }))[0])
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries).toHaveLength(1)
      expect((await db.exercises.toArray())[0].name).toBe('Sled Push')
    })
  })
})
