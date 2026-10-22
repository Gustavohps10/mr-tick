import Link from 'next/link'

import { createOAuthDesktopCallbackUrl } from '@/lib/oauth-callback'

export default async function OAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : undefined
  const errorDescription =
    typeof params.error_description === 'string'
      ? params.error_description
      : undefined

  const urlSearchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach((v) => urlSearchParams.append(key, v))
        continue
      }
      urlSearchParams.append(key, value)
    }
  }

  const query = urlSearchParams.toString()
  const deepLinkUrl = createOAuthDesktopCallbackUrl(
    query,
    process.env.NODE_ENV === 'development',
  )

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
      <div className="border-border bg-card w-full max-w-md rounded-lg border p-6 text-center shadow-sm">
        {error ? (
          <>
            <div className="bg-destructive/10 text-destructive mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-bold">
              ✕
            </div>
            <h1 className="text-foreground mb-2 text-lg font-semibold">
              Falha na Autenticação
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              {errorDescription ||
                error ||
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
            <a
              href={deepLinkUrl}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors"
            >
              Abrir no Mr-tick Desktop
            </a>
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  try {
                    window.location.href = ${JSON.stringify(deepLinkUrl)};
                  } catch (e) {}
                `,
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
