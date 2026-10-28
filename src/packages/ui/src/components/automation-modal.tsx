'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  ChevronRight,
  CircleStop,
  DatabaseZap,
  MoveRight,
  Plus,
  RefreshCw,
  Rocket,
  Settings2,
  SquarePlus,
  Timer,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import React, { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAutomations } from '@/hooks/use-automations'
import { cn } from '@/lib/utils'
import { AutomationRxDBDTO } from '@/local-db/schemas/automations-schema'
import { SyncMetadataRxDBDTO } from '@/local-db/schemas/metadata-sync-schema'
import { useSyncStore } from '@/stores/syncStore'

const TRIGGERS = [
  {
    id: 'onRuleEnabled',
    label: 'Salvar Regra',
    icon: DatabaseZap,
    desc: 'Executa imediatamente após o salvamento da regra',
  },
  {
    id: 'onTaskUpdated',
    label: 'Atualização de Tarefa',
    icon: RefreshCw,
    desc: 'Ativa quando o status ou campos da tarefa mudam localmente',
  },
  {
    id: 'onEnterColumn',
    label: 'Entrada na coluna',
    icon: ArrowRightLeft,
    desc: 'Ativa ao mover um card para esta coluna',
  },
  {
    id: 'onLeaveColumn',
    label: 'Saída da coluna',
    icon: ArrowRightLeft,
    desc: 'Ativa ao tirar um card desta coluna',
  },
  {
    id: 'onTaskSynced',
    label: 'Sincronização (Pull)',
    icon: Rocket,
    desc: 'Ativa no lote de novas tarefas vindas do servidor',
  },
]

const TASK_FIELD_OPTIONS = [
  { id: 'status.id', label: 'Status', metadataKey: 'taskStatuses' },
  { id: 'priority.id', label: 'Prioridade', metadataKey: 'taskPriorities' },
  { id: 'tracker.id', label: 'Tracker', metadataKey: 'trackStatuses' },
]

const ACTION_TYPES = [
  {
    id: 'startTimer',
    label: 'Iniciar Timer',
    icon: Timer,
    color: 'text-emerald-500',
  },
  {
    id: 'stopTimer',
    label: 'Parar Timer',
    icon: CircleStop,
    color: 'text-rose-500',
  },
  {
    id: 'moveToColumn',
    label: 'Mover p/ Coluna',
    icon: MoveRight,
    color: 'text-blue-500',
  },
  {
    id: 'createCard',
    label: 'Criar Card',
    icon: SquarePlus,
    color: 'text-orange-500',
  },
]

