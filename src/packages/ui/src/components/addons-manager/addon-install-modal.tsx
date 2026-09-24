'use client'

import { AddonPackageViewModel } from '@mr-tick/sdk'
import { IJobEvent } from '@mr-tick/shared/transport'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  Download,
  Loader2,
  Terminal,
  XCircle,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib'

export interface AddonInstallTarget {
  id: string
  name: string
  version: string
  downloadUrl?: string
  requiredApiVersion?: string
  releaseDate?: string
  changelog?: string[]
  packages?: AddonPackageViewModel[]
}

interface AddonInstallModalProps {
  addon: AddonInstallTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface InstallationLogEntry {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: Date
}

type ModalStep = 'SELECT_VERSION' | 'INSTALLING'

export function AddonInstallModal({
  addon,
  open,
  onOpenChange,
  onSuccess,
}: AddonInstallModalProps) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const logEndRef = useRef<HTMLDivElement>(null)

  const [currentStep, setCurrentStep] = useState<ModalStep>('SELECT_VERSION')
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [progress, setProgress] = useState<number>(0)
  const [isDone, setIsDone] = useState<boolean>(false)
  const [isError, setIsError] = useState<boolean>(false)
  const [logs, setLogs] = useState<InstallationLogEntry[]>([])
  const [isExecutingJob, setIsExecutingJob] = useState<boolean>(false)

  // Lista normalizada de pacotes/versões
  const availablePackages: AddonPackageViewModel[] = useMemo(() => {
    if (!addon) return []

    if (addon.packages && addon.packages.length > 0) {
      return addon.packages
    }

    return [
      {
        version: addon.version || '1.0.0',
        downloadUrl: addon.downloadUrl || '',
        requiredApiVersion: addon.requiredApiVersion || '>=1.0.0',
        releaseDate:
          addon.releaseDate || new Date().toISOString().split('T')[0],
        changelog: addon.changelog || ['Versão de lançamento'],
      },
    ]
  }, [addon])

  // Pacote atualmente selecionado
  const selectedPackage = useMemo(() => {
    if (!selectedVersion) return availablePackages[0] || null
    const found = availablePackages.find(
      (pkg) => pkg.version === selectedVersion,
    )
    if (found) return found
    return availablePackages[0] || null
  }, [availablePackages, selectedVersion])

  // Reset ao abrir ou trocar de addon
  useEffect(() => {
    if (!open) {
      setCurrentStep('SELECT_VERSION')
      setSelectedVersion('')
      setProgress(0)
      setIsDone(false)
      setIsError(false)
      setLogs([])
      setIsExecutingJob(false)
      return
    }

    if (availablePackages.length > 0) {
      setSelectedVersion(availablePackages[0].version)
    }
  }, [open, availablePackages])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleClose = () => {
    if (currentStep === 'INSTALLING' && !isDone && isExecutingJob) {
      toast.warning('Aguarde o término da instalação em andamento.')
      return
    }
    onOpenChange(false)
  }

