import type { ReactNode } from 'react'

export function Chip({ on, onClick, children, className, ariaLabel }: { on?: boolean; onClick: () => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'chip-on' : ''} ${className ?? ''}`} aria-label={ariaLabel} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}
