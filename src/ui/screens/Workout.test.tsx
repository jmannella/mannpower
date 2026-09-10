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

  test('add set click after a reps blur does not clobber the just-committed reps', async () => {
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
    // No userEvent.tab() here: the "Add set" click below is what blurs the reps input.
    await userEvent.click(screen.getByRole('button', { name: 'Add set' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries[0].sets).toEqual([
        { weight: 185, reps: 5, warmup: false },
        { weight: 185, reps: 5, warmup: false },
      ])
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
    expect(await screen.findByText(/Back Squat.*e1RM/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('History page')).toBeInTheDocument()
  })

  test('trainer toggle updates the workout', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'plank')
    await userEvent.click(await screen.findByRole('button', { name: 'Plank' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Solo' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.withTrainer).toBe(false)
      expect(w?.entries.map((e) => e.exerciseId)).toEqual(['plank'])
    })
  })

  test('custom exercise is created from the search box', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'Tire Flip')
    await userEvent.click(await screen.findByRole('button', { name: /Add "Tire Flip"/ }))
    // "Quads" appears in both the main and the also-works rows until a main muscle is picked; the first is the main row.
    await userEvent.click((await screen.findAllByRole('button', { name: 'Quads' }))[0])
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries).toHaveLength(1)
      expect((await db.exercises.toArray())[0].name).toBe('Tire Flip')
    })
  })
})

describe('Workout: swap, superset, stars', () => {
  test('changing the exercise on a card keeps its sets', async () => {
    await saveWorkout({
      id: 'cur', date: '2026-09-08', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e1', exerciseId: 'deadlift', sets: [{ weight: 185, reps: 5, warmup: false }] }],
    })
    renderWorkout()
    await userEvent.click(await screen.findByRole('button', { name: 'Change Deadlift' }))
    await userEvent.type(await screen.findByLabelText('Search replacement'), 'trap bar')
    await userEvent.click(await screen.findByRole('button', { name: 'Trap Bar Deadlift' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries[0].exerciseId).toBe('trap-bar-deadlift')
      expect(w?.entries[0].sets).toEqual([{ weight: 185, reps: 5, warmup: false }])
    })
    expect(await screen.findByRole('heading', { name: 'Trap Bar Deadlift' })).toBeInTheDocument()
  })

  test('superset toggle links a card to the next and shows the group label', async () => {
    await saveWorkout({
      id: 'cur', date: '2026-09-08', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [
        { id: 'e1', exerciseId: 'back-squat', sets: [] },
        { id: 'e2', exerciseId: 'plank', sets: [] },
      ],
    })
    renderWorkout()
    await userEvent.click(await screen.findByRole('button', { name: 'Superset Back Squat with next' }))
    await waitFor(async () => {
      expect((await getWorkoutByDate('2026-09-08'))?.entries[0].supersetWithNext).toBe(true)
    })
    expect(await screen.findByText('Superset')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Unlink Back Squat superset' }))
    await waitFor(async () => {
      expect((await getWorkoutByDate('2026-09-08'))?.entries[0].supersetWithNext).toBe(false)
    })
  })

  test('a PR shows a gold star on the card', async () => {
    await saveWorkout({
      id: 'prev', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e', exerciseId: 'back-squat', sets: [{ weight: 175, reps: 5, warmup: false }] }],
    })
    await saveWorkout({
      id: 'cur', date: '2026-09-08', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e2', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }],
    })
    renderWorkout()
    expect((await screen.findAllByLabelText('Personal record')).length).toBeGreaterThanOrEqual(1)
  })
})
