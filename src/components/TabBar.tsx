// src/components/TabBar.tsx
import { ChartColumn, CirclePlus, House, Spade } from 'lucide-react'

export type Tab = 'home' | 'add' | 'history' | 'poker'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <button
        type="button"
        aria-label="Home"
        aria-pressed={active === 'home'}
        className={active === 'home' ? 'active' : ''}
        onClick={() => onChange('home')}
      >
        <House className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Home</span>
      </button>
      <button
        type="button"
        aria-label="Add entry"
        aria-pressed={active === 'add'}
        className={active === 'add' ? 'active' : ''}
        onClick={() => onChange('add')}
      >
        <CirclePlus className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Add</span>
      </button>
      <button
        type="button"
        aria-label="History"
        aria-pressed={active === 'history'}
        className={active === 'history' ? 'active' : ''}
        onClick={() => onChange('history')}
      >
        <ChartColumn className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>History</span>
      </button>
      <button
        type="button"
        aria-label="Poker"
        aria-pressed={active === 'poker'}
        className={active === 'poker' ? 'active' : ''}
        onClick={() => onChange('poker')}
      >
        <Spade className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Poker</span>
      </button>
    </nav>
  )
}
