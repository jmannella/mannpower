import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { listSavedMeals, mealsForDate, saveMeal, saveSettings } from '../../data/repo'
import { todayISO } from '../../domain/dates'
import type { MealEntry } from '../../domain/types'
import Food from './Food'

vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))

const today = todayISO()
const meal = (id: string, time: string, description: string, calories: number, protein: number, patch: Partial<MealEntry> = {}): MealEntry => ({
  id, date: today, time, description, source: 'quick', items: [{ name: description, kind: 'food', calories, protein }], createdAt: '', updatedAt: '', ...patch,
})
const renderFood = () => render(<MemoryRouter><Food /></MemoryRouter>)

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

describe('Food', () => {
  test('shows the day against the targets, meals in time order', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal(meal('b', '12:30', 'Lunch', 800, 50))
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    expect(await screen.findByText('Lunch')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Calories' })).toHaveAttribute('aria-valuenow', '1200')
    expect(screen.getByText(/1000/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Protein' })).toHaveAttribute('aria-valuenow', '80')
    const rows = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button', { name: /^Edit / }).getAttribute('aria-label'))
    expect(rows).toEqual(['Edit Breakfast', 'Edit Lunch'])
  })

  test('with no target yet it shows totals and points at Settings', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    expect(await screen.findByText('Breakfast')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Calories' })).not.toBeInTheDocument()
    const note = screen.getByText(/No calorie target yet/)
    expect(within(note).getByRole('link', { name: /Settings/ })).toBeInTheDocument()
  })

  test('delete and star, with the star asking for a name', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    const ask = vi.spyOn(window, 'prompt').mockReturnValue('Big breakfast')
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Save Breakfast as a saved meal' }))
    expect(ask).toHaveBeenCalledWith('Name this saved meal', 'Breakfast')
    await waitFor(async () => expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Big breakfast']))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Breakfast as a saved meal' })).not.toBeInTheDocument())
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }))
    await waitFor(async () => expect(await mealsForDate(today)).toEqual([]))
    ask.mockRestore()
  })

  test('a blank name on star keeps the description and cancel saves nothing', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    const ask = vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('   ')
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Save Breakfast as a saved meal' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(await listSavedMeals()).toEqual([])
    expect(screen.getByRole('button', { name: 'Save Breakfast as a saved meal' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save Breakfast as a saved meal' }))
    await waitFor(async () => expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Breakfast']))
    ask.mockRestore()
  })

  test('a meal waiting for an estimate is flagged and reopens in Describe', async () => {
    await saveMeal(meal('p', '13:00', 'club sandwich', 0, 0, { items: [], needsEstimate: true, source: 'ai' }))
    renderFood()
    expect(await screen.findByText(/Needs estimate/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Estimate club sandwich' }))
    expect(await screen.findByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich')
  })

  test('Add meal opens the sheet and tapping a meal opens it for editing', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    expect(screen.getByRole('dialog', { name: 'Add meal' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('presentation'))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Breakfast' }))
    expect(screen.getByRole('dialog', { name: 'Edit meal' })).toBeInTheDocument()
  })

  test('logs a beer with its calories', async () => {
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Log a beer' }))
    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('Beer')).toBeInTheDocument()
    expect(within(row).getByText(/150/)).toBeInTheDocument()
  })
})
