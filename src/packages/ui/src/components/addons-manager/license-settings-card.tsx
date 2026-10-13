'use client'

import type { LicensingStatusViewModel } from '@mr-tick/shared/view-models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

const DEFAULT_LICENSE_STATE: LicensingStatusViewModel = {
  state: 'inactive',
  tier: 'free',
  isPlusActive: false,
  entitlements: [],
}

function getStatusLabel(state: LicensingStatusViewModel['state']): string {
  if (state === 'active') {
    return 'Plus Ativo'
  }
  if (state === 'past_due_grace') {
    return 'Período de Tolerância'
  }
  if (state === 'expired') {
    return 'Expirada'
  }
  if (state === 'revoked') {
    return 'Revogada'
  }
  return 'Plano Gratuito'
}

function getStatusBadgeClass(state: LicensingStatusViewModel['state']): string {
  if (state === 'active') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  if (state === 'past_due_grace') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
  }
  if (state === 'expired' || state === 'revoked') {
    return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
  }
  return 'bg-muted text-muted-foreground'
}

function formatIsoDate(isoDate: string | undefined): string {
  if (!isoDate) {
    return '—'
  }
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return isoDate
  }
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function resolveErrorMessage(
  error: string | undefined,
  fallback: string,
): string {
  if (error) {
    return error
  }
  return fallback
}

export interface LicenseActivationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivated?: (state: LicensingStatusViewModel) => void
}

export function LicenseActivationDialog({
  open,
  onOpenChange,
  onActivated,
}: LicenseActivationDialogProps) {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const [licenseKey, setLicenseKey] = useState('')

  const activateMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await bridge.licensing.activate({
        body: { licenseKey: key },
      })
      if (!response.isSuccess || !response.data) {
        throw new Error(
          resolveErrorMessage(
            response.error,
            'Falha ao ativar licença Mr. Tick Plus.',
          ),
        )
      }
      return response.data
    },
    onSuccess: async (state) => {
      await queryClient.invalidateQueries({ queryKey: ['licensing', 'state'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Licença Mr. Tick Plus ativada com sucesso!')
      setLicenseKey('')
      onOpenChange(false)
      onActivated?.(state)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = licenseKey.trim()
    if (!trimmed) {
      toast.error('Informe uma chave de licença válida.')
      return
    }
    activateMutation.mutate(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw] xl:max-w-xl">
        <DialogHeader className="shrink-0 border-b p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Ativar Mr. Tick Plus
          </DialogTitle>
          <DialogDescription>
            Insira a chave enviada para o seu e-mail após a assinatura para
            desbloquear os addons oficiais Plus neste dispositivo.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="mr-tick-plus-license-key">Chave de Licença</Label>
              <Input
                id="mr-tick-plus-license-key"
                placeholder="MTPLUS-XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
                className="font-mono text-xs uppercase"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="bg-muted/20 shrink-0 gap-2 border-t p-6 pt-4 sm:justify-between">
            <a
              href="https://mistertick.com/#pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary self-center text-xs font-medium hover:underline"
            >
              Ainda não tem uma chave? Assinar Plus
            </a>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={activateMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={activateMutation.isPending}>
                {activateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Ativar Licença
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function useLicensingState() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = bridge.events.on<LicensingStatusViewModel>(
      'licensing:updated',
      (nextState) => {
        queryClient.setQueryData(['licensing', 'state'], nextState)
        void queryClient.invalidateQueries({ queryKey: ['plugins'] })
        if (nextState.isPlusActive) {
          toast.success('Licença Mr. Tick Plus ativada via link rápido!')
        }
      },
    )
    return () => {
      unsubscribe()
    }
  }, [bridge, queryClient])

  return useQuery({
    queryKey: ['licensing', 'state'],
    queryFn: async () => {
      const response = await bridge.licensing.getStatus()
      if (!response.isSuccess || !response.data) {
        return DEFAULT_LICENSE_STATE
      }
      return response.data
    },
  })
}

export function LicenseSettingsCard() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const [activationOpen, setActivationOpen] = useState(false)
  const { data: licenseState = DEFAULT_LICENSE_STATE, isLoading } =
    useLicensingState()

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await bridge.licensing.refresh()
      if (!response.isSuccess || !response.data) {
        throw new Error(
          resolveErrorMessage(
            response.error,
            'Falha ao sincronizar licença Mr. Tick Plus.',
          ),
        )
      }
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['licensing', 'state'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Status da licença atualizado!')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const response = await bridge.licensing.deactivate()
      if (!response.isSuccess || !response.data) {
        throw new Error(
          resolveErrorMessage(
            response.error,
            'Falha ao desativar licença neste dispositivo.',
          ),
        )
      }
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['licensing', 'state'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.info('Licença desativada neste dispositivo.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const hasLicenseKey = Boolean(licenseState.licenseKeyMasked)
  const isPlusAuthorized = licenseState.isPlusActive

  return (
    <>
      <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                <Sparkles className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">
                    Assinatura Mr. Tick Plus
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${getStatusBadgeClass(licenseState.state)}`}
                  >
                    {getStatusLabel(licenseState.state)}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Acesso aos addons oficiais Plus (como Discord Rich Presence &
                  Voice Tracker) e até 2 dispositivos simultâneos.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isPlusAuthorized && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setActivationOpen(true)}
                  disabled={isLoading}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Ativar Licença Plus
                </Button>
              )}

              {hasLicenseKey && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => refreshMutation.mutate()}
                    disabled={
                      refreshMutation.isPending || deactivateMutation.isPending
                    }
                  >
                    <RefreshCw
                      className={cn(
                        'h-3.5 w-3.5',
                        refreshMutation.isPending && 'animate-spin',
                      )}
                    />
                    Sincronizar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 gap-1.5 text-xs"
                    onClick={() => deactivateMutation.mutate()}
                    disabled={
                      refreshMutation.isPending || deactivateMutation.isPending
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desativar dispositivo
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        {hasLicenseKey && (
          <CardContent className="border-t pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-muted-foreground">Chave ativa: </span>
                <span className="font-mono font-semibold">
                  {licenseState.licenseKeyMasked}
                </span>
              </div>
              {licenseState.currentPeriodEnd && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-muted-foreground">
                    Renovação/Validade:{' '}
                  </span>
                  <span className="font-medium">
                    {formatIsoDate(licenseState.currentPeriodEnd)}
                  </span>
                </div>
              )}
              {licenseState.state === 'past_due_grace' &&
                licenseState.graceUntil && (
                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>
                      Tolerância até: {formatIsoDate(licenseState.graceUntil)}
                    </span>
                  </div>
                )}
            </div>
          </CardContent>
        )}
      </Card>

      <LicenseActivationDialog
        open={activationOpen}
        onOpenChange={setActivationOpen}
      />
    </>
  )
}
