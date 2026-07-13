import { describe, it, expect, beforeEach } from 'vitest'
import { enqueue, getQueue, clearQueue, type Mutation } from './syncQueue'
import { activateUserStorage } from './storage'

beforeEach(() => localStorage.clear())

describe('syncQueue', () => {
  it('enqueues and reads mutations in order', () => {
    const m1: Mutation = { op: 'create', entry: { id: '1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' } }
    const m2: Mutation = { op: 'delete', id: '1' }
    enqueue(m1)
    enqueue(m2)
    expect(getQueue()).toEqual([m1, m2])
  })
  it('clears the queue', () => {
    enqueue({ op: 'delete', id: 'x' })
    clearQueue()
    expect(getQueue()).toEqual([])
  })

  it('never exposes one user queue to another user', () => {
    activateUserStorage('user-a')
    enqueue({ op: 'delete', id: 'a-entry' })

    activateUserStorage('user-b')
    expect(getQueue()).toEqual([])

    activateUserStorage('user-a')
    expect(getQueue()).toEqual([{ op: 'delete', id: 'a-entry' }])
  })
})