interface Props {
  workspaceId: string
  columnId: string
  allColumns: any[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AutomationModal({
  workspaceId,
  columnId,
  allColumns,
  open,
  onOpenChange,
}: Props) {
  const [editing, setEditing] = useState<Partial<AutomationRxDBDTO> | null>(
    null,
  )
  const db = useSyncStore((s) => s.db)

  const {
    automations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    runAutomation,
  } = useAutomations(workspaceId)

  const columnAutomations = automations.filter((a) => a.columnId === columnId)
  const currentColumn = allColumns.find((c) => c.id === columnId)

  const { data: metadata } = useSuspenseQuery({
    queryKey: ['metadata'],
    queryFn: async () => {
      const doc = await db?.metadata.findOne().exec()
      return doc ? (doc.toJSON() as SyncMetadataRxDBDTO) : null
    },
  })

  const handleSave = async () => {
    if (!editing?.name) return
    const payload = { ...editing, columnId, workspaceId } as AutomationRxDBDTO

    try {
      if (editing._id) {
        await updateAutomation({ id: editing._id, patch: payload })
      } else {
        await createAutomation(payload)
      }

      // Se o trigger for de ativação imediata, delegamos a execução para o hook
      if (payload.trigger === 'onRuleEnabled' && payload.enabled) {
        await runAutomation(payload)
      }

      setEditing(null)
    } catch (error) {
      toast.error('Erro ao salvar automação.')
    }
  }

  const handleCancelEdit = () => setEditing(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background flex max-h-[90vh] max-w-2xl flex-col overflow-hidden border-none p-0 shadow-2xl">
        <DialogHeader className="bg-muted/20 border-b p-6">
          <div className="text-primary mb-1 flex items-center gap-2">
            <Zap className="h-5 w-5 fill-current" />
            <DialogTitle className="text-foreground text-xl font-bold tracking-tight">
              Automações:{' '}
              <span className="text-foreground">{currentColumn?.name}</span>
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground/80 text-xs font-medium">
            Workflow automático para processamento local de dados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 scrollbar-thin overflow-y-auto p-6">
          {!editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                  Regras da Coluna
                </h3>
                <Button
                  onClick={() =>
                    setEditing({
                      name: '',
                      trigger: 'onRuleEnabled',
                      conditions: [],
                      actions: [{ type: 'createCard', params: {} }],
                      enabled: true,
                    })
                  }
                  size="sm"
                  className="h-8 gap-1.5 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Nova Regra
                </Button>
              </div>
              <div className="grid gap-3">
                {columnAutomations.length === 0 && (
                  <div className="bg-muted/5 text-muted-foreground flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 opacity-60">
                    <Zap className="mb-4 h-10 w-10 opacity-30" />
                    <p className="text-sm">
                      Nenhuma regra ativa para esta coluna.
                    </p>
                  </div>
                )}
                {columnAutomations.map((auto) => (
                  <div
                    key={auto.id}
                    className="group bg-card hover:border-primary/40 text-foreground flex items-center justify-between rounded-xl border p-4 shadow-sm transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight">
                          {auto.name}
                        </span>
                        {!auto.enabled && (
                          <Badge
                            variant="outline"
                            className="h-4 text-[9px] uppercase opacity-50"
                          >
                            Inativa
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
                        <span className="bg-muted flex items-center gap-1 rounded px-1.5 py-0.5">
                          {React.createElement(
                            TRIGGERS.find((t) => t.id === auto.trigger)?.icon ||
                              Rocket,
                            { className: 'w-3 h-3' },
                          )}
                          {TRIGGERS.find((t) => t.id === auto.trigger)?.label}
                        </span>
                        <ChevronRight className="h-3 w-3 opacity-30" />
                        <span className="text-primary/80 font-medium">
                          {auto.actions.length} ações
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Switch
                        checked={auto.enabled}
                        onCheckedChange={(v) =>
                          updateAutomation({
                            id: auto._id,
                            patch: { enabled: v },
                          })
                        }
                        className="scale-75"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditing(auto)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 h-8 w-8"
                        onClick={() => deleteAutomation(auto._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 text-foreground space-y-8">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground px-1 text-[10px] font-bold tracking-widest uppercase">
                    Título
                  </Label>
                  <Input
                    value={editing.name}
                    className="bg-muted/40 focus-visible:ring-primary/40 h-12 border-none text-lg focus-visible:ring-1"
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    placeholder="Ex: Puxar validadas"
                  />
                </div>
                <div className="bg-muted/20 space-y-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Zap className="text-primary h-4 w-4" /> Quando acontecer...
                  </div>
                  <Select
                    value={editing.trigger}
                    onValueChange={(v: any) =>
                      setEditing({ ...editing, trigger: v })
                    }
                  >
                    <SelectTrigger
                      style={{ padding: '24px 8px' }}
                      className="bg-background border-border/60 h-auto w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      {TRIGGERS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex flex-col items-start">
                            <div className="flex items-center gap-2 font-semibold">
                              <t.icon className="text-primary h-3.5 w-3.5" />
                              <span className="text-sm">{t.label}</span>
                            </div>
                            <span className="ml-5 text-[10px] opacity-60">
                              {t.desc}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <Label className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                    Se (Condições)
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary h-7 text-[11px]"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        conditions: [
                          ...(editing.conditions || []),
                          { field: 'status.id', operator: 'equals', value: '' },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" /> Condição
                  </Button>
                </div>
                <div className="space-y-2">
                  {editing.conditions?.map((cond, i) => {
                    const config = TASK_FIELD_OPTIONS.find(
                      (f) => f.id === cond.field,
                    )
                    const options = config
                      ? (metadata as any)?.[config.metadataKey] || []
                      : []
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="bg-muted/40 grid flex-1 grid-cols-2 gap-2 rounded-lg border border-transparent p-2">
                          <Select
                            value={cond.field}
                            onValueChange={(v) => {
                              const newConds = [...(editing.conditions || [])]
                              newConds[i] = {
                                ...newConds[i],
                                field: v,
                                value: '',
                              }
                              setEditing({ ...editing, conditions: newConds })
                            }}
                          >
                            <SelectTrigger className="bg-background h-8 border-none text-xs font-medium">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_FIELD_OPTIONS.map((f) => (
                                <SelectItem
                                  key={f.id}
                                  value={f.id}
                                  className="text-xs"
                                >
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={cond.value}
                            onValueChange={(v) => {
                              const newConds = [...(editing.conditions || [])]
                              newConds[i] = { ...newConds[i], value: v }
                              setEditing({ ...editing, conditions: newConds })
                            }}
                          >
                            <SelectTrigger className="bg-background h-8 border-none text-xs font-medium">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((opt: any) => (
                                <SelectItem
                                  key={opt.id}
                                  value={opt.id}
                                  className="text-xs"
                                >
                                  {opt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-50 hover:opacity-100"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              conditions: editing.conditions?.filter(
                                (_, idx) => idx !== i,
                              ),
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="text-foreground space-y-4 pb-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <Label className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                    Então (Ações)
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary h-7 text-[11px]"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        actions: [
                          ...(editing.actions || []),
                          { type: 'startTimer', params: {} },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" /> Ação
                  </Button>
                </div>
                <div className="space-y-3">
                  {editing.actions?.map((act, i) => (
                    <div
                      key={i}
                      className="bg-primary/5 border-primary/10 space-y-3 rounded-2xl border p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Select
                          value={act.type}
                          onValueChange={(v: any) => {
                            const newActions = [...(editing.actions || [])]
                            newActions[i] = {
                              ...newActions[i],
                              type: v,
                              params: {},
                            }
                            setEditing({ ...editing, actions: newActions })
                          }}
                        >
                          <SelectTrigger className="bg-background border-border/40 h-9 font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPES.map((at) => (
                              <SelectItem key={at.id} value={at.id}>
                                <div className="flex items-center gap-2">
                                  <at.icon
                                    className={cn('h-3.5 w-3.5', at.color)}
                                  />
                                  {at.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-50"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              actions: editing.actions?.filter(
                                (_, idx) => idx !== i,
                              ),
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="px-1 text-[11px] italic opacity-60">
                        {act.type === 'createCard' &&
                          'Cria um card nesta coluna se a tarefa ainda não possuir um.'}
                        {act.type === 'startTimer' &&
                          'Inicia o cronômetro automaticamente.'}
                        {act.type === 'stopTimer' &&
                          'Para qualquer cronômetro ativo da tarefa.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {editing && (
          <div className="bg-muted/20 flex items-center justify-end gap-3 border-t p-6">
            <Button
              variant="ghost"
              onClick={handleCancelEdit}
              size="sm"
              className="text-foreground px-6 font-semibold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 font-bold shadow-lg"
            >
              Salvar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
