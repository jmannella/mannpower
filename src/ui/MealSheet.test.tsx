import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { listSavedMeals, mealsForDate, saveMeal, saveSavedMeal } from '../data/repo'
import { estimateMeal } from '../nutrition/estimate'
import { MealSheet } from './MealSheet'

vi.mock('../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))
const mockEstimate = vi.mocked(estimateMeal)
const DATE = '2026-09-21'

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
  mockEstimate.mockReset()
})

describe('MealSheet', () => {
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
    expect(screen.getByText(/1200 kcal/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'cheeseburger', source: 'ai', confidence: 'medium' })
      expect(m.items[0]).toMatchObject({ calories: 1200, protein: 60, fat: 64 })
      expect(m.needsEstimate).toBeUndefined()
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

  test('editing opens the confirm view, keeps the id and can also keep a saved meal', async () => {
    const meal = { id: 'm1', date: DATE, time: '12:15', description: 'Lunch', source: 'quick' as const, items: [{ name: 'Lunch', kind: 'food' as const, calories: 700, protein: 40 }], createdAt: '2026-09-21T16:15:00.000Z', updatedAt: '' }
    await saveMeal(meal)
    render(<MealSheet date={DATE} editing={meal} onClose={() => {}} />)
    const cal = screen.getByLabelText('Item 1 calories')
    await userEvent.clear(cal)
    await userEvent.type(cal, '800')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also keep as a saved meal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const meals = await mealsForDate(DATE)
      expect(meals).toHaveLength(1)
      expect(meals[0]).toMatchObject({ id: 'm1', time: '12:15' })
      expect(meals[0].items[0].calories).toBe(800)
      const saved = await listSavedMeals()
      expect(saved).toHaveLength(1)
      expect(meals[0].savedMealId).toBe(saved[0].id)
    })
  })

  test('a meal waiting for an estimate reopens in Describe with its text', async () => {
    const pending = { id: 'p1', date: DATE, time: '13:00', description: 'club sandwich', source: 'ai' as const, items: [], needsEstimate: true, createdAt: '', updatedAt: '' }
    render(<MealSheet date={DATE} editing={pending} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich')
  })
})
