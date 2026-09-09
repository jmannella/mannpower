import { useMemo, useState } from 'react'
import { Bar, BarChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { useDays, useExercises, usePain, useSettings, useWorkouts } from '../hooks'
import { MUSCLE_GROUPS, MUSCLE_LABELS, type BodyArea } from '../../domain/types'
import { addDays, daysBetween, formatWeekLabel, todayISO, weekStart } from '../../domain/dates'
import { bodyWeightAvg7, bodyWeightSeries, relativeStrength } from '../../stats/bodyweight'
import { exerciseMap } from '../../stats/sets'
import { weeklyMuscleSeries, MIN_WEEKLY_SETS } from '../../stats/muscle'
import { weeklyActivitySeries } from '../../stats/activity'
import { exerciseHistory } from '../../stats/prs'
import { trainerSplit } from '../../stats/trainer'
import { bodyAreaLabel } from '../../library/bodyAreas'

type Range = '4w' | '12w' | 'all'
const GROUP_COLORS: Record<string, string> = {
  chest: '#ff5a1f', back: '#22d3ee', shoulders: '#fbbf24', biceps: '#a78bfa', triceps: '#f472b6',
  quads: '#4ade80', hamstrings: '#34d399', glutes: '#fb923c', calves: '#60a5fa', core: '#9a9aa6',
}
const tooltipStyle = { background: '#1b1b21', border: '1px solid #2e2e38' }
const initialDimension = { width: 360, height: 200 }

export default function Trends() {
  const workouts = useWorkouts()
  const days = useDays()
  const pain = usePain()
  const exercises = useExercises()
  const settings = useSettings()
  const [range, setRange] = useState<Range>('12w')
  const exMap = useMemo(() => exerciseMap(exercises), [exercises])

  const today = todayISO()
  const earliest = [...workouts.map((w) => w.date), ...days.map((d) => d.date), ...pain.map((p) => p.date)].sort()[0] ?? today
  const from = range === '4w' ? addDays(today, -27) : range === '12w' ? addDays(today, -83) : earliest
  const fromWeek = weekStart(from)
  const toWeek = weekStart(today)

  const weight = bodyWeightSeries(days, from, today).map((r) => ({ ...r, label: r.date.slice(5) }))
  const muscle = weeklyMuscleSeries(workouts, exMap, fromWeek, toWeek).map(({ week, load }) => ({
    week: formatWeekLabel(week),
    ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [`${g}_sets`, Math.round(load[g].sets * 10) / 10])),
    ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [`${g}_vol`, Math.round(load[g].volume)])),
  }))
  const activity = weeklyActivitySeries(days, fromWeek, toWeek, settings?.dailyStepGoal)
  const cardioTypes = Array.from(new Set(activity.flatMap((a) => Object.keys(a.cardio.byType))))
  const activityRows = activity.map((a) => ({
    week: formatWeekLabel(a.week), steps: a.steps.total,
    ...Object.fromEntries(cardioTypes.map((t) => [t, a.cardio.byType[t]?.minutes ?? 0])),
  }))
  const trainerRows = useMemo(() => {
    const rows: { week: string; trainer: number; solo: number }[] = []
    for (let w = fromWeek; w <= toWeek; w = addDays(w, 7)) {
      const s = trainerSplit(workouts, w, addDays(w, 6))
      rows.push({ week: formatWeekLabel(w), trainer: s.trainerCount, solo: s.soloCount })
    }
    return rows
  }, [workouts, fromWeek, toWeek])
  const split = trainerSplit(workouts, from, today)

  const logged = exercises.filter((e) => workouts.some((w) => w.entries.some((en) => en.exerciseId === e.id)))
  const [exerciseId, setExerciseId] = useState<string>('')
  const chosen = exerciseId || logged[0]?.id || ''
  const strength = exerciseHistory(workouts, chosen).filter((s) => s.date >= from).map((s) => ({
    label: s.date.slice(5), e1rm: Math.round(s.bestE1rm),
    rel: relativeStrength(s.bestE1rm, bodyWeightAvg7(days, s.date)),
  }))

  const painAreas = Array.from(new Set(pain.filter((p) => p.date >= from).map((p) => p.area))) as BodyArea[]
  const span = Math.max(1, daysBetween(from, today))

  return (
    <div className="screen">
      <Header title="Trends" />
      <div className="chips">
        <Chip on={range === '4w'} onClick={() => setRange('4w')}>4 weeks</Chip>
        <Chip on={range === '12w'} onClick={() => setRange('12w')}>12 weeks</Chip>
        <Chip on={range === 'all'} onClick={() => setRange('all')}>All</Chip>
      </div>

      <Section title="Body weight">
        <div className="card" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <LineChart data={weight} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} />
              {settings?.targetBodyWeight && <ReferenceLine y={settings.targetBodyWeight} stroke="#4ade80" strokeDasharray="4 4" label={{ value: 'target', fill: '#4ade80', fontSize: 11 }} />}
              <Line dataKey="weight" stroke="#22d3ee" strokeWidth={0} dot={{ r: 3, fill: '#22d3ee' }} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="avg7" stroke="#ff5a1f" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Weekly volume by muscle">
        <div className="card" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <BarChart data={muscle} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {MUSCLE_GROUPS.map((g) => <Bar key={g} dataKey={`${g}_vol`} name={MUSCLE_LABELS[g]} stackId="v" fill={GROUP_COLORS[g]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Weekly sets by muscle">
        <div className="card" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <BarChart data={muscle} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={MIN_WEEKLY_SETS} stroke="#fbbf24" strokeDasharray="4 4" />
              {MUSCLE_GROUPS.map((g) => <Bar key={g} dataKey={`${g}_sets`} name={MUSCLE_LABELS[g]} stackId="s" fill={GROUP_COLORS[g]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">Dashed line: 10 sets per group per week, the floor for muscle growth.</div>
      </Section>

      <Section title="Strength" right={
        <select className="input" style={{ width: 'auto' }} aria-label="Exercise" value={chosen} onChange={(e) => setExerciseId(e.target.value)}>
          {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      }>
        <div className="card" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <LineChart data={strength} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" domain={['auto', 'auto']} />
              <YAxis yAxisId="r" orientation="right" domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line yAxisId="l" dataKey="e1rm" name="e1RM (lb)" stroke="#ff5a1f" strokeWidth={3} isAnimationActive={false} />
              <Line yAxisId="r" dataKey="rel" name="per lb body weight" stroke="#22d3ee" strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">Orange is estimated 1RM. Cyan is that number divided by your body weight, the one that should keep rising as you lose weight.</div>
      </Section>

      <Section title="Steps and cardio">
        <div className="card" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <BarChart data={activityRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              {settings?.dailyStepGoal && <ReferenceLine y={settings.dailyStepGoal * 7} stroke="#4ade80" strokeDasharray="4 4" />}
              <Bar dataKey="steps" name="Steps" fill="#22d3ee" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <BarChart data={activityRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {cardioTypes.map((t, i) => <Bar key={t} dataKey={t} stackId="c" fill={i === 0 ? '#ff5a1f' : Object.values(GROUP_COLORS)[i % 10]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Trainer vs solo">
        <div className="card" style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
            <BarChart data={trainerRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="trainer" name="Trainer" fill="#22d3ee" isAnimationActive={false} />
              <Bar dataKey="solo" name="Solo" fill="#9a9aa6" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">
          Average per session: trainer {split.trainerMeanVolume ? Math.round(split.trainerMeanVolume) : '–'} lb over {split.trainerMeanSets?.toFixed(1) ?? '–'} sets, solo {split.soloMeanVolume ? Math.round(split.soloMeanVolume) : '–'} lb over {split.soloMeanSets?.toFixed(1) ?? '–'} sets.
        </div>
      </Section>

      <Section title="Pain timeline">
        {painAreas.length === 0 && <div className="muted">No pain logged in this range.</div>}
        <div className="stack">
          {painAreas.map((area) => (
            <div key={area} className="card" style={{ padding: '8px 14px' }}>
              <div className="row-between"><strong>{bodyAreaLabel(area)}</strong><span className="muted">{pain.filter((p) => p.area === area && p.date >= from).length} entries</span></div>
              <div style={{ position: 'relative', height: 24 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 11, height: 2, background: 'var(--border)' }} />
                {pain.filter((p) => p.area === area && p.date >= from).map((p) => (
                  <span key={p.id} title={`${p.date} severity ${p.severity}`} style={{
                    position: 'absolute', top: 12 - p.severity * 2 - 2, left: `${(daysBetween(from, p.date) / span) * 100}%`,
                    width: p.severity * 4 + 4, height: p.severity * 4 + 4, marginLeft: -(p.severity * 2 + 2), borderRadius: '50%',
                    background: p.limited ? 'var(--red)' : 'var(--accent)',
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="muted">Bigger dots are worse. Red dots limited the workout.</div>
      </Section>
    </div>
  )
}
