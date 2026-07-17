// src/components/TabBar.tsx
import type { KeyboardEvent } from 'react'
import { ChartColumn, CirclePlus, House, Lightbulb, Settings } from 'lucide-react'

export type Tab = 'home' | 'history' | 'add' | 'insights' | 'settings'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

// Arrow/Home/End move focus between the five destinations (wrapping) as a
// progressive enhancement over the natural tab order; activation stays on
// Enter/Space/click. Focus movement must never trigger navigation.
function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
  const { key } = event
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return

  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index === -1) return

  event.preventDefault()
  const next =
    key === 'ArrowRight' ? (index + 1) % buttons.length
    : key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length
    : key === 'Home' ? 0
    : buttons.length - 1
  buttons[next].focus()
}

export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" aria-label="Main navigation" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label="Home"
        aria-current={active === 'home' ? 'page' : undefined}
        className={active === 'home' ? 'active' : ''}
        onClick={() => onChange('home')}
      >
        <House className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Home</span>
      </button>
      <button
        type="button"
        aria-label="History"
        aria-current={active === 'history' ? 'page' : undefined}
        className={active === 'history' ? 'active' : ''}
        onClick={() => onChange('history')}
      >
        <ChartColumn className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>History</span>
      </button>
      <button
        type="button"
        aria-label="Add entry"
        aria-current={active === 'add' ? 'page' : undefined}
        className={`tab-add${active === 'add' ? ' active' : ''}`}
        onClick={() => onChange('add')}
      >
        <CirclePlus className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Add</span>
      </button>
      <button
        type="button"
        aria-label="Insights"
        aria-current={active === 'insights' ? 'page' : undefined}
        className={active === 'insights' ? 'active' : ''}
        onClick={() => onChange('insights')}
      >
        <Lightbulb className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Insights</span>
      </button>
      <button
        type="button"
        aria-label="Settings"
        aria-current={active === 'settings' ? 'page' : undefined}
        className={active === 'settings' ? 'active' : ''}
        onClick={() => onChange('settings')}
      >
        <Settings className="tab-icon" aria-hidden="true" strokeWidth={2.3} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
