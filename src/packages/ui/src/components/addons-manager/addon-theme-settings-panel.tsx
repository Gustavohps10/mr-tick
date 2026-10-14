'use client'

import type { AddonManifestViewModel } from '@mr-tick/sdk'
import type { AddonThemeViewModel } from '@mr-tick/shared/view-models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Laptop,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
} from 'lucide-react'
import React from 'react'
import { toast } from 'sonner'

import { getThemeSwatches } from '@/components/settings/appearance-settings-tab'
import { useTheme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

export interface AddonThemeSettingsPanelProps {
  addonId: string
  addon?: AddonManifestViewModel | null
}

export function AddonThemeSettingsPanel({
  addonId,
  addon,
}: AddonThemeSettingsPanelProps) {
  const { theme, setTheme } = useTheme()
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const { data: activeThemeData } = useQuery({
    queryKey: ['addons', 'activeTheme'],
    queryFn: async () => {
      const res = await bridge.addons.getActiveTheme()
      if (!res.isSuccess) return null
      return res.data
    },
  })

  const { data: allThemes = [] } = useQuery<AddonThemeViewModel[]>({
    queryKey: ['addons', 'themes'],
    queryFn: async () => {
      if (!bridge.addons.listThemes) return []
      const res = await bridge.addons.listThemes()
      if (!res.isSuccess) return []
      return res.data ?? []
    },
  })

  const matchedTheme = React.useMemo(() => {
    return (
      allThemes.find(
        (t) =>
          t.id === addonId ||
          t.id.startsWith(`${addonId}:`) ||
          (activeThemeData &&
            (t.id === activeThemeData.id ||
              activeThemeData.id.startsWith(`${t.id}:`))),
      ) ?? null
    )
  }, [allThemes, addonId, activeThemeData])

  const isCurrentActive = Boolean(
    activeThemeData &&
    (activeThemeData.id === addonId ||
      activeThemeData.id.startsWith(`${addonId}:`) ||
      (matchedTheme && activeThemeData.id === matchedTheme.id)),
  )

  const swatches = React.useMemo(() => {
    const themeCss = matchedTheme?.css || activeThemeData?.css
    return getThemeSwatches(matchedTheme?.id || addonId, themeCss)
  }, [addonId, matchedTheme, activeThemeData])

  const handleApplyTheme = async () => {
    try {
      const themeIdToSet = matchedTheme?.id || addonId
      await bridge.addons.setActiveTheme({ body: { themeId: themeIdToSet } })
      await queryClient.invalidateQueries({
        queryKey: ['addons', 'activeTheme'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['addons', 'themes'],
      })
      toast.success(`Tema ${addon?.name || addonId} aplicado com sucesso!`)
    } catch {
      toast.error('Erro ao aplicar tema.')
    }
  }

  const handleResetToNative = async () => {
    try {
      await bridge.addons.setActiveTheme({ body: { themeId: null } })
      await queryClient.invalidateQueries({
        queryKey: ['addons', 'activeTheme'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['addons', 'themes'],
      })
      toast.success('Tema nativo restaurado com sucesso.')
    } catch {
      toast.error('Erro ao restaurar tema nativo.')
    }
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="w-full space-y-6 px-8 py-6">
        {/* Card de Visão Geral do Tema */}
        <div className="bg-card/70 border-border/70 overflow-hidden rounded-lg border p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Palette className="text-primary size-5" />
                <h3 className="text-foreground text-sm font-semibold">
                  {addon?.name || addonId} Visual Theme
                </h3>
                {isCurrentActive ? (
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary font-mono text-[10px]"
                  >
                    <Sparkles className="mr-1 size-3" /> Em Uso
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-500"
                  >
                    <Check className="mr-1 size-3" /> Instalado
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Este addon disponibiliza estilos, paleta de cores e componentes
                visuais personalizados para a interface do Mr. Tick.
              </p>
            </div>

            {isCurrentActive ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetToNative}
                className="h-8 shrink-0 cursor-pointer gap-1.5 px-3 text-xs font-semibold"
              >
                <RotateCcw className="size-3.5" />
                Restaurar Nativo
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleApplyTheme}
                className="h-8 shrink-0 cursor-pointer gap-1.5 px-3 text-xs font-semibold"
              >
                <Sparkles className="size-3.5" />
                Aplicar Tema
              </Button>
            )}
          </div>

          {/* Amostras de Cores / Prévia */}
          <div className="border-border/50 bg-muted/20 mt-5 rounded-md border p-4">
            <h4 className="text-muted-foreground/80 text-[11px] font-bold tracking-wider uppercase">
              Paleta de Cores do Tema
            </h4>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <div
                  className="h-10 w-full rounded-md border border-black/10 shadow-2xs dark:border-white/10"
                  style={{ backgroundColor: swatches[0] || 'var(--primary)' }}
                />
                <span className="text-muted-foreground block text-center text-[10px] font-medium">
                  Primária
                </span>
              </div>
              <div className="space-y-1.5">
                <div
                  className="h-10 w-full rounded-md border border-black/10 shadow-2xs dark:border-white/10"
                  style={{ backgroundColor: swatches[1] || 'var(--secondary)' }}
                />
                <span className="text-muted-foreground block text-center text-[10px] font-medium">
                  Secundária
                </span>
              </div>
              <div className="space-y-1.5">
                <div
                  className="h-10 w-full rounded-md border border-black/10 shadow-2xs dark:border-white/10"
                  style={{ backgroundColor: swatches[2] || 'var(--accent)' }}
                />
                <span className="text-muted-foreground block text-center text-[10px] font-medium">
                  Acento
                </span>
              </div>
              <div className="space-y-1.5">
                <div
                  className="h-10 w-full rounded-md border border-black/10 shadow-2xs dark:border-white/10"
                  style={{ backgroundColor: swatches[3] || 'var(--card)' }}
                />
                <span className="text-muted-foreground block text-center text-[10px] font-medium">
                  Superfície
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modo de Exibição */}
        <div className="bg-card/70 border-border/70 rounded-lg border p-5 shadow-xs">
          <div className="border-border/40 flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <h4 className="text-foreground text-sm font-semibold">
                Modo de Exibição
              </h4>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Selecione o esquema de luminosidade padrão do aplicativo.
              </p>
            </div>

            <div className="bg-muted/60 border-border/40 flex shrink-0 items-center gap-1.5 rounded-md border p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTheme('light')}
                className={cn(
                  'h-7 cursor-pointer gap-1.5 px-2.5 text-xs',
                  theme === 'light' &&
                    'bg-background text-foreground font-semibold shadow-xs',
                )}
              >
                <Sun className="size-3.5" />
                <span>Claro</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTheme('dark')}
                className={cn(
                  'h-7 cursor-pointer gap-1.5 px-2.5 text-xs',
                  theme === 'dark' &&
                    'bg-background text-foreground font-semibold shadow-xs',
                )}
              >
                <Moon className="size-3.5" />
                <span>Escuro</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTheme('system')}
                className={cn(
                  'h-7 cursor-pointer gap-1.5 px-2.5 text-xs',
                  theme === 'system' &&
                    'bg-background text-foreground font-semibold shadow-xs',
                )}
              >
                <Laptop className="size-3.5" />
                <span>Sistema</span>
              </Button>
            </div>
          </div>

          <div className="text-muted-foreground pt-4 text-xs leading-relaxed">
            As variáveis do tema são injetadas dinamicamente e respeitam a
            densidade e o modo claro/escuro configurados.
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
