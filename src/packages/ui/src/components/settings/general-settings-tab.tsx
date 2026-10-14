import React, { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export function GeneralSettingsTab() {
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [launchAtStartup, setLaunchAtStartup] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(true)
  const [timeFormat, setTimeFormat] = useState('24h')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* Iniciar com o Sistema */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Inicialização Automática
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Iniciar o Mr. Tick automaticamente quando o sistema operacional
              for iniciado.
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={launchAtStartup}
              onCheckedChange={setLaunchAtStartup}
            />
          </div>
        </div>

        {/* Minimizar para a bandeja */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Minimizar para a Bandeja
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Ao fechar a janela, manter o aplicativo executando em segundo
              plano no system tray.
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />
          </div>
        </div>

        {/* Formato de Hora */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Formato de Exibição de Horas
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Padrão para exibição de horários em apontamentos e relatórios.
            </p>
          </div>
          <div className="shrink-0">
            <Select value={timeFormat} onValueChange={setTimeFormat}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Formato de hora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 horas (14:30)</SelectItem>
                <SelectItem value="12h">12 horas (02:30 PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Confirmação de exclusão */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Confirmar Exclusão de Apontamentos
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Exibir caixa de confirmação antes de remover qualquer apontamento
              de tempo.
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={confirmDelete}
              onCheckedChange={setConfirmDelete}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
