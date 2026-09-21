import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/theme.css'
import { TabBar } from './ui/components/TabBar'
import { todayISO } from './domain/dates'
import Today from './ui/screens/Today'
import Workout from './ui/screens/Workout'
import Food from './ui/screens/Food'
import History from './ui/screens/History'
import ExerciseHistory from './ui/screens/ExerciseHistory'
import Trends from './ui/screens/Trends'
import Settings from './ui/screens/Settings'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout" element={<Navigate to={`/workout/${todayISO()}`} replace />} />
          <Route path="/workout/:date" element={<Workout />} />
          <Route path="/food" element={<Food />} />
          <Route path="/history" element={<History />} />
          <Route path="/exercise/:id" element={<ExerciseHistory />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
  )
}
