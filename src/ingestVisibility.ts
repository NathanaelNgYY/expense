export type IngestSourceKind = 'apple_pay' | 'dbs_email'

export interface IngestStatus {
  recipientUserId: string
  tokenLabel: string
  lastCapturedAt: string | null
  lastSource: IngestSourceKind | null
}

export interface IngestBinding {
  userId: string
  accountLabel: string
  tokenLabel: string
  lastCapturedAt: string | null
}

export interface IngestVisibility {
  state: 'linked' | 'mismatch' | 'unlinked'
  recipientAccountLabel: string | null
  tokenLabel: string | null
  lastCapturedAt: string | null
  lastSource: IngestSourceKind | null
}

export const INGEST_BINDING_STORAGE_KEY = 'budget_ingest_recipient'

function isBinding(value: unknown): value is IngestBinding {
  if (!value || typeof value !== 'object') return false
  const binding = value as Partial<IngestBinding>
  return typeof binding.userId === 'string'
    && typeof binding.accountLabel === 'string'
    && typeof binding.tokenLabel === 'string'
    && (binding.lastCapturedAt === null || typeof binding.lastCapturedAt === 'string')
}

export function readIngestBinding(): IngestBinding | null {
  try {
    const raw = localStorage.getItem(INGEST_BINDING_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isBinding(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function rememberIngestBinding(status: IngestStatus, accountLabel: string): void {
  const binding: IngestBinding = {
    userId: status.recipientUserId,
    accountLabel,
    tokenLabel: status.tokenLabel,
    lastCapturedAt: status.lastCapturedAt,
  }
  localStorage.setItem(INGEST_BINDING_STORAGE_KEY, JSON.stringify(binding))
}

export function resolveIngestVisibility(input: {
  currentUserId: string
  currentAccountLabel: string
  status: IngestStatus | null
  rememberedBinding: IngestBinding | null
}): IngestVisibility {
  const { currentUserId, currentAccountLabel, status, rememberedBinding } = input

  if (rememberedBinding && rememberedBinding.userId !== currentUserId) {
    return {
      state: 'mismatch',
      recipientAccountLabel: rememberedBinding.accountLabel,
      tokenLabel: rememberedBinding.tokenLabel,
      lastCapturedAt: rememberedBinding.lastCapturedAt,
      lastSource: null,
    }
  }

  if (status && status.recipientUserId === currentUserId) {
    return {
      state: 'linked',
      recipientAccountLabel: currentAccountLabel,
      tokenLabel: status.tokenLabel,
      lastCapturedAt: status.lastCapturedAt,
      lastSource: status.lastSource,
    }
  }

  return {
    state: 'unlinked',
    recipientAccountLabel: null,
    tokenLabel: null,
    lastCapturedAt: null,
    lastSource: null,
  }
}
