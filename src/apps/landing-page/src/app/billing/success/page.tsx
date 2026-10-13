'use client'

import { Button } from '@mr-tick/ui/button'
import { ArrowLeft, CheckCircle2, Download, Sparkles } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { Suspense } from 'react'

function SuccessContent() {
  const [locale, setLocale] = React.useState<'en' | 'pt-br'>('en')

  React.useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
    if (match && (match[1] === 'pt-br' || match[1] === 'en')) {
      setLocale(match[1])
      return
    }
    if (window.location.pathname.startsWith('/pt-br')) {
      setLocale('pt-br')
      return
    }
    if (navigator.language.toLowerCase().startsWith('pt')) {
      setLocale('pt-br')
    }
  }, [])

  const isPt = locale === 'pt-br'

  return (
    <div className="container mx-auto max-w-4xl px-6 py-20 lg:py-28">
      {/* Header card */}
      <div className="border-border/60 bg-card/60 relative overflow-hidden rounded-2xl border p-8 shadow-xl backdrop-blur-md sm:p-12">
        <div className="from-primary/10 pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br to-transparent blur-3xl" />

        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {isPt ? 'Pagamento Confirmado' : 'Payment Confirmed'}
        </div>

        <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
          {isPt
            ? 'Bem-vindo ao Mr. Tick Plus! 🎉'
            : 'Welcome to Mr. Tick Plus! 🎉'}
        </h1>

        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed sm:text-lg">
          {isPt
            ? 'Sua assinatura está ativa. A sua chave de ativação foi gerada e enviada para o seu e-mail de compra.'
            : 'Your subscription is active. Your activation key has been generated and sent to your checkout email.'}
        </p>

        {/* Steps to activate */}
        <div className="mt-10 space-y-4">
          <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <Sparkles className="text-primary size-4" />
            {isPt ? 'Como Ativar no Aplicativo' : 'How to Activate in the App'}
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-xl border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  1
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {isPt ? 'Baixe o App' : 'Download the App'}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isPt
                    ? 'Instale a versão estável para seu sistema operacional (Windows, macOS ou Linux).'
                    : 'Install the stable release for your OS (Windows, macOS, or Linux).'}
                </p>
              </div>
            </div>

            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-xl border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  2
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {isPt ? 'Abra as Configurações' : 'Open Global Settings'}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isPt
                    ? 'No rodapé esquerdo do app, clique no ícone de engrenagem ⚙ e escolha a aba "License".'
                    : 'In the bottom-left rail, click the gear icon ⚙ and select the "License" tab.'}
                </p>
              </div>
            </div>

            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-xl border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  3
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {isPt ? 'Cole sua Chave' : 'Paste & Activate'}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isPt
                    ? 'Cole a chave recebida no e-mail (mrtick_live_...). O Discord Presence e addons Plus são liberados na hora!'
                    : 'Paste the key from your email (mrtick_live_...). Discord Presence and Plus addons unlock instantly!'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="mt-10 flex flex-col items-center gap-4 border-t pt-8 sm:flex-row sm:justify-between">
          <Button
            asChild
            size="lg"
            className="w-full gap-2 font-semibold sm:w-auto"
          >
            <Link href="/download">
              <Download className="size-4" />
              {isPt ? 'Baixar Mr. Tick Desktop' : 'Download Mr. Tick Desktop'}
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full gap-2 sm:w-auto"
          >
            <Link href="/">
              <ArrowLeft className="size-4" />
              {isPt ? 'Voltar para a Página Inicial' : 'Back to Home'}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
      <Suspense
        fallback={
          <div className="text-muted-foreground py-20 text-center">
            Carregando...
          </div>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  )
}
