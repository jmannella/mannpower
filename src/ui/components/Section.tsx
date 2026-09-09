import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-title"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  )
}
