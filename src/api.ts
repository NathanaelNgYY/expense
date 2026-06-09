import type { Category, Entry } from './types'

const TOKEN_KEY = 'api_token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getApiToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setApiToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${getApiToken()}`,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface NewManualEntry {
  amount: number
  category: Category | null
  note: string
  date: string
}

export function fetchEntries(): Promise<Entry[]> {
  return request<Entry[]>('/api/entries')
}

export function createEntryApi(entry: NewManualEntry): Promise<Entry> {
  return request<Entry>('/api/entries', { method: 'POST', body: JSON.stringify(entry) })
}

export function updateEntryApi(id: string, patch: Partial<Entry>): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
}

export function deleteEntryApi(id: string): Promise<void> {
  return request<void>(`/api/entries/${id}`, { method: 'DELETE' })
}
