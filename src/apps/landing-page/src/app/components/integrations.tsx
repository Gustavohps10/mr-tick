'use client'

import {
  ArrowRight,
  BookOpenText,
  Code2,
  MessageSquarePlus,
  Terminal,
} from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import { Link } from '@/i18n/navigation'

export interface IntegrationItem {
  name: string
  desc: string
  status: 'live' | 'soon'
  accentBg: string
  accentBorder: string
  darkInvert?: boolean
  logoUrl: string
}

export interface TechStackItem {
  name: string
  url: string
}

const TECH_STACK: TechStackItem[] = [
  {
    name: 'TypeScript',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/typescript.svg',
  },
  {
    name: 'Electron',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/electron.svg',
  },
  {
    name: 'Node.js',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/nodejs-alt.svg',
  },
  {
    name: 'React',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/reactjs.svg',
  },
  {
    name: 'Next.js',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/nextjs-light.svg',
  },
  {
    name: 'Turbopack',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/turbopack-light.svg',
  },
  {
    name: 'Tailwind',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/tailwind.svg',
  },
]

export function Integrations() {
  const t = useTranslations('integrations')
  const INTEGRATIONS: IntegrationItem[] = [
    {
      name: 'Jira',
      desc: t('queryTicketsUpdateIssueStatusAnd'),
      status: 'live',
      accentBg: 'bg-[#0052CC]/10',
      accentBorder: 'border-[#0052CC]/25',
      darkInvert: false,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/jira.svg',
    },
    {
      name: 'Redmine',
      desc: t('fullBiDirectionalSyncForTime'),
      status: 'live',
      accentBg: 'bg-red-600/10',
      accentBorder: 'border-red-600/25',
      darkInvert: false,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/redmine.svg',
    },
    {
      name: 'GitHub',
      desc: t('linkCommitsBranchesAndPullRequests'),
      status: 'live',
      accentBg: 'bg-muted/40',
      accentBorder: 'border-border/60',
      darkInvert: true,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/github.svg',
    },
    {
      name: 'YouTrack',
      desc: t('manageSprintsWorkItemsAndNative'),
      status: 'live',
      accentBg: 'bg-amber-500/10',
      accentBorder: 'border-amber-500/25',
      darkInvert: false,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/jetbrains-youtrack.svg',
    },
    {
      name: 'Linear',
      desc: t('instantSyncForCyclesIssuesAnd'),
      status: 'soon',
      accentBg: 'bg-violet-500/10',
      accentBorder: 'border-violet-500/25',
      darkInvert: true,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/linear.svg',
    },
    {
      name: 'GitLab',
      desc: t('trackMergeRequestsPipelinesAndNative'),
      status: 'soon',
      accentBg: 'bg-orange-500/10',
      accentBorder: 'border-orange-500/25',
      darkInvert: false,
      logoUrl:
        'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/gitlab.svg',
    },
  ]
  return (
    <section
      id="integrations"
      className="relative overflow-hidden py-24 lg:py-32"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-lg bg-blue-500/5 blur-[140px]" />
      </div>

      <div className="container mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <div className="border-border/60 bg-muted/40 text-muted-foreground mb-3.5 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1 text-xs font-semibold">
            <Terminal className="size-3.5" />
            {t('integrationsExtensibility')}
          </div>

          <h2 className="text-foreground mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {t('plugYourExistingToolsNeverBreak')}
          </h2>

          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
            {t('connectToTheIssueTrackersAnd')}
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((item) => (
            <div
              key={item.name}
              className="border-border/50 bg-card/60 hover:border-border/90 group relative flex flex-col justify-between rounded-lg border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div>
                <div className="mb-4 flex items-center justify-between">
                  {/* Logo Container */}
                  <div
                    className={`flex size-12 items-center justify-center rounded-lg border ${item.accentBorder} ${item.accentBg} p-2.5 transition-transform duration-300 group-hover:scale-105`}
                  >
                    <Image
                      src={item.logoUrl}
                      alt={item.name}
                      width={28}
                      height={28}
                      className={`h-7 w-7 object-contain ${
                        item.darkInvert ? 'dark:invert' : ''
                      }`}
                    />
                  </div>

                  {/* Status Badge */}
                  {item.status === 'live' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-500">
                      <span className="size-1.5 animate-pulse rounded-lg bg-emerald-500" />
                      {t('available')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-violet-400">
                      {t('comingSoon')}
                    </span>
                  )}
                </div>

                <h3 className="text-foreground mb-1.5 text-base font-bold">
                  {item.name}
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {item.desc}
                </p>
              </div>

              <div className="border-border/40 mt-5 flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground/60 font-mono text-[11px]">
                  {item.status === 'live'
                    ? t('biDirectionalSync')
                    : t('inDevelopment')}
                </span>
                <ArrowRight className="text-muted-foreground group-hover:text-foreground size-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          ))}
        </div>

        {/* Extensibility & Tech Stack Card (Console Dark Card with Dotted Border & Terminal Watermark) */}
        <div className="relative mt-16 overflow-hidden rounded-lg border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center text-white shadow-2xl sm:p-12">
          {/* Subtle Background Grid Drawing */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full [mask-image:radial-gradient(100%_100%_at_50%_40%,white,transparent)] stroke-white/[0.04]"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="extensibility-grid"
                width={28}
                height={28}
                x="50%"
                y={-1}
                patternUnits="userSpaceOnUse"
              >
                <path d="M.5 28V.5H28" fill="none" />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              strokeWidth={0}
              fill="url(#extensibility-grid)"
            />
          </svg>

          {/* Large Right-side Terminal Prompt Watermark (> _) */}
          <Terminal
            className="pointer-events-none absolute top-1/2 -right-6 size-56 -translate-y-1/2 stroke-[1.25] text-zinc-900/80 opacity-60 select-none sm:-right-4 sm:size-72"
            aria-hidden="true"
          />

          {/* Ambient Inner Glow */}
          <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
            <div className="h-[220px] w-[450px] rounded-lg bg-blue-500/10 blur-[100px]" />
          </div>

          <div className="relative z-10">
            {/* Top Code Badge */}
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-inner">
              <Code2 className="size-5" />
            </div>

            {/* Headline */}
            <h3 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {t('haveAProprietaryTrackerOrCustom')}
            </h3>

            {/* Subtitle */}
            <p className="mx-auto mt-3 max-w-xl font-mono text-xs leading-relaxed text-zinc-400 sm:text-sm">
              {t('buildCustomTypescriptPluginsWithFull')}
            </p>

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/docs/apis/vault-and-events"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-xs font-semibold text-black shadow-sm transition-all hover:scale-105 hover:bg-zinc-200"
              >
                <BookOpenText className="size-3.5" />
                {t('readSdkDocumentation')}
              </Link>

              <a
                href="https://github.com/gustavohps10/mr-tick/issues/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <MessageSquarePlus className="size-3.5" />
                {t('requestAnIntegration')}
              </a>
            </div>

            {/* Inner Divider & Tech Stack Ribbon */}
            <div className="mt-12 border-t border-zinc-800/80 pt-8">
              <p className="font-mono text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                {t('builtOnTopOfARock')}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-6 opacity-80 transition-all duration-300 hover:opacity-100 sm:gap-8">
                {TECH_STACK.map((tech) => (
                  <div
                    key={tech.name}
                    className="flex items-center gap-2 font-mono text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    <Image
                      src={tech.url}
                      alt={tech.name}
                      width={20}
                      height={20}
                      className="h-5 w-5 object-contain"
                    />
                    <span>{tech.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
