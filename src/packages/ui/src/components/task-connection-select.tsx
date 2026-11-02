import { Plug } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface TaskConnectionOption {
  id: string
  label: string
  description?: string
  logo?: string
  disabled?: boolean
}

interface TaskConnectionIdentity {
  id: string
  addon?: { name: string; logo: string }
  identityName?: string
  memberName?: string
}

/** Resolve display text from authoritative identity/catalog data, never from IDs. */
export function getTaskConnectionOption(
  connection: TaskConnectionIdentity,
): TaskConnectionOption {
  let label: string | undefined
  if (connection.addon?.name.trim()) label = connection.addon.name
  if (connection.identityName?.trim()) label = connection.identityName

  if (!label) {
    return {
      id: connection.id,
      label: 'Nome da conexão indisponível',
      disabled: true,
    }
  }

  const details: string[] = []
  if (connection.addon?.name && connection.addon.name !== label)
    details.push(connection.addon.name)
  if (
    connection.memberName &&
    connection.memberName !== label &&
    !details.includes(connection.memberName)
  )
    details.push(connection.memberName)

  return {
    id: connection.id,
    label,
    description: details.join(' · '),
    logo: connection.addon?.logo,
  }
}

export interface TaskConnectionSelectProps {
  connections: readonly TaskConnectionOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  testId?: string
}

export function TaskConnectionSelect({
  connections,
  value,
  onChange,
  disabled,
  testId,
}: TaskConnectionSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label="Conexão"
        data-testid={testId}
        className="border-input/40 bg-background/50 focus-visible:ring-primary/20 h-8 w-full text-xs font-normal shadow-xs transition-colors [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left"
      >
        <SelectValue placeholder="Selecione uma conexão" />
      </SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]" position="popper">
        {connections.map((connection) => (
          <SelectItem
            key={connection.id}
            value={connection.id}
            disabled={connection.disabled}
            className="py-1.5 text-xs [&_[data-connection-description]]:block"
          >
            <span className="flex min-w-0 items-center gap-2">
              {connection.logo && (
                <img
                  src={connection.logo}
                  alt=""
                  className="size-4 shrink-0 object-contain"
                />
              )}
              {!connection.logo && (
                <Plug className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="flex min-w-0 flex-1 items-baseline gap-x-2">
                <span className="min-w-0 truncate font-medium">
                  {connection.label}
                </span>
                {connection.description && (
                  <span
                    data-connection-description
                    className="text-muted-foreground min-w-0 truncate text-xs"
                  >
                    {connection.description}
                  </span>
                )}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
