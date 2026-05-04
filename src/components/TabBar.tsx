// src/components/TabBar.tsx
export type Tab = 'home' | 'add' | 'history'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar">
      <button className={active === 'home' ? 'active' : ''} onClick={() => onChange('home')}>
        <span>🏠</span>
        <span>Home</span>
      </button>
      <button className={active === 'add' ? 'active' : ''} onClick={() => onChange('add')}>
        <span>➕</span>
        <span>Add</span>
      </button>
      <button className={active === 'history' ? 'active' : ''} onClick={() => onChange('history')}>
        <span>📊</span>
        <span>History</span>
      </button>
    </nav>
  )
}
