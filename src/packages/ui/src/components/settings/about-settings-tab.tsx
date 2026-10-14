import { ExternalLink, Sparkles } from 'lucide-react'
import React, { useState } from 'react'

import { useLicensingState } from '@/components/addons-manager/license-settings-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useHostBridge } from '@/hooks'
import { useSettingsModalStore } from '@/stores/settingsModalStore'
import { useUpdaterStore } from '@/stores/updaterStore'

export function AboutSettingsTab() {
  const bridge = useHostBridge()
  const { setActiveTab } = useSettingsModalStore()
  const {
    version,
    isPortable,
    allowBeta,
    setAllowBeta,
    setUpdaterState,
    setShowModal,
    setErrorMessage,
  } = useUpdaterStore()
  const { data: licenseState } = useLicensingState()

  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true)
  const [language, setLanguage] = useState('pt-BR')

  const handleToggleBeta = async (checked: boolean) => {
    setAllowBeta(checked)
    const settings = await bridge.system.getSettings()
    await bridge.system.saveSettings({
      ...settings,
      allowBeta: checked,
    })
  }

  const handleCheckUpdates = async () => {
    setUpdaterState('checking')
    setShowModal(true)
    try {
      await bridge.updater.checkForUpdates()
    } catch (error) {
      setUpdaterState('error')
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const isPlusActive = Boolean(licenseState?.isPlusActive)

  return (
    <div className="space-y-6">
      {/* Seção Versão / Sobre */}
      <div className="space-y-1">
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-foreground text-sm font-medium">
                Versão {version || '1.0.0'}
              </h4>
              <Badge
                variant="outline"
                className="px-1.5 py-0 font-mono text-[10px]"
              >
                {isPortable ? 'Portable' : 'Instalador'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Versão do instalador: {version || '1.0.0'} · Mr. Tick (Open Core)
            </p>
            <a
              href="https://github.com/gustavohps10/mr-tick/releases"
              target="_blank"
              rel="noreferrer"
              className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
            >
              <span>Leia o que mudou</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdates}
              className="h-8 cursor-pointer text-xs"
            >
              Procurar por atualizações
            </Button>
          </div>
        </div>

        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-sm font-medium">
              Atualizar automaticamente
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Permite que o aplicativo verifique silenciosamente novas versões
              ao iniciar.
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={autoCheckUpdates}
              onCheckedChange={setAutoCheckUpdates}
            />
          </div>
        </div>

        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-sm font-medium">
              Canal Beta
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Receba acesso antecipado a novas funcionalidades e correções de
              bugs.
            </p>
          </div>
          <div className="shrink-0">
            <Switch checked={allowBeta} onCheckedChange={handleToggleBeta} />
          </div>
        </div>

        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-sm font-medium">Idioma</div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Alterar o idioma de exibição do Mr. Tick.
            </p>
          </div>
          <div className="shrink-0">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Selecione o idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português do Brasil</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-sm font-medium">
              Obter ajuda
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Documentação oficial, atalhos de teclado e comunidade.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 cursor-pointer text-xs"
            >
              <a
                href="https://github.com/gustavohps10/mr-tick"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <span>Abrir</span>
                <ExternalLink className="size-3" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Seção Conta e Licença */}
      <div className="space-y-2 pt-2">
        <h3 className="text-foreground text-sm font-semibold">
          Conta & Licença
        </h3>

        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground text-sm font-medium">
                Plano Atual
              </span>
              {isPlusActive ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                >
                  <Sparkles className="mr-1 size-3" />
                  Mr. Tick Plus Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Plano Gratuito (Open Core)
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {isPlusActive
                ? `Licença vinculada a este dispositivo. Validade e chave ativas.`
                : 'Você está no modo gratuito local. Assine o Mr. Tick Plus para desbloquear recursos avançados.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isPlusActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('license')}
                className="h-8 cursor-pointer text-xs"
              >
                Gerenciar Licença
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('license')}
                  className="h-8 cursor-pointer text-xs"
                >
                  Ativar Chave
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="h-8 cursor-pointer text-xs font-semibold"
                >
                  <a
                    href="https://mistertick.com/license?action=checkout"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Comprar Plus
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
