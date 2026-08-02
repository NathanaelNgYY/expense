import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CodeInput from './CodeInput'
import { normalizeCode } from './inviteCode'

describe('normalizeCode', () => {
  // Invite codes travel by message, so they arrive pasted, lowercased, and
  // wrapped in whatever punctuation the sender's app added.
  it('uppercases and strips anything that is not a letter or digit', () => {
    expect(normalizeCode(' xyz-78 9 ')).toBe('XYZ789')
  })

  it('caps at the code length so an over-long paste cannot overflow the boxes', () => {
    expect(normalizeCode('ABC234EXTRA')).toBe('ABC234')
  })

  it('leaves an empty string empty', () => {
    expect(normalizeCode('   ')).toBe('')
  })
})

describe('CodeInput', () => {
  it('exposes one labelled input rather than six, so paste and autofill work', () => {
    render(<CodeInput label="Invite code" value="" onChange={() => {}} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Invite code')).toBeInTheDocument()
  })

  it('normalises what the user types before handing it back', () => {
    const onChange = vi.fn()
    render(<CodeInput label="Invite code" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'ab2' } })
    expect(onChange).toHaveBeenCalledWith('AB2')
  })

  it('marks the field invalid for assistive tech, not just in colour', () => {
    render(<CodeInput label="Invite code" value="ABC234" onChange={() => {}} invalid />)
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('aria-invalid', 'true')
  })
})
