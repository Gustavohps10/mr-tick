import type { MetadataDTO, MetadataItem } from '@mr-tick/application'
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { DynamicIcon } from '@/components/mapping-config-modal'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useHostBridge } from '@/hooks/use-host-bridge'
import { useLocalMetadata } from '@/hooks/use-local-metadata'

const categories: Array<{ id: keyof MetadataDTO; label: string }> = [
  { id: 'activities', label: 'Atividades' },
  { id: 'taskStatuses', label: 'Status de tarefas' },
  { id: 'taskPriorities', label: 'Prioridades' },
  { id: 'trackStatuses', label: 'Tipos de tarefa' },
  { id: 'participantRoles', label: 'Papéis de participantes' },
  { id: 'estimationTypes', label: 'Tipos de estimativa' },
]

const iconNames = [
  'Circle',
  'CircleCheck',
  'Clock',
  'Code2',
  'Bug',
  'Flag',
  'Star',
  'Briefcase',
  'CheckSquare2',
]

export function LocalMetadataSettings({
  workspaceId,
}: {
  workspaceId: string
}) {
  const bridge = useHostBridge()
  const query = useLocalMetadata(workspaceId)
  const [category, setCategory] = useState<keyof MetadataDTO>('activities')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Circle')
  const [color, setColor] = useState('#3b82f6')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function resetEditor() {
    setEditingId(null)
    setName('')
    setMessage('')
    setError('')
  }

  async function persist(items: MetadataItem[]) {
    const snapshot = query.data?.data
    if (!snapshot || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    const result = await bridge.core.saveLocalMetadata({
      body: {
        workspaceId,
        revision: snapshot.revision,
        values: { ...snapshot.values, [category]: items },
      },
    })
    setSaving(false)

    if (!result.isSuccess) {
      if (result.error) setError(result.error)
      await query.refetch()
      return
    }

    resetEditor()
    setMessage('Metadados locais salvos.')
    bridge.events.emit('local-metadata:changed', { workspaceId })
    await query.refetch()
  }

  if (query.isLoading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  const snapshot = query.data?.data
  if (!snapshot)
    return (
      <p role="alert">
        {query.data?.error}
        <Button
          variant="outline"
          onClick={() => {
            void query.refetch()
          }}
        >
          Recarregar metadados locais
        </Button>
      </p>
    )
  const items = snapshot.values[category]

  return (
    <Card data-testid="local-metadata-settings">
      <CardHeader>
        <CardTitle>Metadados locais</CardTitle>
        <CardDescription>
          Organize este workspace sem conectar um serviço externo. Estas opções
          são usadas na origem Local.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Label className="flex flex-col gap-2">
          Categoria
          <Select
            value={category}
            onValueChange={(value) => {
              const selected = categories.find((item) => item.id === value)
              if (!selected) return
              setCategory(selected.id)
              resetEditor()
            }}
          >
            <SelectTrigger aria-label="Categoria de metadados">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {categories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Label>
        <div className="flex flex-wrap items-end gap-3">
          <Label className="flex min-w-48 flex-1 flex-col gap-2">
            Nome
            <Input
              aria-label="Nome do metadado"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="flex flex-col gap-2">
            Ícone
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger aria-label="Ícone do metadado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {iconNames.map((item) => (
                    <SelectItem key={item} value={item}>
                      <span className="flex items-center gap-2">
                        <DynamicIcon name={item} className="size-4" />
                        {item}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label className="flex flex-col gap-2">
            Cor
            <Input
              aria-label="Cor do metadado"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="w-16"
            />
          </Label>
          <Button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => {
              let id = editingId
              if (id === null) id = crypto.randomUUID()
              const item: MetadataItem = {
                id,
                name: name.trim(),
                icon,
                colors: {
                  badge: color,
                  background: 'transparent',
                  text: color,
                },
              }
              void persist([
                ...items.filter((current) => current.id !== id),
                item,
              ])
            }}
          >
            {saving && <Loader2 className="animate-spin" />}
            {!saving && <Plus />}Salvar item
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={resetEditor}>
              Cancelar edição
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Check className="size-4" />
            {message}
          </p>
        )}
        {items.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nenhum item cadastrado nesta categoria.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <DynamicIcon
                name={item.icon}
                color={item.colors.badge}
                className="size-4"
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Editar ${item.name}`}
                disabled={saving}
                onClick={() => {
                  setEditingId(item.id)
                  setName(item.name)
                  setIcon(item.icon)
                  setColor(item.colors.badge)
                  setError('')
                  setMessage('')
                }}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover ${item.name}`}
                disabled={saving}
                onClick={() => {
                  void persist(
                    items.filter((current) => current.id !== item.id),
                  )
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
