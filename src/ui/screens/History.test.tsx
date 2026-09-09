import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../../data/db'
import { savePain, saveWorkout } from '../../data/repo'
import History from './History'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await saveWorkout({ id: 'a', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '', entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }] })
  await saveWorkout({ id: 'b', date: '2026-09-03', withTrainer: false, createdAt: '', updatedAt: '', entries: [{ id: 'e2', exerciseId: 'back-squat', sets: [{ weight: 195, reps: 5, warmup: false }] }] })
  await savePain({ id: 'p', date: '2026-09-03', area: 'knee_left', severity: 2, limited: false, createdAt: '' })
})

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/workout/:date" element={<div>Workout page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('History', () => {
  test('lists newest first with pills and filters by mode', async () => {
    renderHistory()
    const items = await screen.findAllByRole('button', { name: /Sep/ })
    expect(items[0]).toHaveTextContent('Thu Sep 3')
    expect(items[0]).toHaveTextContent('Solo')
    expect(items[0]).toHaveTextContent('PR')
    await waitFor(() => expect(items[0]).toHaveTextContent('Pain'))
    expect(items[1]).toHaveTextContent('Trainer')
    await userEvent.click(screen.getByRole('button', { name: 'Trainer only' }))
    expect(screen.getAllByRole('button', { name: /Sep/ })).toHaveLength(1)
  })

  test('tapping a workout opens it', async () => {
    renderHistory()
    await userEvent.click((await screen.findAllByRole('button', { name: /Sep/ }))[0])
    expect(await screen.findByText('Workout page')).toBeInTheDocument()
  })
})
