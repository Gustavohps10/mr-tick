'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const [deepLinkUrl, setDeepLinkUrl] = useState('')
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const query = searchParams.toString()
    const targetUrl = `mr-tick-app://oauth/callback${query ? `?${query}` : ''}`
    setDeepLinkUrl(targetUrl)

    if (error) {
      setHasError(true)
      setErrorMessage(errorDescription || error)
    }

    // Attempt automatic redirect to desktop app protocol
    try {
      window.location.href = targetUrl
    } catch {
      // Browser might block popup/protocol, fallback button handles it
    }
  }, [searchParams])

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
      <div className="border-border bg-card w-full max-w-md rounded-lg border p-6 text-center shadow-sm">
        {hasError ? (
          <>
            <div className="bg-destructive/10 text-destructive mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-bold">
              ✕
            </div>
            <h1 className="text-foreground mb-2 text-lg font-semibold">
              Falha na Autenticação
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              {errorMessage ||
                'O provedor recusou ou cancelou o pedido de autorização.'}
            </p>
            <Link
              href="/"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Voltar para a página inicial
            </Link>
          </>
        ) : (
          <>
            <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 animate-pulse items-center justify-center rounded-lg text-2xl font-bold">
              ✓
            </div>
            <h1 className="text-foreground mb-2 text-lg font-semibold">
              Autenticação Concluída
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Retornando ao aplicativo Mr-tick Desktop. Se o aplicativo não
              abrir automaticamente, clique no botão abaixo.
            </p>
            {deepLinkUrl && (
              <a
                href={deepLinkUrl}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
              >
                Abrir no Mr-tick Desktop
              </a>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
          <div className="border-border bg-card w-full max-w-md rounded-lg border p-6 text-center shadow-sm">
            <p className="text-muted-foreground text-sm">
              Processando autenticação...
            </p>
          </div>
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}
