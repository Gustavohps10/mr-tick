'use client'

import { AddonInstaller, AddonManifest } from '@mr-tick/application'
import { IJobEvent } from '@mr-tick/shared/transport'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Check,
  CheckCircleIcon,
  Download,
  Loader2,
  Search,
  Star,
  StoreIcon,
  Terminal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHostBridge } from '@/hooks'
import { cn, queryClient } from '@/lib'

type LogEntry = {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: Date
}

type InstallationState = {
  progress: number
  message: string
  isDone: boolean
  isError: boolean
  logs: LogEntry[]
}

const formatDownloads = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

interface PluginListProps {
  selectedPluginId?: string
  onSelectDataSource: (plugin: AddonManifest | null) => void
  onModalOpenChange?: (open: boolean) => void
}

export function DataSourceList({
  selectedPluginId,
  onSelectDataSource,
  onModalOpenChange,
}: PluginListProps) {
  const bridge = useHostBridge()
  const logEndRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState('available')
  const [searchQuery, setSearchQuery] = useState('')
  const [installerData, setInstallerData] = useState<AddonInstaller | null>(
    null,
  )
  const [loadingInstaller, setLoadingInstaller] = useState(false)

  // Modais
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false)
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)

  const [selectedVersion, setSelectedVersion] = useState<string | undefined>(
    undefined,
  )
  const [activePlugin, setActivePlugin] = useState<AddonManifest | null>(null)

  const [installationStatus, setInstallationStatus] = useState<
    Record<string, InstallationState>
  >({})

  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: () => bridge.system.getAppVersion(),
    staleTime: Infinity,
  })

  const { data: installedPlugins = [], isLoading: loadingInstalled } = useQuery(
    {
      queryKey: ['plugins', 'installed'],
      queryFn: async () => {
        const response = await bridge.addons.listInstalled()

        if (!response.isSuccess) {
          toast.error(response.error ?? 'Falha ao carregar plugins instalados')
          return []
        }

        return response.data ?? []
      },
    },
  )

  const { data: availablePlugins = [], isLoading: loadingAvailable } = useQuery(
    {
      queryKey: ['plugins', 'available'],
      queryFn: async () => {
        const response = await bridge.addons.listAvailable()

        if (!response.isSuccess) {
          toast.error(response.error ?? 'Falha ao carregar plugins disponíveis')
          return []
        }

        return response.data ?? []
      },
    },
  )
  // Auto-scroll para os logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [installationStatus])

  const openInstallerModal = async (plugin: AddonManifest) => {
    setActivePlugin(plugin)
    setIsVersionModalOpen(true)
    onModalOpenChange?.(true)
    setLoadingInstaller(true)
    try {
      const response = await bridge.addons.getInstaller({
        body: { installerUrl: plugin.installerManifestUrl! },
      })

      if (!response.isSuccess)
        toast.error(response.error ?? 'Falha ao carregar pacotes de instalação')

      setInstallerData(response.data ?? null)
      const firstCompatible = response.data?.packages.find(
        (pkg) => pkg.requiredApiVersion === appVersion,
      )
      if (firstCompatible) setSelectedVersion(firstCompatible.version)
    } finally {
      setLoadingInstaller(false)
    }
  }

  const handleInstall = async () => {
    if (!installerData || !selectedVersion || !activePlugin) return
    const pkg = installerData.packages.find(
      (p) => p.version === selectedVersion,
    )
    if (!pkg) return

    const pluginId = activePlugin.id
    const downloadUrl = pkg.downloadUrl

    try {
      const result = await bridge.addons.install({
        body: { downloadUrl },
      })
      if (!result.isSuccess || !result.data?.jobId) return

      const jobId = result.data.jobId

      // Fecha seleção e abre console de logs
      setIsVersionModalOpen(false)
      setIsJobModalOpen(true)

      setInstallationStatus((prev) => ({
        ...prev,
        [pluginId]: {
          progress: 0,
          message: 'Iniciando engine...',
          isDone: false,
          isError: false,
          logs: [
            {
              id: 'start',
              message: `Iniciando instalação do plugin ${activePlugin.name}...`,
              type: 'info',
              timestamp: new Date(),
            },
          ],
        },
      }))

      const unsubscribe = bridge.events.on(jobId, (event: IJobEvent) => {
        setInstallationStatus((prev) => {
          const current = prev[pluginId]
          const logId = crypto.randomUUID()

          switch (event.status) {
            case 'progress':
              return {
                ...prev,
                [pluginId]: { ...current, progress: event.value },
              }

            case 'data':
              return {
                ...prev,
                [pluginId]: {
                  ...current,
                  message: event.data as string,
                  logs: [
                    ...current.logs,
                    {
                      id: logId,
                      message: event.data as string,
                      type: 'info',
                      timestamp: new Date(),
                    },
                  ],
                },
              }

            case 'done':
              unsubscribe()
              queryClient.invalidateQueries({ queryKey: ['plugins'] })
              return {
                ...prev,
                [pluginId]: {
                  ...current,
                  progress: 100,
                  isDone: true,
                  message: 'Sucesso!',
                  logs: [
                    ...current.logs,
                    {
                      id: logId,
                      message: 'Instalação finalizada com sucesso.',
                      type: 'success',
                      timestamp: new Date(),
                    },
                  ],
                },
              }

            case 'error':
              unsubscribe()
              return {
                ...prev,
                [pluginId]: {
                  ...current,
                  isDone: true,
                  isError: true,
                  message: 'Falha na instalação',
                  logs: [
                    ...current.logs,
                    {
                      id: logId,
                      message: `Erro fatal: ${event.error}`,
                      type: 'error',
                      timestamp: new Date(),
                    },
                  ],
                },
              }

            default:
              return prev
          }
        })
      })
    } catch (err) {
      console.error(err)
    }
  }

  const filterList = (list: AddonManifest[] | undefined) => {
    if (!list) return []
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
  }

  const renderPluginCard = (plugin: AddonManifest) => {
    const isSelected = selectedPluginId === plugin.id
    const installInfo = installationStatus[plugin.id]
    const isWorking = installInfo && !installInfo.isDone

    return (
      <Card
        key={plugin.id}
        onClick={() =>
          plugin.installed && onSelectDataSource(isSelected ? null : plugin)
        }
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 rounded-lg p-2 transition-all',
          isSelected ? 'bg-primary/5 ring-primary ring-1' : 'hover:bg-muted',
          isWorking && 'pointer-events-none opacity-70',
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-zinc-100 object-contain p-1 dark:bg-zinc-900">
          {plugin.logo ? (
            <img
              src={plugin.logo}
              alt={plugin.name}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xl">📦</span>
          )}
        </div>
        <div className="flex-1 space-y-0.5 overflow-hidden text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 overflow-hidden">
              <p className="text-foreground truncate text-sm font-bold">
                {plugin.name}
              </p>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                v{plugin.version}
              </span>
            </div>
            <div className="text-muted-foreground flex items-center gap-3 text-[10px] opacity-60">
              <div className="flex items-center gap-1">
                <Download className="h-3 w-3" />{' '}
                {formatDownloads(plugin.downloads)}
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />{' '}
                {plugin.stars}
              </div>
            </div>
          </div>
          <p className="text-muted-foreground line-clamp-2 text-xs leading-tight">
            {plugin.description}
          </p>
          <div className="flex items-end justify-between pt-1">
            <span className="text-foreground/70 text-[11px] font-semibold">
              <span className="text-muted-foreground font-normal">by</span>{' '}
              {plugin.creator}
            </span>
            <div className="w-32 text-right">
              {isWorking ? (
                <div className="text-primary flex animate-pulse items-center justify-end gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-[10px] font-bold">Instalando...</span>
                </div>
              ) : plugin.installed ? (
                <Button
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 rounded-md px-2 text-[10px] font-bold"
                  onClick={(e) => {
                    e.stopPropagation()
                    plugin.installed &&
                      onSelectDataSource(isSelected ? null : plugin)
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                >
                  {isSelected ? 'Selecionado' : 'Selecionar'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-7 rounded-md px-2 text-[10px] font-bold"
                  onClick={(e) => {
                    e.stopPropagation()
                    openInstallerModal(plugin)
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                  }}
                >
                  Instalar
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* MODAL 1: SELEÇÃO DE VERSÃO */}
      <Dialog
        open={isVersionModalOpen}
        onOpenChange={(open) => {
          setIsVersionModalOpen(open)
          if (!open && !isJobModalOpen) onModalOpenChange?.(false)
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Download className="text-primary h-5 w-5" />
              <span>Instalar {activePlugin?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Selecione a versão compatível com seu Mr-tick App.
            </DialogDescription>
          </DialogHeader>

          {loadingInstaller ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-xs font-medium">
                Buscando pacotes no repositório...
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-64 pr-3">
              <div className="flex flex-col gap-2">
                {installerData?.packages.map((pkg) => {
                  const isCompatible = pkg.requiredApiVersion === appVersion
                  const isSelected = selectedVersion === pkg.version
                  return (
                    <Card
                      key={pkg.version}
                      className={cn(
                        'relative cursor-pointer border-2 p-3 transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-muted-foreground/20 bg-muted/30 border-transparent',
                        !isCompatible &&
                          'cursor-not-allowed opacity-50 grayscale',
                      )}
                      onClick={() =>
                        isCompatible && setSelectedVersion(pkg.version)
                      }
                    >
                      <div className="mb-1 flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold">v{pkg.version}</p>
                          <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                            Required API: {pkg.requiredApiVersion}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[9px]">
                          {pkg.releaseDate}
                        </Badge>
                      </div>
                      <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-[11px]">
                        {pkg.changelog.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                      {isSelected && (
                        <Check className="text-primary absolute top-2 right-2 h-4 w-4" />
                      )}
                    </Card>
                  )
                })}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              disabled={!selectedVersion || loadingInstaller}
              onClick={handleInstall}
            >
              Confirmar e Instalar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CONSOLE DE INSTALAÇÃO (JOB LOGS) */}
      <Dialog
        open={isJobModalOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            activePlugin &&
            installationStatus[activePlugin.id]?.isDone
          ) {
            setIsJobModalOpen(false)
            onModalOpenChange?.(false)
          }
        }}
      >
        <DialogContent
          className="overflow-hidden border-none shadow-2xl sm:max-w-xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="p-6 pb-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <Terminal className="h-5 w-5 text-zinc-900 dark:text-zinc-600" />
                </div>
                <div>
                  <DialogTitle>Installation Console</DialogTitle>
                  <p className="text-muted-foreground font-mono text-xs">
                    {activePlugin?.id}@{selectedVersion}
                  </p>
                </div>
              </div>

              {activePlugin &&
                installationStatus[activePlugin.id]?.progress === 100 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'border font-bold',
                      installationStatus[activePlugin.id]?.logs?.some(
                        (l) => l.type === 'error',
                      )
                        ? 'border-red-400/20 bg-red-400/10 text-red-400'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                    )}
                  >
                    {installationStatus[activePlugin.id]?.logs?.some(
                      (l) => l.type === 'error',
                    )
                      ? 'Falha'
                      : 'Sucesso'}
                  </Badge>
                )}
            </div>

            <div className="mb-6 space-y-2">
              <div className="text-muted-foreground flex justify-between font-mono text-[10px] tracking-widest">
                <span>Progresso</span>
                <span>
                  {activePlugin
                    ? installationStatus[activePlugin.id]?.progress
                    : 0}
                  %
                </span>
              </div>
              <Progress
                value={
                  activePlugin
                    ? installationStatus[activePlugin.id]?.progress
                    : 0
                }
                className="h-2"
              />
            </div>

            <div className="border-border bg-card overflow-hidden rounded-lg border font-mono text-[11px]">
              <div className="border-border bg-muted flex items-center gap-2 border-b px-3 py-1.5">
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#FF5F57]" />
                  <div className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2 w-2 rounded-full bg-[#28C840]" />
                </div>
                <span className="text-muted-foreground text-[10px]">
                  output_logs.log
                </span>
              </div>

              <ScrollArea className="h-48 p-3">
                <div className="space-y-1">
                  {activePlugin &&
                    installationStatus[activePlugin.id]?.logs.map(
                      (log, index, arr) => {
                        const isLast = index === arr.length - 1
                        const hasError = arr.some((l) => l.type === 'error')

                        // Lógica para formatar a mensagem final se houver erro
                        const displayMessage =
                          isLast && hasError && log.type === 'success'
                            ? 'Ocorreram falhas durante o processamento.'
                            : log.message

                        const displayType =
                          isLast && hasError && log.type === 'success'
                            ? 'error' // Força a cor vermelha na mensagem final se o processo falhou
                            : log.type

                        return (
                          <div key={log.id} className="flex gap-2">
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
                                displayType === 'success'
                                  ? isLast
                                    ? 'font-bold text-emerald-500'
                                    : 'text-emerald-500/80'
                                  : displayType === 'error'
                                    ? isLast
                                      ? 'font-bold text-red-400'
                                      : 'text-red-400/80'
                                    : 'text-foreground/70',
                              )}
                            >
                              {displayType === 'error'
                                ? '✖'
                                : displayType === 'success'
                                  ? '✔'
                                  : '❯'}{' '}
                              {displayMessage}
                            </span>
                          </div>
                        )
                      },
                    )}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-4 pt-0">
            {activePlugin && installationStatus[activePlugin.id]?.isDone ? (
              <Button
                onClick={() => {
                  setIsJobModalOpen(false)
                  onModalOpenChange?.(false)
                }}
              >
                Ok
              </Button>
            ) : (
              <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* TABS E LISTAGEM */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex items-center border-b px-2 pt-2">
          <TabsList className="flex h-9 gap-0 bg-transparent p-0">
            {[
              { id: 'available', label: 'Marketplace', icon: StoreIcon },
              { id: 'installed', label: 'Instalados', icon: CheckCircleIcon },
            ].map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="group data-[state=active]:text-primary relative flex items-center gap-1.5 px-3 pt-2 pb-2 text-[11px] font-medium transition-all"
              >
                <tab.icon
                  size={12}
                  className="opacity-50 group-data-[state=active]:opacity-100"
                />
                {tab.label}
                {activeTab === tab.id && <TabsActiveIndicator />}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="relative ml-auto">
            <Search className="absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 opacity-40" />
            <Input
              placeholder="Procurar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-[160px] border-none bg-transparent pr-2 pl-7 text-[11px] focus-visible:ring-0"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 p-4">
            <TabsContent value="installed" className="m-0 space-y-2">
              {loadingInstalled ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                filterList(installedPlugins).map(renderPluginCard)
              )}
            </TabsContent>
            <TabsContent value="available" className="m-0 space-y-2">
              {loadingAvailable ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                filterList(availablePlugins).map((p) => {
                  const isInstalled = installedPlugins?.some(
                    (ip) => ip.id === p.id,
                  )
                  return renderPluginCard({ ...p, installed: !!isInstalled })
                })
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

function TabsActiveIndicator() {
  return (
    <motion.span
      layoutId="activeTabDataSource"
      className="bg-primary absolute bottom-0 left-0 h-[2px] w-full rounded-full"
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
    />
  )
}
