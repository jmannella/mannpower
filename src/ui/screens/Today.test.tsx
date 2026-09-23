import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getDay, listPain, saveDay, saveMeal, saveSettings } from '../../data/repo'
import { todayISO } from '../../domain/dates'
import Today from './Today'
import { vi } from 'vitest'

vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderToday() {
  return render(<HashRouter><Today /></HashRouter>)
}

describe('Today', () => {
  test('saves body weight and steps for today', async () => {
    renderToday()
    const weight = await screen.findByLabelText('Body weight', {}, { timeout: 3000 })
    await userEvent.type(weight, '241.5')
    await userEvent.tab()
    const steps = screen.getByLabelText('Steps')
    await userEvent.type(steps, '8200')
    await userEvent.tab()
    await waitFor(async () => {
      const d = await getDay(todayISO())
      expect(d?.bodyWeight).toBe(241.5)
      expect(d?.steps).toBe(8200)
    })
  })

  test('desk treadmill quick add creates a second session on a second add', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    await userEvent.type(screen.getByLabelText('Minutes'), '20')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    await userEvent.type(screen.getByLabelText('Minutes'), '15')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => {
      const d = await getDay(todayISO())
      expect(d?.cardio.map((c) => c.minutes)).toEqual([20, 15])
    })
    expect(await screen.findByText(/35 min/)).toBeInTheDocument()
  })

  test('log pain saves an entry for the day', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: /log pain/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Lower back' }))
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const pain = await listPain()
      expect(pain).toHaveLength(1)
      expect(pain[0].area).toBe('lower_back')
      expect(pain[0].date).toBe(todayISO())
    })
  })

  test('desk treadmill chip always reopens with Desk treadmill selected', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bike' }))
    await userEvent.type(screen.getByLabelText('Minutes'), '10')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    expect(screen.getByRole('button', { name: 'Desk treadmill' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bike' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('food card shows what is left and opens the meal sheet', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal({ id: 'm', date: todayISO(), time: '08:00', description: 'Breakfast', source: 'quick', items: [{ name: 'Breakfast', kind: 'food', calories: 400, protein: 30 }], createdAt: '', updatedAt: '' })
    renderToday()
    expect(await screen.findByText('1800')).toBeInTheDocument()
    expect(screen.getByText('kcal left')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    expect(screen.getByRole('dialog', { name: 'Add meal' })).toBeInTheDocument()
  })

  test('collapses the check in card after stepping the date, even if left open on the old date', async () => {
    await saveDay({ date: '2026-09-20', cardio: [], updatedAt: '', sleepScore: 81, sleepHours: 7.2, readiness: 74, restingHr: 52 })
    await saveDay({ date: '2026-09-21', cardio: [], updatedAt: '', sleepScore: 80, sleepHours: 7, readiness: 70, restingHr: 50 })
    renderToday()
    const dateInput = await screen.findByLabelText('Date')
    fireEvent.change(dateInput, { target: { value: '2026-09-20' } })
    await userEvent.click(await screen.findByRole('button', { name: /check in/i }))
    expect(await screen.findByLabelText('Sleep score')).toHaveValue('81')

    fireEvent.change(dateInput, { target: { value: '2026-09-21' } })
    await waitFor(() => {
      expect(screen.queryByLabelText('Sleep score')).toBeNull()
    })
  })

  test('adds a glass of water', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a glass of water' }))
    expect(await screen.findByText('1 of 8')).toBeInTheDocument()
  })

  test('will not go below zero glasses', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove a glass of water' }))
    expect(await screen.findByText('0 of 8')).toBeInTheDocument()
  })
})
