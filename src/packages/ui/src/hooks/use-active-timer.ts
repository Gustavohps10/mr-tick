import { parseISO } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

import { useTimeEntryStore } from '@/stores/timeEntryStore'

export function useActiveTimer(): number {
  const active = useTimeEntryStore((s) => s.active)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active || active.timeStatus !== 'running') return

    const id = window.setInterval(() => {
      setTick((v) => v + 1)
    }, 1000)

    return () => window.clearInterval(id)
  }, [active?.timeStatus, active?.startDate])

  return useMemo(() => {
    if (!active) return 0

    const savedSeconds = active.timeSpent ?? 0

    if (active.timeStatus !== 'running' || !active.startDate) {
      return savedSeconds
    }

    const startMs = parseISO(active.startDate).getTime()
    const elapsed = Math.floor((Date.now() - startMs) / 1000)

    return savedSeconds + elapsed
  }, [active, tick])
}
