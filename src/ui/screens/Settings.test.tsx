import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getSettings, saveExercise } from '../../data/repo'
import Settings from './Settings'

vi.mock('../../sync/runSync', () => ({ runSync: vi.fn(async () => 'none') }))

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Settings', () => {
  test('saves token, repo, goals and default mode', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('GitHub token'), 'ghp_test')
    await userEvent.click(screen.getByRole('button', { name: 'Save sync settings' }))
    await userEvent.type(screen.getByLabelText('Target body weight'), '220')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Daily step goal'), '10000')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Solo' }))
    await waitFor(async () => {
      const s = await getSettings()
      expect(s.githubToken).toBe('ghp_test')
      expect(s.dataRepo).toBe('jmannella/mannpower-data')
      expect(s.targetBodyWeight).toBe(220)
      expect(s.dailyStepGoal).toBe(10000)
      expect(s.defaultWithTrainer).toBe(false)
    })
  })

  test('lists custom exercises and shows status', async () => {
    await saveExercise({ id: 'custom-1', name: 'Sled Push', primary: 'quads', secondary: [], custom: true })
    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(await screen.findByText('Sled Push')).toBeInTheDocument()
    expect(screen.getByText(/Not set up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument()
  })
})
