import type { AddonManifestViewModel } from '@mr-tick/sdk'
import type { AddonThemeViewModel } from '@mr-tick/shared/view-models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronsUpDown,
  Laptop,
  Moon,
  Palette,
  RotateCcw,
  Sun,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { addonMatchesCategory } from '@/components/addons-manager/addons-manager-view'
import { useTheme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { cn } from '@/lib/utils'

export function getThemeSwatches(themeId: string, css?: string): string[] {
  if (css) {
    const primaryMatch = css.match(/--primary:\s*([^;]+);/)
    const bgMatch = css.match(/--background:\s*([^;]+);/)
    const secondaryMatch = css.match(/--secondary:\s*([^;]+);/)
    const accentMatch = css.match(/--accent:\s*([^;]+);/)

    const extracted: string[] = []
    if (primaryMatch) extracted.push(primaryMatch[1].trim())
    if (secondaryMatch) extracted.push(secondaryMatch[1].trim())
    if (accentMatch) extracted.push(accentMatch[1].trim())
    if (bgMatch) extracted.push(bgMatch[1].trim())

    if (extracted.length >= 2) {
      return extracted.slice(0, 4)
    }
  }

  const lower = themeId.toLowerCase()
  if (lower.includes('matrix')) {
    return ['#00ff66', '#0d1117', '#161b22', '#238636']
  }
  if (lower.includes('redmine')) {
    return [
      'oklch(0.5694 0.0883 252.6151)',
      'oklch(0.9731 0 0)',
      'oklch(0.9491 0 0)',
      'oklch(1 0 0)',
    ]
  }
  if (lower.includes('caffeine')) {
    return ['#e6d5c3', '#6f4e37', '#2b1b17', '#d7b899']
  }
  if (lower.includes('cuphead')) {
    return ['#e83127', '#252525', '#f8ecc2', '#f3a63b']
  }
  if (lower.includes('purple')) {
    return ['#a855f7', '#7c3aed', '#1e1b4b', '#f3e8ff']
  }
  if (lower.includes('supabase')) {
    return ['#3ecf8e', '#1c1c1c', '#242424', '#171717']
  }
  if (lower.includes('amber')) {
    return ['#f59e0b', '#d97706', '#78350f', '#1c1917']
  }
  if (lower.includes('cyberpunk')) {
    return ['#ff007f', '#00f0ff', '#2d006b', '#050505']
  }
  if (lower.includes('catppuccin')) {
    return ['#cba6f7', '#89dceb', '#313244', '#1e1e2e']
  }
  if (lower.includes('mono')) {
    return ['#ffffff', '#737373', '#262626', '#0a0a0a']
  }

  return ['#ffffff', '#0f172a', '#3b82f6', '#94a3b8']
}

export function ThemeColorSwatches({ swatches }: { swatches: string[] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {swatches.map((color, idx) => (
        <span
          key={idx}
          className="size-2.5 rounded-[2px] border border-black/15 shadow-2xs dark:border-white/20"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}

export function AppearanceSettingsTab() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const [useAnimations, setUseAnimations] = React.useState(true)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const { data: activeThemeData } = useQuery({
    queryKey: ['addons', 'activeTheme'],
    queryFn: async () => {
      const res = await bridge.addons.getActiveTheme()
      if (!res.isSuccess) return null
      return res.data
    },
  })

  const { data: registeredThemes = [] } = useQuery<AddonThemeViewModel[]>({
    queryKey: ['addons', 'themes'],
    queryFn: async () => {
      if (!bridge.addons.listThemes) return []
      const res = await bridge.addons.listThemes()
      if (!res.isSuccess) return []
      return res.data ?? []
    },
  })

  const { data: installedAddons = [] } = useQuery<AddonManifestViewModel[]>({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess) return []
      return res.data ?? []
    },
  })

  const themeAddons = useMemo(
    () => installedAddons.filter((a) => addonMatchesCategory(a, 'theme')),
    [installedAddons],
  )

  const availableThemeOptions = useMemo(() => {
    const list: Array<{
      id: string
      name: string
      subtitle?: string
      css?: string
    }> = []
    const seenIds = new Set<string>()

    for (const rt of registeredThemes) {
      seenIds.add(rt.id)
      list.push({
        id: rt.id,
        name: rt.name,
        subtitle: rt.description,
        css: rt.css,
      })
    }

    for (const addon of themeAddons) {
      const alreadyHas = Array.from(seenIds).some(
        (id) => id === addon.id || id.startsWith(`${addon.id}:`),
      )
      if (alreadyHas) continue
      seenIds.add(addon.id)
      list.push({
        id: addon.id,
        name: addon.name,
        subtitle: `v${addon.version}`,
      })
    }

    return list
  }, [registeredThemes, themeAddons])

  const activeValue = useMemo(() => {
    if (!activeThemeData) return 'native'
    const currentId = activeThemeData.id
    if (!currentId) return 'native'

    const exact = availableThemeOptions.find((opt) => opt.id === currentId)
    if (exact) return exact.id

    const byPrefix = availableThemeOptions.find(
      (opt) =>
        currentId.startsWith(`${opt.id}:`) ||
        opt.id.startsWith(`${currentId}:`),
    )
    if (byPrefix) return byPrefix.id

    return currentId
  }, [activeThemeData, availableThemeOptions])

  const activeThemeName = useMemo(() => {
    if (activeValue === 'native') return 'Default (Padrão Mr. Tick)'
    const match = availableThemeOptions.find((opt) => opt.id === activeValue)
    if (match) return match.name
    return activeValue
  }, [activeValue, availableThemeOptions])

  const activeSwatches = useMemo(() => {
    if (activeValue === 'native') {
      return ['#ffffff', '#0f172a', '#3b82f6', '#94a3b8']
    }
    const match = availableThemeOptions.find((opt) => opt.id === activeValue)
    return getThemeSwatches(activeValue, match?.css)
  }, [activeValue, availableThemeOptions])

  const handleThemePackageChange = async (value: string) => {
    try {
      if (value === 'native') {
        await bridge.addons.setActiveTheme({ body: { themeId: null } })
        await queryClient.invalidateQueries({
          queryKey: ['addons', 'activeTheme'],
        })
        toast.success('Tema nativo do Mr. Tick restaurado.')
        return
      }

      await bridge.addons.setActiveTheme({ body: { themeId: value } })
      await queryClient.invalidateQueries({
        queryKey: ['addons', 'activeTheme'],
      })
      const selected = availableThemeOptions.find((opt) => opt.id === value)
      toast.success(`Tema ${selected?.name || value} aplicado com sucesso!`)
    } catch {
      toast.error('Erro ao alternar tema.')
    }
  }

  const handleResetToNative = () => {
    void handleThemePackageChange('native')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* Seletor de Pacote de Tema Visual */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Palette className="text-primary size-4" />
              <h4 className="text-foreground text-sm font-medium">
                Pacote de Tema Visual
              </h4>
              {activeValue !== 'native' && (
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 text-primary font-mono text-[10px]"
                >
                  Personalizado
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Alterne entre a identidade visual nativa do Mr. Tick e temas
              fornecidos por addons instalados.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  data-testid="theme-package-select"
                  className="h-8 min-w-[220px] justify-between gap-2 px-2.5 text-xs font-normal"
                >
                  <div className="flex items-center gap-2 truncate">
                    <ThemeColorSwatches swatches={activeSwatches} />
                    <span className="truncate">{activeThemeName}</span>
                  </div>
                  <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="end">
                <Command>
                  <CommandInput
                    placeholder="Pesquisar temas..."
                    className="h-9 text-xs"
                  />
                  <div className="border-border/40 text-muted-foreground flex items-center justify-between border-b px-3 py-1.5 font-mono text-[11px]">
                    <span>
                      {availableThemeOptions.length + 1} temas disponíveis
                    </span>
                  </div>
                  <CommandList className="max-h-[260px]">
                    <CommandEmpty className="text-muted-foreground py-4 text-center text-xs">
                      Nenhum tema encontrado.
                    </CommandEmpty>

                    <CommandGroup heading="Built-in Themes">
                      <CommandItem
                        value="native default padrao"
                        onSelect={() => {
                          void handleThemePackageChange('native')
                          setPopoverOpen(false)
                        }}
                        data-testid="theme-option-native"
                        className="flex cursor-pointer items-center justify-between py-1.5 font-mono text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ThemeColorSwatches
                            swatches={[
                              '#ffffff',
                              '#0f172a',
                              '#3b82f6',
                              '#94a3b8',
                            ]}
                          />
                          <span className="truncate">Default</span>
                        </div>
                        {activeValue === 'native' && (
                          <Check className="text-primary ml-auto size-3.5 shrink-0" />
                        )}
                      </CommandItem>
                    </CommandGroup>

                    {availableThemeOptions.length > 0 && (
                      <CommandGroup heading="Installed Addon Themes">
                        {availableThemeOptions.map((opt) => (
                          <CommandItem
                            key={opt.id}
                            value={`${opt.name} ${opt.id}`}
                            onSelect={() => {
                              void handleThemePackageChange(opt.id)
                              setPopoverOpen(false)
                            }}
                            data-testid={`theme-option-${opt.id}`}
                            className="flex cursor-pointer items-center justify-between py-1.5 font-mono text-xs"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <ThemeColorSwatches
                                swatches={getThemeSwatches(opt.id, opt.css)}
                              />
                              <span className="truncate">{opt.name}</span>
                            </div>
                            {activeValue === opt.id && (
                              <Check className="text-primary ml-auto size-3.5 shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {activeValue !== 'native' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetToNative}
                className="h-8 cursor-pointer gap-1 px-2 text-xs"
                title="Voltar para o tema nativo"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">Restaurar Nativo</span>
              </Button>
            )}
          </div>
        </div>

        {/* Modo de Luminosidade */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Modo de Luminosidade
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Escolha entre aparência clara, escura ou sincronizada com o
              sistema.
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

        {/* Densidade */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Densidade da Interface
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Ajusta o espaçamento entre linhas e tabelas para maior densidade
              de dados.
            </p>
          </div>
          <div className="shrink-0">
            <Select defaultValue="default">
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Densidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compacta</SelectItem>
                <SelectItem value="default">Padrão</SelectItem>
                <SelectItem value="comfortable">Confortável</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Animações e Transições */}
        <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3.5">
          <div className="min-w-0 flex-1">
            <h4 className="text-foreground text-sm font-medium">
              Animações e Efeitos
            </h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Habilita transições suaves em transições de abas e modais.
            </p>
          </div>
          <div className="shrink-0">
            <Switch
              checked={useAnimations}
              onCheckedChange={setUseAnimations}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
