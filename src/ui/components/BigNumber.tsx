export function BigNumber({ value, unit, label, tone }: { value: string | number; unit?: string; label: string; tone?: 'accent' | 'cyan' }) {
  return (
    <div className={`big-number ${tone ? `big-number-${tone}` : ''}`}>
      <div className="big-number-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="big-number-label">{label}</div>
    </div>
  )
}