  const handleStartInstallation = async () => {
    if (!selectedPackage?.downloadUrl) {
      toast.error('URL de download não configurada para esta versão.')
      return
    }

    setCurrentStep('INSTALLING')
    setIsExecutingJob(true)
    setProgress(0)
    setIsDone(false)
    setIsError(false)

    setLogs([
      {
        id: crypto.randomUUID(),
        message: `Iniciando instalação de ${addon?.name} (v${selectedPackage.version})...`,
        type: 'info',
        timestamp: new Date(),
      },
    ])

    const installResponse = await bridge.addons.install({
      body: { downloadUrl: selectedPackage.downloadUrl },
    })

    if (!installResponse.isSuccess || !installResponse.data?.jobId) {
      setIsError(true)
      setIsDone(true)
      setIsExecutingJob(false)
      setLogs((prevLogs) => [
        ...prevLogs,
        {
          id: crypto.randomUUID(),
          message: `Falha ao iniciar job: ${installResponse.error ?? 'Erro desconhecido'}`,
          type: 'error',
          timestamp: new Date(),
        },
      ])
      return
    }

    const jobId = installResponse.data.jobId

    const unsubscribeEvents = bridge.events.on(
      jobId,
      (event: IJobEvent<string>) => {
        if (event.status === 'progress') {
          setProgress(event.value)
          return
        }

        if (event.status === 'data') {
          const messageText =
            typeof event.data === 'string' ? event.data : 'Processando...'
          setLogs((prevLogs) => [
            ...prevLogs,
            {
              id: crypto.randomUUID(),
              message: messageText,
              type: 'info',
              timestamp: new Date(),
            },
          ])
          return
        }

        if (event.status === 'done') {
          unsubscribeEvents()
          setProgress(100)
          setIsDone(true)
          setIsExecutingJob(false)
          setLogs((prevLogs) => [
            ...prevLogs,
            {
              id: crypto.randomUUID(),
              message: 'Instalação concluída com sucesso!',
              type: 'success',
              timestamp: new Date(),
            },
          ])
          queryClient.invalidateQueries({ queryKey: ['plugins'] })
          onSuccess?.()
          return
        }

        if (event.status === 'error') {
          unsubscribeEvents()
          setIsDone(true)
          setIsError(true)
          setIsExecutingJob(false)
          setLogs((prevLogs) => [
            ...prevLogs,
            {
              id: crypto.randomUUID(),
              message: `Erro fatal: ${event.error}`,
              type: 'error',
              timestamp: new Date(),
            },
          ])
          return
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="overflow-hidden border-none p-0 shadow-2xl sm:max-w-lg"
        onPointerDownOutside={(event) => {
          if (currentStep === 'INSTALLING' && !isDone) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (currentStep === 'INSTALLING' && !isDone) event.preventDefault()
        }}
      >
        {/* ETAPA 1: SELEÇÃO DE VERSÃO */}
        {currentStep === 'SELECT_VERSION' && (
          <div className="p-6">
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl border">
                  <Download className="text-primary h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">
                    Instalar {addon?.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Selecione a versão que deseja instalar.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Lista de Versões */}
            <div className="space-y-2">
              <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                Versões Disponíveis ({availablePackages.length})
              </span>

              <ScrollArea className="max-h-60 pr-2">
                <div className="space-y-2">
                  {availablePackages.map((pkg) => {
                    const isSelected = selectedPackage?.version === pkg.version
                    return (
                      <Card
                        key={pkg.version}
                        onClick={() => setSelectedVersion(pkg.version)}
                        className={cn(
                          'relative cursor-pointer border p-3 transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                            : 'border-border/60 hover:border-border hover:bg-muted/30',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground text-sm font-bold">
                              v{pkg.version}
                            </span>
                            {pkg.requiredApiVersion && (
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px]"
                              >
                                API {pkg.requiredApiVersion}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {pkg.releaseDate && (
                              <span className="text-muted-foreground text-[10px]">
                                {pkg.releaseDate}
                              </span>
                            )}
                            {isSelected && (
                              <div className="bg-primary flex h-4 w-4 items-center justify-center rounded-full text-white">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Changelog da Versão */}
                        {pkg.changelog && pkg.changelog.length > 0 && (
                          <ul className="text-muted-foreground mt-2 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed">
                            {pkg.changelog.map((line, index) => (
                              <li key={index}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="mt-6 flex justify-end gap-2 border-t pt-4">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleStartInstallation}
                disabled={!selectedPackage?.downloadUrl}
                className="cursor-pointer gap-1.5 font-semibold"
              >
                <Download className="h-4 w-4" />
                Confirmar e Instalar (v{selectedPackage?.version || '1.0.0'})
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ETAPA 2: CONSOLE DE INSTALAÇÃO AO VIVO */}
        {currentStep === 'INSTALLING' && (
          <div>
            <div className="p-6 pb-4">
              <DialogHeader className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl border">
                      <Terminal className="text-primary h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold">
                        Console de Instalação
                      </DialogTitle>
                      <DialogDescription className="font-mono text-xs">
                        {addon?.id}@{selectedPackage?.version}
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
                  <span>Progresso de Instalação</span>
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
                    installation.log
                  </span>
                </div>

                <ScrollArea className="h-52 p-3">
                  <div className="space-y-1.5">
                    {logs.map((log, index) => {
                      const isLast = index === logs.length - 1
                      return (
                        <div
                          key={log.id}
                          className="flex gap-2 leading-relaxed"
                        >
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
                    <span>Instalando pacotes...</span>
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
        )}
      </DialogContent>
    </Dialog>
  )
}
