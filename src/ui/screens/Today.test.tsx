import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getDay, listPain } from '../../data/repo'
import { todayISO } from '../../domain/dates'
import Today from './Today'

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
})
