import type { LicensingStatusViewModel } from '@mr-tick/shared/view-models'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

import { useLicensingState } from '@/components/addons-manager/license-settings-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export function LicenseSettingsTab() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const { data: licenseState = DEFAULT_LICENSE_STATE, isLoading } =
    useLicensingState()

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['licensing', 'state'] })
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
      toast.success('Licença Mr. Tick Plus ativada com sucesso!')
      setLicenseKeyInput('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

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

  const handleActivateSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = licenseKeyInput.trim()
    if (!trimmed) {
      toast.error('Informe uma chave de licença válida.')
      return
    }
    activateMutation.mutate(trimmed)
  }

  const isPlusActive = licenseState.isPlusActive

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-medium">Mr. Tick Plus</h3>
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${getStatusBadgeClass(licenseState.state)}`}
          >
            {getStatusLabel(licenseState.state)}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Gerencie sua chave de ativação para desbloquear addons oficiais e
          sincronização avançada.
        </p>
      </div>

      {isPlusActive && (
        <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent">
          <CardContent className="space-y-4 p-4 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-muted-foreground text-xs">
                  Chave Ativa:{' '}
                </span>
                <span className="font-mono font-semibold">
                  {licenseState.licenseKeyMasked}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
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
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-8 gap-1.5 text-xs"
                  onClick={() => deactivateMutation.mutate()}
                  disabled={
                    refreshMutation.isPending || deactivateMutation.isPending
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Desativar
                </Button>
              </div>
            </div>

            <div className="border-border/60 flex flex-wrap items-center gap-6 border-t pt-3 text-xs">
              {licenseState.currentPeriodEnd && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-muted-foreground">Validade:</span>
                  <span className="font-medium">
                    {formatIsoDate(licenseState.currentPeriodEnd)}
                  </span>
                </div>
              )}
              {licenseState.state === 'past_due_grace' &&
                licenseState.graceUntil && (
                  <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>
                      Tolerância até: {formatIsoDate(licenseState.graceUntil)}
                    </span>
                  </div>
                )}
              <div className="text-muted-foreground">
                Dispositivos:{' '}
                <span className="font-medium">Até 2 simultâneos</span>
              </div>
            </div>

            <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[11px]">
              <span className="text-muted-foreground">
                Chave vazou ou suspeita de invasão?
              </span>
              <a
                href="https://mistertick.com/license?action=rotate"
                target="_blank"
                rel="noreferrer"
                className="text-destructive inline-flex items-center gap-1 font-semibold transition-colors hover:underline"
              >
                <span>Revogar e Gerar Nova Chave</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {!isPlusActive && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <form onSubmit={handleActivateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="license-key-input"
                className="text-xs font-semibold"
              >
                Chave de Ativação
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                  <Input
                    id="license-key-input"
                    type="password"
                    placeholder="mrtick_live_..."
                    className="pl-9 font-mono text-xs"
                    value={licenseKeyInput}
                    onChange={(event) => setLicenseKeyInput(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="gap-1.5 text-xs font-semibold"
                  disabled={activateMutation.isPending || isLoading}
                >
                  {activateMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Ativar
                </Button>
              </div>
              <div className="flex items-center justify-between pt-0.5 text-[11px]">
                <span className="text-muted-foreground">
                  Cole a chave recebida após a confirmação da assinatura.
                </span>
                <a
                  href="https://mistertick.com/license?action=recover"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 font-semibold transition-colors hover:underline"
                >
                  <span>Recuperar Chave</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </form>

          <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                Ainda não possui Mr. Tick Plus?
              </span>
              <a
                href="https://mistertick.com/license?action=checkout"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:text-primary/80 flex items-center gap-1 font-semibold transition-colors"
              >
                <span>Assinar Mr. Tick Plus</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Desbloqueie observadores de chamadas (Discord Presence),
              sincronização avançada e suporte com garantia de ativação em até 2
              dispositivos.
            </p>
            <div className="border-border/60 flex items-center justify-between border-t pt-2 text-[11px]">
              <span className="text-muted-foreground">
                Chave comprometida ou suspeita de invasão?
              </span>
              <a
                href="https://mistertick.com/license?action=rotate"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors"
              >
                <span>Gerar Nova Chave</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
