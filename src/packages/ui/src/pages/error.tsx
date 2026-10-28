import { AlertCircle, Home, RefreshCcw, Terminal } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function Error() {
  const error = useRouteError() as any

  const errorMessage = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error?.message || 'Ocorreu um erro inesperado.'

  return (
    <div className="animate-in fade-in flex h-[calc(100vh-120px)] w-full items-center justify-center duration-500">
      <div className="flex max-w-[420px] flex-col items-center px-6 text-center">
        {/* Ícone: Usando destructive nativo do tema */}
        <div className="bg-destructive/10 ring-destructive/5 mb-6 flex h-20 w-20 items-center justify-center rounded-full ring-8">
          <AlertCircle className="text-destructive h-10 w-10" />
        </div>

        <h1 className="text-foreground mb-2 text-2xl font-semibold tracking-tight">
          Ops! Algo quebrou.
        </h1>

        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          Não foi possível carregar esta seção. Isso pode ser um erro temporário
          ou um problema no carregamento dos dados do sistema.
        </p>

        {/* Console de Erro: Cor Sólida (Muted/Secondary) */}
        <div className="bg-muted mb-8 w-full overflow-hidden rounded-lg border p-4 text-left font-mono shadow-sm">
          <div className="border-border text-muted-foreground mb-2 flex items-center gap-2 border-b pb-2 text-[10px] tracking-widest uppercase">
            <Terminal className="h-3 w-3" />
            <span>Detalhes do Sistema</span>
          </div>
          <p className="text-destructive text-xs leading-tight font-medium break-all">
            Error: {errorMessage}
          </p>
        </div>

        {/* Ações: Sem cores 'chumbadas' manuais */}
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCcw className="h-4 w-4" />
            Recarregar
          </Button>

          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/">
              <Home className="h-4 w-4" />
              Ir para o Início
            </Link>
          </Button>
        </div>

        <p className="text-muted-foreground/60 mt-10 text-[11px]">
          Se o problema persistir, entre em contato com o suporte do Mr-tick.
        </p>
      </div>
    </div>
  )
}
