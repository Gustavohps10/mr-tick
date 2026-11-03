import type {
  AddonLoadFailuresSnapshot,
  AddonLoadFailureViewModel,
} from '@mr-tick/shared/view-models'
import { useEffect, useRef, useState } from 'react'

import { useHostBridge } from '@/hooks/use-host-bridge'

export interface UseAddonLoadFailuresResult {
  failures: AddonLoadFailureViewModel[]
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
}

export function useAddonLoadFailures(): UseAddonLoadFailuresResult {
  const hostBridge = useHostBridge()
  const [failures, setFailures] = useState<AddonLoadFailureViewModel[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isError, setIsError] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const lastRevisionRef = useRef<number>(-1)

  useEffect(() => {
    let isMounted = true

    const applySnapshot = (snapshot: AddonLoadFailuresSnapshot) => {
      if (!isMounted) return
      if (snapshot.revision <= lastRevisionRef.current) return

      lastRevisionRef.current = snapshot.revision
      setFailures(snapshot.failures)
      setIsLoading(false)
      setIsError(false)
      setErrorMessage(null)
    }

    let unsubscribePush: (() => void) | undefined

    if (hostBridge.events?.on) {
      unsubscribePush = hostBridge.events.on<AddonLoadFailuresSnapshot>(
        'addons:load-failures-changed',
        (snapshot: AddonLoadFailuresSnapshot) => {
          applySnapshot(snapshot)
        },
      )
    }

    if (hostBridge.addons?.getLoadFailures) {
      hostBridge.addons
        .getLoadFailures()
        .then((res) => {
          if (!isMounted) return
          if (!res.isSuccess) {
            // Se um push válido mais recente já foi aplicado, não degrada o estado
            if (lastRevisionRef.current >= 0) return
            setIsLoading(false)
            setIsError(true)
            setErrorMessage(
              res.error || 'Falha ao consultar diagnósticos de addons',
            )
            return
          }
          if (res.data) {
            applySnapshot(res.data)
          }
        })
        .catch((err) => {
          if (!isMounted) return
          // Se um push válido mais recente já foi aplicado, rejeição de pull antigo não sobrescreve
          if (lastRevisionRef.current >= 0) return
          setIsLoading(false)
          setIsError(true)
          setErrorMessage(err instanceof Error ? err.message : String(err))
        })
    } else {
      setIsLoading(false)
    }

    return () => {
      isMounted = false
      if (unsubscribePush) {
        unsubscribePush()
      }
    }
  }, [hostBridge])

  return {
    failures,
    isLoading,
    isError,
    errorMessage,
  }
}
