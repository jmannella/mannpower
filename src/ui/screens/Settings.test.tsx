import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getSettings, saveExercise } from '../../data/repo'
import { exportDataset } from '../../data/snapshot'
import { estimateMeal } from '../../nutrition/estimate'
import Settings from './Settings'

vi.mock('../../sync/runSync', () => ({ runSync: vi.fn(async () => 'none') }))
vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))

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

  test('saves height, sex and target overrides', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Height'), '70')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Male' }))
    await userEvent.type(screen.getByLabelText('Calorie target override'), '2200')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Protein target override'), '180')
    await userEvent.tab()
    await waitFor(async () => {
      expect(await getSettings()).toMatchObject({ heightInches: 70, sex: 'male', calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    })
    expect(await screen.findByText(/Target 2200 kcal and 180 g protein/)).toBeInTheDocument()
  })

  test('rejects an impossible height', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Height'), '700')
    await userEvent.tab()
    expect(await screen.findByText(/Height should be in inches/)).toBeInTheDocument()
    expect((await getSettings()).heightInches).toBeUndefined()
  })

  test('saves the AI key and model on the phone only, and tests the key', async () => {
    vi.mocked(estimateMeal).mockResolvedValueOnce({ ok: true, confidence: 'high', items: [{ name: 'Banana', kind: 'food', calories: 105, protein: 1 }] })
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Anthropic API key'), 'sk-test-key')
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-haiku-4-5')
    await userEvent.click(screen.getByRole('button', { name: 'Save AI settings' }))
    await waitFor(async () => expect(await getSettings()).toMatchObject({ anthropicKey: 'sk-test-key', aiModel: 'claude-haiku-4-5' }))
    expect(JSON.stringify(await exportDataset())).not.toContain('sk-test-key')
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }))
    // The message is a status toast pinned to the viewport, so it is seen no matter how far down the page the button sits.
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('The key works.')
    expect(toast.className).toContain('toast')
    vi.mocked(estimateMeal).mockResolvedValueOnce({ ok: false, reason: 'auth', message: 'Claude rejected the API key. Check it in Settings.' })
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText(/rejected the API key/)).toBeInTheDocument()
  })
})
