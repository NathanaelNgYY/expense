export function ingestEndpointFromSupabaseUrl(value: string | undefined): string | null {
  const normalized = value?.trim()
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.pathname = '/functions/v1/ingest'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getConfiguredIngestEndpoint(): string | null {
  return ingestEndpointFromSupabaseUrl(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
  )
}
