import { NavLink } from 'react-router-dom'

const icons = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>,
  workout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10v4M21 10v4M6 8v8M18 8v8M6 12h12" /></svg>,
  food: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10" /></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  trends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
}

const tabs = [
  { to: '/', label: 'Today', icon: icons.today },
  { to: '/workout', label: 'Workout', icon: icons.workout },
  { to: '/food', label: 'Food', icon: icons.food },
  { to: '/history', label: 'History', icon: icons.history },
  { to: '/trends', label: 'Trends', icon: icons.trends },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' tab-on' : '')}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
