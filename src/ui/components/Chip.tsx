import type { ReactNode } from 'react'

export function Chip({ on, onClick, children, className }: { on?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'chip-on' : ''} ${className ?? ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}
