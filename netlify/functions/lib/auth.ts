export function isAuthorized(authHeader: string | null, serverToken: string | undefined): boolean {
  if (!serverToken) return false
  if (!authHeader) return false
  const match = /^Bearer\s+(.+)$/.exec(authHeader.trim())
  if (!match) return false
  return match[1] === serverToken
}
