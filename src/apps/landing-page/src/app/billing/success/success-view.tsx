'use client'

import { Button } from '@mr-tick/ui/button'
import { ArrowLeft, CheckCircle2, Download, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import { Footer } from '@/app/components/footer'
import { Link } from '@/i18n/navigation'

export interface CheckoutSuccessViewProps {
  navbar: React.ReactNode
}

function SuccessContent() {
  const t = useTranslations('success')

  return (
    <div className="container mx-auto max-w-4xl px-6 py-8 lg:py-12">
      {/* Header card */}
      <div className="border-border/60 bg-card/60 relative overflow-hidden rounded-lg border p-8 shadow-xl backdrop-blur-md sm:p-12">
        <div className="from-primary/10 pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-lg bg-gradient-to-br to-transparent blur-3xl" />

        <div className="border-border/60 bg-muted/40 text-foreground mb-6 inline-flex items-center gap-2 rounded-lg border px-3.5 py-1 text-xs font-semibold">
          <CheckCircle2 className="text-primary size-4" />
          {t('confirmed')}
        </div>

        <h1 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>

        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed sm:text-lg">
          {t('subtitle')}
        </p>

        {/* Steps to activate */}
        <div className="mt-10 space-y-4">
          <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <Sparkles className="text-primary size-4" />
            {t('activateTitle')}
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-lg border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  1
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {t('step1Title')}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('step1Desc')}
                </p>
              </div>
            </div>

            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-lg border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  2
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {t('step2Title')}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('step2Desc')}
                </p>
              </div>
            </div>

            <div className="border-border/60 bg-muted/40 flex flex-col justify-between rounded-lg border p-5">
              <div className="space-y-2">
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                  3
                </div>
                <h3 className="text-foreground text-sm font-semibold">
                  {t('step3Title')}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('step3Desc')}
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
              {t('downloadDesktop')}
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

export default function CheckoutSuccessView({
  navbar,
}: CheckoutSuccessViewProps) {
  return (
    <div className="bg-background text-foreground selection:bg-primary/30 flex min-h-screen flex-col antialiased">
      {navbar}
      <main className="flex-1 pt-24 pb-16">
        <SuccessContent />
      </main>
      <Footer />
    </div>
  )
}
