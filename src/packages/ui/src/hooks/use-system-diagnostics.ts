import {
  DIAGNOSTICS_SNAPSHOT_UPDATED_EVENT,
  type DiagnosticSnapshot,
} from '@mr-tick/application'
import type { ViewModel } from '@mr-tick/shared/view-models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useHostBridge } from '@/hooks/use-host-bridge'

export interface BridgeDiagnosticsState {
  epoch: number
  continuityToken: number
  activeSessionId: string | null
  retiredSessionIds: Set<string>
}

const bridgeStates = new WeakMap<object, BridgeDiagnosticsState>()
let nextBridgeEpoch = 1

export function getBridgeDiagnosticsState(
  bridge: object,
): BridgeDiagnosticsState {
  const existing = bridgeStates.get(bridge)
  if (existing !== undefined) {
    return existing
  }
  const newState: BridgeDiagnosticsState = {
    epoch: nextBridgeEpoch,
    continuityToken: 1,
    activeSessionId: null,
    retiredSessionIds: new Set(),
  }
  nextBridgeEpoch += 1
  bridgeStates.set(bridge, newState)
  return newState
}

export function getSystemDiagnosticsQueryKey(
  bridge: object,
): readonly ['system-diagnostics', 'snapshot', number] {
  const state = getBridgeDiagnosticsState(bridge)
  return ['system-diagnostics', 'snapshot', state.epoch]
}

export type DiagnosticActionResult =
  { success: true } | { success: false; error: string }

export interface UseSystemDiagnosticsReturn {
  snapshot: DiagnosticSnapshot | null
  isLoading: boolean
  isChecking: boolean
  isExporting: boolean
  errorMessage: string | null
  actionError: string | null
  clearActionError: () => void
  isRuntimeUnavailable: boolean
  selectedWorkspaceId: string | null
  setSelectedWorkspaceId: (workspaceId: string | null) => void
  runManualChecks: () => Promise<DiagnosticActionResult>
  copySanitizedReport: () => Promise<DiagnosticActionResult>
  openDataDirectory: () => Promise<DiagnosticActionResult>
}

export function isSnapshotNewer(
  incoming: DiagnosticSnapshot,
  current: DiagnosticSnapshot | null | undefined,
  bridgeState?: BridgeDiagnosticsState,
  operationToken?: number,
): boolean {
  if (!current) {
    if (bridgeState) {
      if (
        bridgeState.activeSessionId !== null &&
        bridgeState.activeSessionId !== incoming.sessionId
      ) {
        bridgeState.retiredSessionIds.add(bridgeState.activeSessionId)
        bridgeState.continuityToken += 1
      }
      if (bridgeState.activeSessionId === null) {
        bridgeState.continuityToken += 1
      }
      bridgeState.activeSessionId = incoming.sessionId
    }
    return true
  }

  if (incoming.sessionId === current.sessionId) {
    return incoming.revision > current.revision
  }

  if (bridgeState) {
    if (bridgeState.retiredSessionIds.has(incoming.sessionId)) {
      return false
    }

    if (
      operationToken !== undefined &&
      operationToken < bridgeState.continuityToken
    ) {
      bridgeState.retiredSessionIds.add(incoming.sessionId)
      return false
    }

    if (
      bridgeState.activeSessionId !== null &&
      bridgeState.activeSessionId !== incoming.sessionId
    ) {
      bridgeState.retiredSessionIds.add(bridgeState.activeSessionId)
      bridgeState.activeSessionId = incoming.sessionId
      bridgeState.continuityToken += 1
    }
    return true
  }

  return false
}

async function executeSafely<T>(
  operation: () => Promise<T>,
  fallbackMessage: string,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const value = await operation()
    return { ok: true, value }
  } catch (err) {
    if (err instanceof Error) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: fallbackMessage }
  }
}

