'use client'

import { CloudOff, HardDrive, Lock, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

export interface ArchitectureStep {
  icon: React.ReactNode
  title: string
  description: string
  color: string
}

export function OfflineArchitecture() {
  const t = useTranslations('architecture')
  const OFFLINE_STEPS: ArchitectureStep[] = [
    {
      icon: <HardDrive className="size-6 text-emerald-400" />,
      title: t('dataStoredLocally'),
      description: t('allYourStateLivesDirectlyOn'),
      color: 'border-emerald-500/30 bg-emerald-500/5',
    },
    {
      icon: <CloudOff className="size-6 text-amber-400" />,
      title: t('100OfflineFirst'),
      description: t('noInternetConnectionNoProblemTimers'),
      color: 'border-amber-500/30 bg-amber-500/5',
    },
    {
      icon: <RefreshCw className="size-6 text-sky-400" />,
      title: t('smartBackgroundSync'),
      description: t('onceConnectedOurReconciliationEngineSeamlessly'),
      color: 'border-sky-500/30 bg-sky-500/5',
    },
    {
      icon: <Lock className="size-6 text-violet-400" />,
      title: t('privacySovereignty'),
      description: t('yourWorkLogsNeverTravelThrough'),
      color: 'border-violet-500/30 bg-violet-500/5',
    },
  ]
  return (
    <section id="offline" className="relative overflow-hidden py-24 lg:py-32">
      {/* Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-emerald-500/5 blur-[140px]" />
      </div>

      <div className="container mx-auto px-6 lg:px-8">
        <div className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-1.5 text-xs font-semibold text-emerald-400">
            <HardDrive className="size-3.5" />
            {t('localFirstArchitecture')}
          </div>

          <h2 className="text-foreground mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {t('yourProductivityShouldnTDependOn')}
          </h2>

          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
            {t('whileWebSaasToolsSufferFrom')}
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {OFFLINE_STEPS.map((step, index) => (
              <div
                key={step.title}
                className={`relative rounded-lg border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 ${step.color}`}
              >
                <div className="mb-4">{step.icon}</div>
                <div className="text-muted-foreground/30 absolute top-5 right-5 font-mono text-xs font-bold">
                  0{index + 1}
                </div>
                <h4 className="text-foreground mb-2 text-sm leading-snug font-bold">
                  {step.title}
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
