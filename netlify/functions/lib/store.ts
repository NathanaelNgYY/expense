import type { Entry } from '../../../src/types'
import { getStore } from '@netlify/blobs'

export interface EntryStore {
  list(): Promise<Entry[]>
  has(dedupeKey: string): Promise<boolean>
  put(entry: Entry): Promise<void>
  updateById(id: string, patch: Partial<Entry>): Promise<Entry | null>
  deleteById(id: string): Promise<boolean>
}

export class InMemoryEntryStore implements EntryStore {
  private map = new Map<string, Entry>()

  async list(): Promise<Entry[]> {
    return [...this.map.values()]
  }
  async has(dedupeKey: string): Promise<boolean> {
    return this.map.has(dedupeKey)
  }
  async put(entry: Entry): Promise<void> {
    this.map.set(entry.dedupeKey as string, entry)
  }
  async updateById(id: string, patch: Partial<Entry>): Promise<Entry | null> {
    for (const [key, entry] of this.map) {
      if (entry.id === id) {
        const next = { ...entry, ...patch, id: entry.id, dedupeKey: entry.dedupeKey }
        this.map.set(key, next)
        return next
      }
    }
    return null
  }
  async deleteById(id: string): Promise<boolean> {
    for (const [key, entry] of this.map) {
      if (entry.id === id) {
        this.map.delete(key)
        return true
      }
    }
    return false
  }
}

export class BlobEntryStore implements EntryStore {
  private store = getStore('entries')

  async list(): Promise<Entry[]> {
    const { blobs } = await this.store.list()
    const entries = await Promise.all(
      blobs.map(b => this.store.get(b.key, { type: 'json' }) as Promise<Entry | null>),
    )
    return entries.filter((e): e is Entry => e !== null)
  }
  async has(dedupeKey: string): Promise<boolean> {
    const value = await this.store.get(dedupeKey, { type: 'json' })
    return value !== null
  }
  async put(entry: Entry): Promise<void> {
    await this.store.setJSON(entry.dedupeKey as string, entry)
  }
  async updateById(id: string, patch: Partial<Entry>): Promise<Entry | null> {
    const all = await this.list()
    const existing = all.find(e => e.id === id)
    if (!existing) return null
    const next = { ...existing, ...patch, id: existing.id, dedupeKey: existing.dedupeKey }
    await this.store.setJSON(existing.dedupeKey as string, next)
    return next
  }
  async deleteById(id: string): Promise<boolean> {
    const all = await this.list()
    const existing = all.find(e => e.id === id)
    if (!existing) return false
    await this.store.delete(existing.dedupeKey as string)
    return true
  }
}
