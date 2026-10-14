'use client'

import { Button } from '@mr-tick/ui/button'
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import { Footer } from '@/app/components/footer'
import { Link } from '@/i18n/navigation'

export interface CheckoutCancelViewProps {
  navbar: React.ReactNode
}

function CancelContent() {
  const t = useTranslations('cancel')

  return (
    <div className="container mx-auto max-w-4xl px-6 py-8 lg:py-12">
      <div className="border-border/60 bg-card/60 relative overflow-hidden rounded-lg border p-8 shadow-xl backdrop-blur-md sm:p-12">
        <div className="from-primary/5 pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-lg bg-gradient-to-br to-transparent blur-3xl" />

        <div className="border-border/60 bg-muted/40 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-lg border px-3.5 py-1 text-xs font-semibold">
          <AlertCircle className="text-muted-foreground size-4" />
          {t('status')}
        </div>

        <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>

        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="border-border/50 bg-muted/30 mt-8 space-y-2 rounded-lg border p-6">
          <h2 className="text-foreground text-sm font-semibold">
            {t('tryAgainTitle')}
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('tryAgainDesc')}
          </p>
          <p className="text-muted-foreground/80 border-t pt-2 text-[11px] leading-relaxed">
            {t('supportHelp')}
          </p>
        </div>

        {/* Action CTAs */}
        <div className="mt-10 flex flex-col items-center gap-4 border-t pt-8 sm:flex-row sm:justify-between">
          <Button
            asChild
            size="lg"
            className="w-full gap-2 font-semibold sm:w-auto"
          >
            <Link href="/license?action=checkout">
              <RefreshCw className="size-4" />
              {t('retryCheckout')}
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
              {t('backHome')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutCancelView({
  navbar,
}: CheckoutCancelViewProps) {
  return (
    <div className="bg-background text-foreground selection:bg-primary/30 flex min-h-screen flex-col antialiased">
      {navbar}
      <main className="flex-1 pt-24 pb-16">
        <CancelContent />
      </main>
      <Footer />
    </div>
  )
}
