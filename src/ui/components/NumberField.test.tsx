import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberField } from './NumberField'

describe('NumberField', () => {
  test('commits a valid number on blur and restores on invalid', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Weight" value={240} onCommit={onCommit} />)
    const input = screen.getByLabelText('Weight') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '238.5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith(238.5)

    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('240')
  })

  test('blank commits undefined and integers only when allowDecimal is false', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Steps" value={5000} onCommit={onCommit} allowDecimal={false} />)
    const input = screen.getByLabelText('Steps') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith(undefined)
    await userEvent.type(input, '12.5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
