// src/captureNudgeState.ts
// The storage edge of the U5 nudge, kept out of `captureNudge.ts` so the rule stays
// pure. Per-user scoped via `userStorage` — the same mechanism `onboardingState.ts`
// uses — so one person dismissing the card on a shared device does not silence it
// for the other.
import { getUserStorageItem, setUserStorageItem } from './userStorage'

const CAPTURE_NUDGE_KEY = 'budget_capture_nudge_dismissed'
const DISMISSED = '1'

export function isCaptureNudgeDismissed(): boolean {
  return getUserStorageItem(CAPTURE_NUDGE_KEY) === DISMISSED
}

/** One dismissal is final — a nudge that comes back is an ad. */
export function dismissCaptureNudge(): void {
  setUserStorageItem(CAPTURE_NUDGE_KEY, DISMISSED)
}
