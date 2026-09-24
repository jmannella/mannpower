import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../test/resetDb'
import { listSavedMeals, mealsForDate, saveMeal, saveSavedMeal } from '../data/repo'
import { estimateMeal } from '../nutrition/estimate'
import { MealSheet } from './MealSheet'

vi.mock('../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))
const mockEstimate = vi.mocked(estimateMeal)
const DATE = '2026-09-21'

beforeEach(async () => {
  await resetDb()
  localStorage.clear()
  mockEstimate.mockReset()
})

describe('MealSheet', () => {
  test('quick add is disabled until a positive calories value is committed', async () => {
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    expect(screen.getByRole('button', { name: 'Save quick add' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Calories'), '650')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Save quick add' })).toBeEnabled()
  })

  test('quick add saves a one item meal and closes', async () => {
    const onClose = vi.fn()
    render(<MealSheet date={DATE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    await userEvent.type(screen.getByLabelText('Calories'), '650')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Protein'), '40')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Name'), 'Poutine')
    await userEvent.click(screen.getByRole('button', { name: 'Save quick add' }))
    await waitFor(async () => {
      const meals = await mealsForDate(DATE)
      expect(meals).toHaveLength(1)
      expect(meals[0]).toMatchObject({ description: 'Poutine', source: 'quick' })
      expect(meals[0].items[0]).toMatchObject({ name: 'Poutine', kind: 'food', calories: 650, protein: 40 })
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('describe, confirm with a double portion, save', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'medium', items: [{ name: 'Burger', amount: '1', kind: 'food', calories: 600, protein: 30, carbs: 40, fat: 32, fibre: 2 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'cheeseburger')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByDisplayValue('Burger')).toBeInTheDocument()
    expect(mockEstimate).toHaveBeenCalledWith({ text: 'cheeseburger', photo: undefined })
    await userEvent.click(screen.getByRole('button', { name: '2x' }))
    expect(screen.getByLabelText('Item 1 calories')).toHaveValue('1200')
    expect(screen.getByText(/1200 kcal/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'cheeseburger', source: 'ai', confidence: 'medium' })
      expect(m.items[0]).toMatchObject({ calories: 1200, protein: 60, fat: 64 })
      expect(m.needsEstimate).toBeUndefined()
    })
  })

  test('typing over a scaled row saves exactly what was typed, not scaled again', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'medium', items: [{ name: 'Burger', amount: '1', kind: 'food', calories: 600, protein: 30, carbs: 40, fat: 32, fibre: 2 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'cheeseburger')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await screen.findByDisplayValue('Burger')
    await userEvent.click(screen.getByRole('button', { name: '2x' }))
    const cal = screen.getByLabelText('Item 1 calories')
    await userEvent.clear(cal)
    await userEvent.type(cal, '900')
    await userEvent.tab()
    expect(screen.getByText(/900 kcal/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m.items[0].calories).toBe(900)
    })
  })

  test('a value typed at a fractional portion saves exactly, with no rounding drift', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'medium', items: [{ name: 'Burger', amount: '1', kind: 'food', calories: 600, protein: 30 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'cheeseburger')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await screen.findByDisplayValue('Burger')
    await userEvent.click(screen.getByRole('button', { name: '1.5x' }))
    const cal = screen.getByLabelText('Item 1 calories')
    await userEvent.clear(cal)
    await userEvent.type(cal, '800')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m.items[0].calories).toBe(800)
    })
  })

  test('adjusting a saved meal to a new portion does not scale the saved meal itself', async () => {
    await saveSavedMeal({
      id: 's1', name: 'Eggs and toast', useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z',
      items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28, carbs: 40, fat: 15, fibre: 3 }],
    })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust Eggs and toast' }))
    await userEvent.click(screen.getByRole('button', { name: '2x' }))
    expect(screen.getByLabelText('Item 1 calories')).toHaveValue('900')
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m.items[0]).toMatchObject({ calories: 900, protein: 56, carbs: 80, fat: 30, fibre: 6 })
      const [saved] = await listSavedMeals()
      expect(saved.items[0]).toMatchObject({ calories: 450, protein: 28, carbs: 40, fat: 15, fibre: 3 })
    })
  })

  test('a low confidence estimate shows the warning and its reason', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'low', note: 'Portion size unclear.', items: [{ name: 'Pasta', kind: 'food', calories: 700, protein: 25 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'some pasta')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByText(/Rough estimate/)).toBeInTheDocument()
    expect(screen.getByText(/Portion size unclear/)).toBeInTheDocument()
  })

  test('a failed estimate keeps the text and can be saved for later', async () => {
    mockEstimate.mockResolvedValue({ ok: false, reason: 'offline', message: 'You are offline.' })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByText('You are offline.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'club sandwich and fries', needsEstimate: true, items: [] })
    })
  })

  test('a failed estimate can fall through to quick add with the name filled in', async () => {
    mockEstimate.mockResolvedValue({ ok: false, reason: 'no_key', message: 'Add your Anthropic API key in Settings to use Describe.' })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'club sandwich')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enter numbers by hand' }))
    expect(screen.getByLabelText('Name')).toHaveValue('club sandwich')
  })

  test('a saved meal logs in one tap and its use count goes up', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const onClose = vi.fn()
    render(<MealSheet date={DATE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Log Eggs and toast' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'Eggs and toast', source: 'saved', savedMealId: 's1' })
      expect((await listSavedMeals())[0].useCount).toBe(2)
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('a saved meal can be removed after a confirm', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove saved meal Eggs and toast' }))
    await waitFor(async () => expect(await listSavedMeals()).toEqual([]))
    ask.mockRestore()
  })

  test('recent meals appear under Saved and the last mode is remembered', async () => {
    await saveMeal({ id: 'old', date: '2026-09-18', time: '12:00', description: 'Chicken wrap', source: 'ai', items: [{ name: 'Chicken wrap', kind: 'food', calories: 620, protein: 38 }], createdAt: '', updatedAt: '' })
    const first = render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Log Chicken wrap' }))
    await waitFor(async () => expect(await mealsForDate(DATE)).toHaveLength(1))
    first.unmount()
    render(<MealSheet date={DATE} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a logged meal linked to a saved meal under a different name stays out of Recent', async () => {
    await saveSavedMeal({ id: 's1', name: 'Big breakfast', items: [{ name: 'Two eggs, toast, coffee', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    await saveMeal({ id: 'old', date: '2026-09-18', time: '08:00', description: 'Two eggs, toast, coffee', source: 'quick', savedMealId: 's1', items: [{ name: 'Two eggs, toast, coffee', kind: 'food', calories: 450, protein: 28 }], createdAt: '', updatedAt: '' })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(await screen.findByRole('button', { name: 'Log Big breakfast' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log Two eggs, toast, coffee' })).not.toBeInTheDocument()
  })

  test('editing opens the confirm view, keeps the id and can also keep a saved meal', async () => {
    const meal = { id: 'm1', date: DATE, time: '12:15', description: 'Lunch', source: 'quick' as const, items: [{ name: 'Lunch', kind: 'food' as const, calories: 700, protein: 40 }], createdAt: '2026-09-21T16:15:00.000Z', updatedAt: '' }
    await saveMeal(meal)
    render(<MealSheet date={DATE} editing={meal} onClose={() => {}} />)
    const cal = screen.getByLabelText('Item 1 calories')
    await userEvent.clear(cal)
    await userEvent.type(cal, '800')
    await userEvent.tab()
    expect(screen.queryByRole('textbox', { name: 'Saved meal name' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also keep as a saved meal' }))
    const nameBox = screen.getByRole('textbox', { name: 'Saved meal name' })
    expect(nameBox).toHaveValue('Lunch')
    await userEvent.clear(nameBox)
    await userEvent.type(nameBox, 'Work lunch')
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const meals = await mealsForDate(DATE)
      expect(meals).toHaveLength(1)
      expect(meals[0]).toMatchObject({ id: 'm1', time: '12:15', description: 'Lunch' })
      expect(meals[0].items[0].calories).toBe(800)
      const saved = await listSavedMeals()
      expect(saved).toHaveLength(1)
      expect(saved[0].name).toBe('Work lunch')
      expect(meals[0].savedMealId).toBe(saved[0].id)
    })
  })

  test('a blank saved meal name falls back to the meal description', async () => {
    const meal = { id: 'm1', date: DATE, time: '12:15', description: 'Lunch', source: 'quick' as const, items: [{ name: 'Lunch', kind: 'food' as const, calories: 700, protein: 40 }], createdAt: '2026-09-21T16:15:00.000Z', updatedAt: '' }
    await saveMeal(meal)
    render(<MealSheet date={DATE} editing={meal} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also keep as a saved meal' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Saved meal name' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Lunch']))
  })

  test('a saved meal can be renamed from the Saved list', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const ask = vi.spyOn(window, 'prompt').mockReturnValue('Big breakfast')
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Eggs and toast' }))
    expect(ask).toHaveBeenCalledWith('Rename saved meal', 'Eggs and toast')
    await waitFor(async () => expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Big breakfast']))
    expect(await screen.findByRole('button', { name: 'Log Big breakfast' })).toBeInTheDocument()
    ask.mockRestore()
  })

  test('a meal saved for later after an offline estimate can be reopened, estimated and saved once', async () => {
    mockEstimate.mockResolvedValue({ ok: false, reason: 'offline', message: 'You are offline.' })
    const first = render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await screen.findByText('You are offline.')
    await userEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    let stored = await mealsForDate(DATE)
    expect(stored).toHaveLength(1)
    const pending = stored[0]
    expect(pending.needsEstimate).toBe(true)
    first.unmount()

    mockEstimate.mockResolvedValue({ ok: true, confidence: 'medium', items: [{ name: 'Club sandwich', kind: 'food', calories: 750, protein: 35 }] })
    render(<MealSheet date={DATE} editing={pending} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await screen.findByDisplayValue('Club sandwich')
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      stored = await mealsForDate(DATE)
      expect(stored).toHaveLength(1)
      expect(stored[0].id).toBe(pending.id)
      expect(stored[0].time).toBe(pending.time)
      expect(stored[0].items).toHaveLength(1)
      expect(stored[0].needsEstimate).toBeUndefined()
    })
  })

  test('a meal waiting for an estimate reopens in Describe with its text', async () => {
    const pending = { id: 'p1', date: DATE, time: '13:00', description: 'club sandwich', source: 'ai' as const, items: [], needsEstimate: true, createdAt: '', updatedAt: '' }
    render(<MealSheet date={DATE} editing={pending} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich')
  })
})
