import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the wordmark and the five tabs', () => {
  render(<App />)
  expect(screen.getByText('Mannpower')).toBeInTheDocument()
  for (const label of ['Today', 'Workout', 'Food', 'History', 'Trends']) {
    expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
  }
})
