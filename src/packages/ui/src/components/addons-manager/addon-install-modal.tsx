'use client'

import { isApiVersionCompatible } from '@mr-tick/shared/helpers'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Terminal, XCircle } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { runAddonJob } from '@/lib/run-addon-job'
import { cn } from '@/lib/utils'

export interface AddonInstallTarget {
  id: string
  name: string
  version: string
  downloadUrl?: string
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
}

interface AddonInstallModalProps {
  addon: AddonInstallTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  operation?: 'install' | 'update'
  onSettled?: () => void
}

interface InstallationLogEntry {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: Date
}

export function AddonInstallModal({
  addon,
  open,
  onOpenChange,
  onSuccess,
  operation = 'install',
  onSettled,
}: AddonInstallModalProps) {
  const bridge = useHostBridge()
  const isUpdate = operation === 'update'
  const operationLabel = isUpdate ? 'Atualização' : 'Instalação'
  const queryClient = useQueryClient()
  const logEndRef = useRef<HTMLDivElement>(null)
  const installationStartedRef = useRef(false)
  const startInstallationRef = useRef<() => Promise<void>>(() =>
    Promise.resolve(),
  )

  const [progress, setProgress] = useState<number>(0)
  const [isDone, setIsDone] = useState<boolean>(false)
  const [isError, setIsError] = useState<boolean>(false)
  const [logs, setLogs] = useState<InstallationLogEntry[]>([])
  const [isExecutingJob, setIsExecutingJob] = useState<boolean>(false)

  const { data: sdkVersion = '0.5.0' } = useQuery({
    queryKey: ['sdkVersion'],
    queryFn: () => bridge.system.getSdkVersion(),
    staleTime: Infinity,
  })

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleClose = () => {
    if (!isDone && isExecutingJob) {
      toast.warning('Aguarde o término da operação em andamento.')
      return
    }
    onOpenChange(false)
  }

  const handleStartInstallation = async () => {
    const failToStart = (message: string) => {
      setIsError(true)
      setIsDone(true)
      setIsExecutingJob(false)
      setLogs([
        {
          id: crypto.randomUUID(),
          message,
          type: 'error',
          timestamp: new Date(),
        },
      ])
      toast.error(message)
      onSettled?.()
    }
    if (!addon?.downloadUrl) {
      failToStart('URL de download não configurada para esta versão.')
      return
    }

    if (!isApiVersionCompatible(addon.requiredApiVersion, sdkVersion)) {
      failToStart(
        `Versão incompatível com a versão atual da API do aplicativo (${sdkVersion})`,
      )
      return
    }

    setIsExecutingJob(true)
    setProgress(0)
    setIsDone(false)
    setIsError(false)

    setLogs([
      {
        id: crypto.randomUUID(),
        message: `Iniciando ${operationLabel.toLowerCase()} de ${addon.name} (v${addon.version})...`,
        type: 'info',
        timestamp: new Date(),
      },
    ])

    const result = await runAddonJob(
      bridge,
      addon.id,
      addon.downloadUrl,
      (event) => {
        if (event.status === 'progress') setProgress(event.value)
        if (event.status === 'data')
          setLogs((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              message:
                typeof event.data === 'string' ? event.data : 'Processando...',
              type: 'info',
              timestamp: new Date(),
            },
          ])
      },
      operation,
    )
    setIsDone(true)
    setIsExecutingJob(false)
    setIsError(result.isFailure())
    const message = result.isFailure()
      ? result.failure.messageKey
      : isUpdate
        ? 'Addon atualizado com sucesso!'
        : 'Addon instalado com sucesso!'
    setLogs((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        message,
        type: result.isFailure() ? 'error' : 'success',
        timestamp: new Date(),
      },
    ])
    if (result.isFailure()) toast.error(message)
    if (result.isSuccess()) {
      setProgress(100)
      toast.success(message)
      onSuccess?.()
    }
    onSettled?.()
    await queryClient.invalidateQueries({ queryKey: ['plugins'] })
  }

  startInstallationRef.current = handleStartInstallation

  useEffect(() => {
    if (!open) {
      installationStartedRef.current = false
      setProgress(0)
      setIsDone(false)
      setIsError(false)
      setLogs([])
      setIsExecutingJob(false)
      return
    }

    if (!addon || installationStartedRef.current) return

    installationStartedRef.current = true
    void startInstallationRef.current()
  }, [open, addon])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        data-testid="addon-install-modal-content"
        className="w-[95vw] max-w-3xl overflow-hidden border-none p-0 shadow-2xl sm:max-w-3xl"
        onPointerDownOutside={(event) => {
          if (!isDone) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (!isDone) event.preventDefault()
        }}
      >
        <div>
          <div className="p-6 pb-4">
            <DialogHeader className="mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg border">
                    <Terminal className="text-primary h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold">
                      Console de {operationLabel}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs">
                      {addon?.id}@{addon?.version}
                    </DialogDescription>
                  </div>
                </div>

                {isDone && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'flex items-center gap-1 font-bold',
                      isError
                        ? 'border-red-400/20 bg-red-400/10 text-red-400'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                    )}
                  >
                    {isError ? (
                      <>
                        <XCircle className="h-3.5 w-3.5" /> Falha
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                      </>
                    )}
                  </Badge>
                )}
              </div>
            </DialogHeader>

            {/* Barra de Progresso */}
            <div className="mb-4 space-y-2">
              <div className="text-muted-foreground flex justify-between font-mono text-[10px] tracking-widest uppercase">
                <span>Progresso de {operationLabel}</span>
                <span className="font-bold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Janela de Logs Estilo Terminal */}
            <div className="border-border bg-card overflow-hidden rounded-lg border font-mono text-[11px]">
              <div className="border-border bg-muted/70 flex items-center gap-2 border-b px-3 py-1.5">
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#FF5F57]" />
                  <div className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2 w-2 rounded-full bg-[#28C840]" />
                </div>
                <span className="text-muted-foreground text-[10px]">
                  {isUpdate ? 'update.log' : 'installation.log'}
                </span>
              </div>

              <ScrollArea className="h-52 p-3">
                <div className="space-y-1.5">
                  {logs.map((log) => {
                    return (
                      <div key={log.id} className="flex gap-2 leading-relaxed">
                        <span className="text-muted-foreground/60 shrink-0">
                          [
                          {log.timestamp.toLocaleTimeString([], {
                            hour12: false,
                          })}
                          ]
                        </span>
                        <span
                          className={cn(
                            'transition-colors',
                            log.type === 'success' &&
                              'font-semibold text-emerald-500',
                            log.type === 'error' &&
                              'font-semibold text-red-400',
                            log.type === 'info' && 'text-foreground/80',
                          )}
                        >
                          {log.type === 'error' && '✖ '}
                          {log.type === 'success' && '✔ '}
                          {log.type === 'info' && '❯ '}
                          {log.message}
                        </span>
                      </div>
                    )
                  })}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Rodapé do Console */}
          <div className="bg-muted/20 border-border flex items-center justify-between border-t p-4">
            <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
              {!isDone && (
                <>
                  <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
                  <span>
                    {isUpdate
                      ? 'Atualizando addon...'
                      : 'Instalando pacotes...'}
                  </span>
                </>
              )}
            </div>

            <Button
              disabled={!isDone}
              onClick={handleClose}
              className="cursor-pointer font-semibold"
            >
              {isDone ? 'Concluir' : 'Aguarde...'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
