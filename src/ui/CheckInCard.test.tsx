import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckInCard } from './CheckInCard'
import type { DayRecord, Supplement } from '../domain/types'

const day = (patch: Partial<DayRecord> = {}): DayRecord => ({ date: '2026-09-23', cardio: [], updatedAt: '', ...patch })
const supps: Supplement[] = [{ id: 'im8', name: 'IM8 Daily Essentials', active: true }]

describe('CheckInCard', () => {
  test('shows four empty fields when nothing is recorded', () => {
    render(<CheckInCard date="2026-09-23" day={day()} days={[day()]} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.getByLabelText('Sleep score')).toHaveValue('')
    expect(screen.getByLabelText('Sleep hours')).toHaveValue('')
    expect(screen.getByLabelText('Readiness')).toHaveValue('')
    expect(screen.getByLabelText('Resting heart rate')).toHaveValue('')
  })

  test('commits a typed sleep score', async () => {
    const onPatch = vi.fn()
    render(<CheckInCard date="2026-09-23" day={day()} days={[day()]} supplements={supps} onPatch={onPatch} onToggleSupplement={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Sleep score'), '81')
    await userEvent.tab()
    expect(onPatch).toHaveBeenCalledWith({ sleepScore: 81 })
  })

  test('collapses to a summary once the four numbers are in', () => {
    const filled = day({ sleepScore: 81, sleepHours: 7.2, readiness: 74, restingHr: 52 })
    render(<CheckInCard date="2026-09-23" day={filled} days={[filled]} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.queryByLabelText('Sleep score')).toBeNull()
    expect(screen.getByText(/Sleep 81/)).toBeInTheDocument()
    expect(screen.getByText(/7.2 h/)).toBeInTheDocument()
    expect(screen.getByText(/RHR 52/)).toBeInTheDocument()
  })

  test('reopens when the summary is tapped', async () => {
    const filled = day({ sleepScore: 81, sleepHours: 7.2, readiness: 74, restingHr: 52 })
    render(<CheckInCard date="2026-09-23" day={filled} days={[filled]} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /check in/i }))
    expect(screen.getByLabelText('Sleep score')).toHaveValue('81')
  })

  test('asks for a waist measurement when the last one is seven days old', () => {
    const days = [day({ date: '2026-09-16', waist: 38 })]
    render(<CheckInCard date="2026-09-23" day={day()} days={days} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.getByLabelText('Waist (around the navel)')).toBeInTheDocument()
  })

  test('hides the waist row when one was taken this week', () => {
    const days = [day({ date: '2026-09-20', waist: 38 })]
    render(<CheckInCard date="2026-09-23" day={day()} days={days} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.queryByLabelText('Waist (around the navel)')).toBeNull()
  })

  test('uses the viewed date for the waist rule, not today', () => {
    const days = [day({ date: '2026-09-01', waist: 38 }), day({ date: '2026-09-22', waist: 37.5 })]
    render(<CheckInCard date="2026-09-05" day={day({ date: '2026-09-05' })} days={days} supplements={supps} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.queryByLabelText('Waist (around the navel)')).toBeNull()
  })

  test('ticks a supplement', async () => {
    const onToggle = vi.fn()
    render(<CheckInCard date="2026-09-23" day={day()} days={[day()]} supplements={supps} onPatch={vi.fn()} onToggleSupplement={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'IM8 Daily Essentials' }))
    expect(onToggle).toHaveBeenCalledWith('im8')
  })

  test('shows a ticked supplement as pressed and leaves inactive ones out', () => {
    const list: Supplement[] = [...supps, { id: 'old', name: 'Retired', active: false }]
    render(<CheckInCard date="2026-09-23" day={day({ supplementsTaken: ['im8'] })} days={[day()]} supplements={list} onPatch={vi.fn()} onToggleSupplement={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'IM8 Daily Essentials' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Retired' })).toBeNull()
  })
})