export function useSystemDiagnostics(): UseSystemDiagnosticsReturn {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const isMountedRef = useRef(true)
  const previousBridgeRef = useRef(bridge)
  const [isChecking, setIsChecking] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  )

  const bridgeState = useMemo(() => getBridgeDiagnosticsState(bridge), [bridge])
  const activeEpochRef = useRef(bridgeState.epoch)
  activeEpochRef.current = bridgeState.epoch

  if (previousBridgeRef.current !== bridge) {
    previousBridgeRef.current = bridge
    if (isChecking) {
      setIsChecking(false)
    }
    if (isExporting) {
      setIsExporting(false)
    }
    if (actionError !== null) {
      setActionError(null)
    }
  }

  const queryKey: readonly ['system-diagnostics', 'snapshot', number] = useMemo(
    () => ['system-diagnostics', 'snapshot', bridgeState.epoch],
    [bridgeState.epoch],
  )

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const clearActionError = useCallback(() => {
    setActionError(null)
  }, [])

  const query = useQuery<ViewModel<DiagnosticSnapshot>, Error>({
    queryKey,
    queryFn: async () => {
      const operationToken = bridgeState.continuityToken
      const cacheAtStart =
        queryClient.getQueryData<ViewModel<DiagnosticSnapshot>>(queryKey)

      const execResult = await executeSafely(
        () => bridge.diagnostics.getSnapshot(),
        'Falha de transporte ao consultar diagnóstico',
      )

      if (!execResult.ok) {
        const cacheAtEnd =
          queryClient.getQueryData<ViewModel<DiagnosticSnapshot>>(queryKey)
        if (
          cacheAtEnd &&
          cacheAtEnd.isSuccess &&
          cacheAtEnd.data &&
          cacheAtEnd !== cacheAtStart
        ) {
          return cacheAtEnd
        }
        return {
          isSuccess: false,
          statusCode: 500,
          error: execResult.error,
        }
      }

      const response = execResult.value

      if (!response.isSuccess) {
        const cacheAtEnd =
          queryClient.getQueryData<ViewModel<DiagnosticSnapshot>>(queryKey)
        if (
          cacheAtEnd &&
          cacheAtEnd.isSuccess &&
          cacheAtEnd.data &&
          cacheAtEnd !== cacheAtStart
        ) {
          return cacheAtEnd
        }

        if (response.error) {
          return response
        }
        return {
          isSuccess: false,
          statusCode: response.statusCode,
          error:
            'Violação de protocolo: getSnapshot retornou falha sem mensagem de erro',
        }
      }

      if (!response.data) {
        return {
          isSuccess: false,
          statusCode: response.statusCode,
          error:
            'Violação de protocolo: getSnapshot indicou sucesso mas omitiu dados do snapshot',
        }
      }

      const currentCached =
        queryClient.getQueryData<ViewModel<DiagnosticSnapshot>>(queryKey)

      if (currentCached && currentCached.isSuccess && currentCached.data) {
        if (
          !isSnapshotNewer(
            response.data,
            currentCached.data,
            bridgeState,
            operationToken,
          )
        ) {
          return currentCached
        }
      }

      return response
    },
    staleTime: 5000,
  })

  useEffect(() => {
    let isSubscribed = true

    const unsubscribe = bridge.events.on<DiagnosticSnapshot>(
      DIAGNOSTICS_SNAPSHOT_UPDATED_EVENT,
      (payload) => {
        if (!isSubscribed) return
        if (!payload) return

        queryClient.setQueryData<ViewModel<DiagnosticSnapshot>>(
          queryKey,
          (currentCached) => {
            if (
              currentCached &&
              currentCached.isSuccess &&
              currentCached.data
            ) {
              if (!isSnapshotNewer(payload, currentCached.data, bridgeState)) {
                return currentCached
              }
            }

            return {
              isSuccess: true,
              statusCode: 200,
              data: payload,
            }
          },
        )
      },
    )

    return () => {
      isSubscribed = false
      unsubscribe()
    }
  }, [bridge, bridgeState, queryClient, queryKey])

  const runManualChecks =
    useCallback(async (): Promise<DiagnosticActionResult> => {
      const operationEpoch = bridgeState.epoch
      setIsChecking(true)
      setActionError(null)
      const operationToken = bridgeState.continuityToken

      try {
        const execResult = await executeSafely(
          () => bridge.diagnostics.runChecks(),
          'Falha de transporte ao executar checagens',
        )

        if (!execResult.ok) {
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(execResult.error)
          }
          return { success: false, error: execResult.error }
        }

        const response = execResult.value

        if (!response.isSuccess) {
          if (response.error) {
            if (
              isMountedRef.current &&
              activeEpochRef.current === operationEpoch
            ) {
              setActionError(response.error)
            }
            return { success: false, error: response.error }
          }
          const protocolError =
            'Violação de protocolo: runChecks falhou sem mensagem de erro'
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(protocolError)
          }
          return { success: false, error: protocolError }
        }

        if (!response.data) {
          const protocolError =
            'Violação de protocolo: runChecks reportou sucesso mas não retornou snapshot'
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(protocolError)
          }
          return { success: false, error: protocolError }
        }

        const updatedSnapshot = response.data

        queryClient.setQueryData<ViewModel<DiagnosticSnapshot>>(
          queryKey,
          (currentCached) => {
            if (
              currentCached &&
              currentCached.isSuccess &&
              currentCached.data
            ) {
              if (
                !isSnapshotNewer(
                  updatedSnapshot,
                  currentCached.data,
                  bridgeState,
                  operationToken,
                )
              ) {
                return currentCached
              }
            }
            return {
              isSuccess: true,
              statusCode: 200,
              data: updatedSnapshot,
            }
          },
        )

        return { success: true }
      } finally {
        if (isMountedRef.current && activeEpochRef.current === operationEpoch) {
          setIsChecking(false)
        }
      }
    }, [bridge, bridgeState, queryClient, queryKey])

  const copySanitizedReport =
    useCallback(async (): Promise<DiagnosticActionResult> => {
      const operationEpoch = bridgeState.epoch
      setIsExporting(true)
      setActionError(null)

      try {
        const execResult = await executeSafely(
          () => bridge.diagnostics.generateReport(),
          'Falha de transporte ao gerar relatório sanitizado',
        )

        if (!execResult.ok) {
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(execResult.error)
          }
          return { success: false, error: execResult.error }
        }

        const response = execResult.value

        if (!response.isSuccess) {
          if (response.error) {
            if (
              isMountedRef.current &&
              activeEpochRef.current === operationEpoch
            ) {
              setActionError(response.error)
            }
            return { success: false, error: response.error }
          }
          const protocolError =
            'Violação de protocolo: generateReport falhou sem mensagem de erro'
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(protocolError)
          }
          return { success: false, error: protocolError }
        }

        if (!response.data) {
          const emptyError = 'Relatório vazio retornado pelo sistema'
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(emptyError)
          }
          return { success: false, error: emptyError }
        }

        if (typeof navigator === 'undefined' || !navigator.clipboard) {
          const clipUnavailable =
            'Área de transferência inacessível neste ambiente'
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(clipUnavailable)
          }
          return { success: false, error: clipUnavailable }
        }

        const formatted = JSON.stringify(response.data, null, 2)
        const clipResult = await executeSafely(
          () => navigator.clipboard.writeText(formatted),
          'Falha ao escrever na área de transferência',
        )

        if (!clipResult.ok) {
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(clipResult.error)
          }
          return { success: false, error: clipResult.error }
        }

        return { success: true }
      } finally {
        if (isMountedRef.current && activeEpochRef.current === operationEpoch) {
          setIsExporting(false)
        }
      }
    }, [bridge, bridgeState])

  const openDataDirectory =
    useCallback(async (): Promise<DiagnosticActionResult> => {
      const operationEpoch = bridgeState.epoch
      setActionError(null)

      const execResult = await executeSafely(
        () => bridge.diagnostics.openDataDirectory(),
        'Falha de transporte ao abrir diretório de dados',
      )

      if (!execResult.ok) {
        if (isMountedRef.current && activeEpochRef.current === operationEpoch) {
          setActionError(execResult.error)
        }
        return { success: false, error: execResult.error }
      }

      const response = execResult.value

      if (!response.isSuccess) {
        if (response.error) {
          if (
            isMountedRef.current &&
            activeEpochRef.current === operationEpoch
          ) {
            setActionError(response.error)
          }
          return { success: false, error: response.error }
        }
        const defaultError =
          'Diretório de dados não disponível ou não suportado na plataforma'
        if (isMountedRef.current && activeEpochRef.current === operationEpoch) {
          setActionError(defaultError)
        }
        return { success: false, error: defaultError }
      }

      return { success: true }
    }, [bridge, bridgeState])

  const queryData = query.data
  const snapshot =
    queryData && queryData.isSuccess && queryData.data ? queryData.data : null

  const dispatcherState = snapshot?.dispatcher?.state
  const isRuntimeUnavailable =
    Boolean(snapshot && dispatcherState === 'closed') ||
    (Boolean(snapshot?.dispatcher?.lastStartupFailure) &&
      dispatcherState !== 'ready')

  const errorMessage = (() => {
    if (query.isError && query.error) {
      return query.error.message
    }
    if (queryData && !queryData.isSuccess) {
      if (queryData.error) {
        return queryData.error
      }
      return 'Falha na obtenção do diagnóstico'
    }
    return null
  })()

  return {
    snapshot,
    isLoading: query.isLoading,
    isChecking,
    isExporting,
    errorMessage,
    actionError,
    clearActionError,
    isRuntimeUnavailable,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    runManualChecks,
    copySanitizedReport,
    openDataDirectory,
  }
}
