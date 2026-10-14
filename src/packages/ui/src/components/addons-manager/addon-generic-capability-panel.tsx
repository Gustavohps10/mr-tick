'use client'

import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { Calendar, Check, Clock, GlobeIcon, Sliders } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'

export interface AddonCapabilityPanelProps {
  addonId: string
  addon?: AddonManifestViewModel | null
  capability: 'watchers' | 'calendars' | 'punch' | string
}

const CAPABILITY_INFO: Record<
  string,
  {
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    feature1Title: string
    feature1Desc: string
    feature2Title: string
    feature2Desc: string
  }
> = {
  watchers: {
    title: 'Observador de Atividades',
    description:
      'Monitora eventos, chamadas e alterações em tempo real para sincronização contínua.',
    icon: GlobeIcon,
    feature1Title: 'Sincronização em Segundo Plano',
    feature1Desc:
      'Permite que o addon escute chamadas mesmo com a janela minimizada.',
    feature2Title: 'Notificações de Atividade',
    feature2Desc:
      'Exibe alertas quando novas tarefas ou apontamentos forem detectados.',
  },
  calendars: {
    title: 'Integração com Calendários',
    description:
      'Sincroniza agendas, reuniões e eventos para sugestão automática de apontamentos.',
    icon: Calendar,
    feature1Title: 'Sincronização Bidirecional',
    feature1Desc:
      'Mantém eventos da agenda alinhados com suas entradas de tempo.',
    feature2Title: 'Sugestão Inteligente',
    feature2Desc:
      'Preenche títulos de atividades baseado no compromisso da agenda.',
  },
  punch: {
    title: 'Ponto Eletrônico & Jornada',
    description:
      'Controle legal de jornada de trabalho, espelho de ponto e exportação compatível.',
    icon: Clock,
    feature1Title: 'Cálculo de Saldo Diário',
    feature1Desc:
      'Compara as horas apontadas com a meta de jornada cadastrada.',
    feature2Title: 'Avisos de Intervalo',
    feature2Desc: 'Alerta sobre horários mínimos de intervalo intrajornada.',
  },
}

export function AddonGenericCapabilityPanel({
  addonId,
  addon,
  capability,
}: AddonCapabilityPanelProps) {
  const [feature1, setFeature1] = useState(true)
  const [feature2, setFeature2] = useState(true)

  const info = CAPABILITY_INFO[capability] ?? {
    title: 'Configurações da Capacidade',
    description: 'Parâmetros específicos fornecidos por esta extensão.',
    icon: Sliders,
    feature1Title: 'Habilitar Funcionalidade',
    feature1Desc: 'Ativa o processamento desta capacidade no aplicativo.',
    feature2Title: 'Notificações',
    feature2Desc: 'Receber alertas sobre atualizações desta capacidade.',
  }

  const Icon = info.icon

  const handleSave = () => {
    toast.success('Preferências da capacidade salvas com sucesso!')
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="w-full space-y-6 px-8 py-6">
        {/* Status Card */}
        <div className="bg-card/70 border-border/70 overflow-hidden rounded-lg border p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="text-primary size-5" />
                <h3 className="text-foreground text-sm font-semibold">
                  {info.title}
                </h3>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-500"
                >
                  <Check className="mr-1 size-3" /> Módulo Ativo
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {info.description}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              className="h-7 shrink-0 cursor-pointer px-2.5 text-xs"
            >
              Salvar
            </Button>
          </div>
        </div>

        {/* Toggles e Configurações */}
        <div className="bg-card/70 border-border/70 rounded-lg border p-5 shadow-xs">
          <h4 className="text-foreground mb-4 text-sm font-semibold">
            Parâmetros de Execução
          </h4>

          <div className="space-y-4">
            <div className="border-border/40 flex items-center justify-between gap-4 border-b pb-3.5">
              <div className="space-y-0.5">
                <span className="text-foreground text-xs font-medium">
                  {info.feature1Title}
                </span>
                <p className="text-muted-foreground text-[11px]">
                  {info.feature1Desc}
                </p>
              </div>
              <Switch checked={feature1} onCheckedChange={setFeature1} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-foreground text-xs font-medium">
                  {info.feature2Title}
                </span>
                <p className="text-muted-foreground text-[11px]">
                  {info.feature2Desc}
                </p>
              </div>
              <Switch checked={feature2} onCheckedChange={setFeature2} />
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
