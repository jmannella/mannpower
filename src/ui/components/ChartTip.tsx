interface TipItem {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

interface Props {
  active?: boolean
  label?: string | number
  payload?: TipItem[]
}

/** Solid, high-contrast chart tooltip that lists only the series with a value. */
export function ChartTip({ active, label, payload }: Props) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => typeof p.value === 'number' ? p.value !== 0 : Boolean(p.value))
  if (rows.length === 0) return null
  return (
    <div className="chart-tip" role="tooltip">
      <div className="chart-tip-title">{label}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="chart-tip-row">
          <span className="chart-tip-dot" style={{ background: p.color }} aria-hidden="true" />
          <span className="chart-tip-name">{p.name}</span>
          <span className="chart-tip-value">{typeof p.value === 'number' ? Math.round(p.value * 100) / 100 : p.value}</span>
        </div>
      ))}
    </div>
  )
}
