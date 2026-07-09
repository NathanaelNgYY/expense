import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from './ThemeContext'
import { THEMES, type ThemeId } from './themeRegistry'

export default function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [message, setMessage] = useState('')

  function chooseTheme(nextTheme: ThemeId) {
    setTheme(nextTheme)
    setMessage('Theme applied and saved')
  }

  return (
    <section className="theme-picker" aria-labelledby="appearance-title">
      <h3 id="appearance-title" className="section-title">
        Appearance
      </h3>
      <div className="theme-options" role="radiogroup" aria-label="App theme">
        {THEMES.map(option => {
          const selected = option.id === theme
          return (
            <label
              key={option.id}
              className={`theme-option${selected ? ' theme-option--selected' : ''}`}
              data-theme-preview={option.id}
            >
              <input
                type="radio"
                name="app-theme"
                value={option.id}
                checked={selected}
                onChange={() => chooseTheme(option.id)}
              />
              <span className="theme-preview" aria-hidden="true">
                <span className="theme-preview__hero" />
                <span className="theme-preview__bar" />
                <span className="theme-preview__bar theme-preview__bar--short" />
              </span>
              <span className="theme-option__copy">
                <strong>{option.name}</strong>
                <span className="theme-swatches" aria-hidden="true">
                  {option.swatches.map(color => (
                    <i key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <small>{option.description}</small>
              </span>
              <span className="theme-option__check" aria-hidden="true">
                {selected && <Check size={14} strokeWidth={3} />}
              </span>
            </label>
          )
        })}
      </div>
      <p className="theme-status" role="status">
        {message}
      </p>
    </section>
  )
}
