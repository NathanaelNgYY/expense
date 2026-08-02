// src/sharedBudgets/CodeInput.tsx
// A six-character invite-code field drawn as six boxes. There is exactly ONE
// real <input>, stretched transparently across the boxes, because the
// six-separate-inputs pattern breaks paste, autofill, and backspace on iOS and
// needs focus juggling to feel normal. The boxes are presentation; the input is
// the control, so the native keyboard, caret, and clipboard all behave.

import { useId, useRef } from 'react'
import { CODE_LENGTH, normalizeCode } from './inviteCode'

interface Props {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  label: string
  describedBy?: string
  autoFocus?: boolean
}

export default function CodeInput({
  value,
  onChange,
  invalid = false,
  disabled = false,
  label,
  describedBy,
  autoFocus = false,
}: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const chars = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '')
  // Once the code is full there is no "next" box, so the caret parks on the last one.
  const cursorAt = Math.min(value.length, CODE_LENGTH - 1)

  return (
    <div className={`code-input ${invalid ? 'code-input--invalid' : ''}`}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="code-input__field"
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        // Not "one-time-code": codes arrive by share sheet or chat, never SMS,
        // so that hint only offers iOS's irrelevant Messages strip.
        autoComplete="off"
        maxLength={CODE_LENGTH}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        onChange={event => onChange(normalizeCode(event.target.value))}
      />
      <div className="code-input__boxes" aria-hidden="true">
        {chars.map((char, index) => (
          <span
            key={index}
            className={`code-box ${char === '' ? 'code-box--empty' : ''} ${
              index === cursorAt && !disabled ? 'code-box--cursor' : ''
            }`}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  )
}
