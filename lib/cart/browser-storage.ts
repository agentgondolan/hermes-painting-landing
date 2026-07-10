export type StoredCartSelection = {
  purchaseOptionId: string
  quantity: number
}

export type StoredCartSelections = Record<string, StoredCartSelection>

const CART_DRAFT_STORAGE_KEY = 'dottingo_cart_draft_id_v1'
const CART_SELECTIONS_STORAGE_KEY = 'dottingo_cart_selections_v1'

export function readStoredCartDraftId(): string | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(CART_DRAFT_STORAGE_KEY)
  return value?.trim() || null
}

export function writeStoredCartDraftId(orderDraftId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CART_DRAFT_STORAGE_KEY, orderDraftId)
}

export function clearStoredCartDraftId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CART_DRAFT_STORAGE_KEY)
}

export function readStoredCartSelections(): StoredCartSelections {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CART_SELECTIONS_STORAGE_KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(Object.entries(parsed).flatMap(([previewId, rawSelection]) => {
      if (!rawSelection || typeof rawSelection !== 'object' || Array.isArray(rawSelection)) return []
      const selection = rawSelection as Record<string, unknown>
      const purchaseOptionId = typeof selection.purchaseOptionId === 'string' ? selection.purchaseOptionId.trim() : ''
      const quantity = Number(selection.quantity)
      if (!previewId.trim() || !purchaseOptionId || !Number.isFinite(quantity)) return []
      return [[previewId, {
        purchaseOptionId,
        quantity: Math.max(1, Math.min(99, Math.floor(quantity))),
      }]]
    }))
  } catch {
    return {}
  }
}

export function writeStoredCartSelections(selections: StoredCartSelections): void {
  if (typeof window === 'undefined') return
  if (!Object.keys(selections).length) {
    window.localStorage.removeItem(CART_SELECTIONS_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(CART_SELECTIONS_STORAGE_KEY, JSON.stringify(selections))
}

export function clearStoredCartState(): void {
  clearStoredCartDraftId()
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CART_SELECTIONS_STORAGE_KEY)
}
