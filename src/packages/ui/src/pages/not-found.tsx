import { Home, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <div className="animate-in fade-in flex h-[calc(100vh-120px)] w-full items-center justify-center duration-500">
      <div className="flex max-w-[420px] flex-col items-center px-6 text-center">
        {/* Ícone: Usando muted para indicar algo "não encontrado" em vez de "erro fatal" */}
        <div className="bg-muted ring-muted/20 mb-6 flex h-20 w-20 items-center justify-center rounded-full ring-8">
          <SearchX className="text-muted-foreground h-10 w-10" />
        </div>

        <h1 className="text-foreground mb-2 text-2xl font-semibold tracking-tight">
          Página não encontrada
        </h1>

        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          Parece que o caminho que você está tentando acessar não existe ou foi
          movido para um novo endereço.
        </p>

        {/* Ações */}
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="default" size="sm" asChild className="gap-2">
            <Link to="/">
              <Home className="h-4 w-4" />
              Voltar ao Início
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.back()}
            className="gap-2"
          >
            Voltar para a página anterior
          </Button>
        </div>

        {/* Dica sutil estilo Linear */}
        <div className="bg-muted/50 text-muted-foreground mt-12 flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-medium tracking-wider uppercase">
          <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          Status: 404 Not Found
        </div>
      </div>
    </div>
  )
}
