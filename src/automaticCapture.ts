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

export function normalizeApplePayShortcutUrl(value: string | undefined): string | null {
  const normalized = value?.trim()
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'www.icloud.com'
      || pathSegments.length !== 2
      || pathSegments[0] !== 'shortcuts'
      || !/^[A-Za-z0-9_-]+$/.test(pathSegments[1])
    ) {
      return null
    }
    return `https://www.icloud.com/shortcuts/${pathSegments[1]}`
  } catch {
    return null
  }
}

export function getConfiguredApplePayShortcutUrl(): string | null {
  return normalizeApplePayShortcutUrl(
    import.meta.env.VITE_APPLE_PAY_SHORTCUT_URL as string | undefined,
  )
}
