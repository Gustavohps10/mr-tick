export interface CanonicalTimeWindow {
  startDate?: string
  endDate?: string | null
  timeSpent: number
}

/** Every provider's stored window is authoritative, including real start times. */
export function reconcileTimeWindow(canonical: CanonicalTimeWindow): {
  startDate: string | undefined
  endDate: string | null
} {
  return {
    startDate: canonical.startDate,
    endDate: canonical.endDate ? canonical.endDate : null,
  }
}
