'use client'

import { Button } from '@mr-tick/ui/button'
import {
  ArrowRight,
  Download,
  Github,
  HardDrive,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { DesktopAppMockup } from './desktop-app-mockup'
import { HeroBackgroundWaves } from './hero/hero-background-waves'
import { HeroFloatingIntegrations } from './hero/hero-floating-integrations'

export function Hero() {
  return (
    <section
      id="hero"
      className="bg-background text-foreground relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-28 pb-20 lg:pt-36 lg:pb-32"
    >
      {/* 1. Twenty.com Generative Digital Raster Wave Background */}
      <HeroBackgroundWaves opacity={0.8} />

      <div className="relative z-10 container mx-auto px-6 text-center lg:px-8">
        {/* Eyebrow Badge */}
        <div className="border-border/80 bg-muted/50 text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-medium shadow-xs backdrop-blur-md transition-colors">
          <span className="text-foreground font-semibold">Mr. Tick</span>
          <span className="opacity-40">&middot;</span>
          <span>Local-First Workflow & Observability</span>
          <ArrowRight className="size-3 opacity-60" />
        </div>

        {/* Headline (Strictly 2 Lines with Observability Emphasis) */}
        <h1 className="text-foreground mx-auto max-w-5xl text-3xl leading-[1.2] font-normal tracking-tight sm:text-4xl md:text-[2.75rem] lg:text-[3.1rem]">
          The &ldquo;Local-First&rdquo; Workflow{' '}
          <span className="decoration-foreground/30 font-bold underline underline-offset-8">
            Observability
          </span>{' '}
          Toolkit
          <br className="hidden sm:inline" />
          for Technical Teams
        </h1>

        {/* Subtitle (Strictly 2 Lines with Observability) */}
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-xs leading-relaxed sm:text-sm md:text-base">
          An instant local-first cockpit unifying tasks, time tracking,
          <br className="hidden sm:inline" />
          and workflow observability with zero friction.
        </p>

        {/* Actions / CTA Buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            className="bg-foreground text-background hover:bg-foreground/90 h-10 gap-2 px-6 text-sm font-semibold shadow-md transition-all hover:scale-105"
          >
            <Link href="/download">
              <Download className="size-4" />
              Download Mr. Tick
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="border-border text-foreground hover:bg-muted h-10 gap-2 px-5 text-sm backdrop-blur-sm"
          >
            <a
              href="https://github.com/gustavohps10/mr-tick"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="size-4" />
              View on GitHub
            </a>
          </Button>
        </div>

        {/* Technical Highlights / Badges */}
        <div className="text-muted-foreground/80 mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="size-3.5 opacity-70" />
            100% Local-First (RxDB)
          </span>
          <span className="hidden opacity-30 sm:inline">&middot;</span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-3.5 opacity-70" />
            0ms Latency
          </span>
          <span className="hidden opacity-30 sm:inline">&middot;</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 opacity-70" />
            Workflow Observability
          </span>
          <span className="hidden opacity-30 sm:inline">&middot;</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 opacity-70" />
            Full Data Privacy
          </span>
        </div>

        {/* Mockup Area with Floating Integration Badges */}
        <div className="relative mx-auto mt-12 max-w-5xl">
          {/* Authentic 16:9 Desktop App Mockup */}
          <DesktopAppMockup />

          {/* Floating Live Integration Badges (Rendered over the edges) */}
          <HeroFloatingIntegrations />
        </div>
      </div>
    </section>
  )
}
