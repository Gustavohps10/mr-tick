import { AlertCircle, Check, Clock, Loader2, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { RemoteTaskSearchState } from '@/hooks/use-remote-task-search'

export function TaskSearchStatus({
  states,
}: {
  states: readonly RemoteTaskSearchState[]
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="text-muted-foreground flex flex-col gap-1 px-2.5 py-1 text-[11px]"
      data-testid="task-search-status"
    >
      {states.map((state) => {
        let Icon = Check
        let text = `Busca atualizada em ${state.origin.label}`

        switch (state.phase) {
          case 'waiting':
            Icon = Clock
            text = `Aguardando para buscar em ${state.origin.label}…`
            break
          case 'searching':
            Icon = Loader2
            text = `Buscando em ${state.origin.label}…`
            break
          case 'limited':
            Icon = Clock
            text = `Limite de consultas em ${state.origin.label}. Aguarde para tentar novamente.`
            break
          case 'offline':
            Icon = WifiOff
            text = 'Sem conexão. Exibindo dados locais.'
            break
          case 'error':
            Icon = AlertCircle
            text = `Falha na busca em ${state.origin.label}`
            break
        }

        return (
          <div key={state.origin.id} className="flex items-center gap-1.5">
            <Icon
              className={
                state.phase === 'searching'
                  ? 'size-3 shrink-0 animate-spin'
                  : 'size-3 shrink-0'
              }
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              {text}
              {state.message && (
                <span className="text-destructive block">{state.message}</span>
              )}
            </span>
            {(state.phase === 'error' ||
              state.phase === 'limited' ||
              state.phase === 'offline') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={state.retry}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
