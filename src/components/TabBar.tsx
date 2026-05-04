// src/components/TabBar.tsx
export type Tab = 'home' | 'add' | 'history'

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
        <span aria-hidden="true">🏠</span>
        <span>Home</span>
      </button>
      <button
        type="button"
        aria-label="Add entry"
        aria-pressed={active === 'add'}
        className={active === 'add' ? 'active' : ''}
        onClick={() => onChange('add')}
      >
        <span aria-hidden="true">➕</span>
        <span>Add</span>
      </button>
      <button
        type="button"
        aria-label="History"
        aria-pressed={active === 'history'}
        className={active === 'history' ? 'active' : ''}
        onClick={() => onChange('history')}
      >
        <span aria-hidden="true">📊</span>
        <span>History</span>
      </button>
    </nav>
  )
}
