import { render, screen } from '@testing-library/react'
import { ChartTip } from './ChartTip'

describe('ChartTip', () => {
  test('lists only series with a value, rounded, with the label', () => {
    render(<ChartTip active label="Sep 7" payload={[
      { name: 'Back', value: 2990.456, color: '#22d3ee', dataKey: 'back_vol' },
      { name: 'Biceps', value: 0, color: '#a78bfa', dataKey: 'biceps_vol' },
      { name: 'Quads', value: 39295, color: '#4ade80', dataKey: 'quads_vol' },
    ]} />)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 7')
    expect(screen.getByText('Back')).toBeInTheDocument()
    expect(screen.getByText('2990.46')).toBeInTheDocument()
    expect(screen.queryByText('Biceps')).toBeNull()
    expect(screen.getByText('Quads')).toBeInTheDocument()
  })

  test('renders nothing when inactive or when every value is zero', () => {
    const { container, rerender } = render(<ChartTip active={false} label="x" payload={[{ name: 'A', value: 5 }]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ChartTip active label="x" payload={[{ name: 'A', value: 0 }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
