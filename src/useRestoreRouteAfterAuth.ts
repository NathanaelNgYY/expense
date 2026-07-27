// src/useRestoreRouteAfterAuth.ts
// The DOM/auth edge of the post-sign-in route restore; the storage rules are pure and live in
// `postAuthRoute.ts`.
//
// The auth event is the signal deliberately: Supabase strips the token fragment from the URL
// *before* it notifies subscribers, so restoring here is the first moment our hash survives.
import { useEffect } from 'react'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { takeRememberedRoute } from './postAuthRoute'
import * as sharedApi from './sharedBudgets/sharedApi'
import { replaceRoute } from './useRoute'

export function useRestoreRouteAfterAuth(): void {
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    // Replace rather than push: the sign-in redirect is not somewhere back should return to.
    return sharedApi.onAuthChange(session => {
      if (!session) return
      const route = takeRememberedRoute()
      if (route) replaceRoute(route)
    })
  }, [])
}
