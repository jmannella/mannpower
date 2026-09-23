import { useEffect, useRef, useState } from 'react'

interface Props {
  label?: string
  ariaLabel?: string
  value?: number
  onCommit: (value?: number) => void
  placeholder?: string
  suffix?: string
  step?: number
  allowDecimal?: boolean
  autoFocus?: boolean
  big?: boolean
  className?: string
}

/** Numeric input that commits on blur or Enter. Blank clears. Invalid or negative input restores the previous value. */
export function NumberField({ label, ariaLabel, value, onCommit, placeholder, suffix, step, allowDecimal = true, autoFocus, big, className }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  // The initial text above already reflects the mount time value, so the very first run of this
  // effect has nothing to do. Skipping it matters: React defers passive effects, and under load
  // that first run can land after the user has already started typing, silently wiping their
  // keystrokes back to the old value. Only a real change to value after mount should resync text.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    setText(value === undefined ? '' : String(value))
  }, [value])

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      if (value !== undefined) onCommit(undefined)
      return
    }
    const n = Number(trimmed)
    const valid = Number.isFinite(n) && n >= 0 && (allowDecimal || Number.isInteger(n))
    if (!valid) {
      setText(value === undefined ? '' : String(value))
      return
    }
    if (n !== value) onCommit(n)
  }

  const input = (
    <input
      className={`input ${big ? 'input-big' : ''} ${className ?? ''}`}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      type="text"
      value={text}
      placeholder={placeholder}
      step={step}
      autoFocus={autoFocus}
      aria-label={ariaLabel ?? label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {suffix ? <div className="input-suffix">{input}<span>{suffix}</span></div> : input}
    </label>
  )
}
