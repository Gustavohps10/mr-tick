'use client'

import {
  CalendarDays,
  CheckCircle2,
  Cpu,
  GitPullRequest,
  Layers,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

export function Positioning() {
  const t = useTranslations('positioning')
  return (
    <section
      id="positioning"
      className="bg-background relative overflow-hidden py-24 lg:py-32"
    >
      {/* Background radial glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="bg-primary/5 h-[400px] w-[600px] rounded-lg blur-[120px]" />
      </div>

      <div className="container mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="border-primary/25 bg-primary/5 text-primary mb-3.5 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1 text-xs font-semibold">
            <Cpu className="size-3.5" />
            {t('corePositioning')}
          </div>

          <h2 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {t('onePrivateCockpitForAllYour')}
          </h2>

          <p className="text-muted-foreground mt-4 text-base leading-relaxed sm:text-lg">
            {t('stopJumpingAcrossDozensOfBrowser')}
          </p>
        </div>

        {/* 3 Pillars of Context Aggregation */}
        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          <div className="border-border/60 bg-card/60 rounded-lg border p-6 backdrop-blur-sm">
            <div className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
              <Layers className="size-5" />
            </div>
            <h3 className="text-foreground text-base font-bold">
              {t('remoteTicketsLocalTasks')}
            </h3>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {t('consolidateIssuesFromJiraRedmineAnd')}
            </p>
          </div>

          <div className="border-border/60 bg-card/60 rounded-lg border p-6 backdrop-blur-sm">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <GitPullRequest className="size-5" />
            </div>
            <h3 className="text-foreground text-base font-bold">
              {t('codeReviewsPrs')}
            </h3>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {t('linkGithubAndGitlabPullRequests')}
            </p>
          </div>

          <div className="border-border/60 bg-card/60 rounded-lg border p-6 backdrop-blur-sm">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <CalendarDays className="size-5" />
            </div>
            <h3 className="text-foreground text-base font-bold">
              {t('meetingsCalendarAgenda')}
            </h3>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {t('importScheduledMeetingsAndDailyCalendar')}
            </p>
          </div>
        </div>

        {/* Comparison Cards Grid */}
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {/* Card 1: What Mr. Tick is NOT */}
          <div className="border-destructive/20 bg-destructive/5 hover:border-destructive/30 relative flex flex-col justify-between rounded-lg border p-8 backdrop-blur-sm transition-all">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="bg-destructive/15 text-destructive flex size-10 items-center justify-center rounded-lg">
                  <XCircle className="size-5" />
                </div>
                <div>
                  <h3 className="text-foreground text-lg font-bold">
                    {t('whatMrTickIsNot')}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {t('weDonTAddBloatOr')}
                  </p>
                </div>
              </div>

              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('notAReplacementForYourIssue')}
                    </strong>{' '}
                    {t('yourTeamKeepsUsingJiraRedmine')}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('notAHeavySlowWebApp')}
                    </strong>{' '}
                    {t('noEndlessLoadingSpinnersOrBrowser')}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('notCloudSurveillance')}
                    </strong>{' '}
                    {t('zeroEmployeeMonitoringZeroKeystrokeLogging')}
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-destructive/15 mt-8 border-t pt-4">
              <span className="text-muted-foreground/70 font-mono text-[11px]">
                {t('zeroClutterZeroFriction100Focused')}
              </span>
            </div>
          </div>

          {/* Card 2: What Mr. Tick DOES */}
          <div className="border-primary/25 bg-card/80 hover:border-primary/40 relative flex flex-col justify-between rounded-lg border p-8 shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
            <div>
              <div className="mb-6 flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <h3 className="text-foreground text-lg font-bold">
                    {t('whatMrTickDoes')}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {t('localFirstExecutionAndUnifiedWorkflow')}
                  </p>
                </div>
              </div>

              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('localDataConsolidation')}
                    </strong>{' '}
                    {t('everythingIsSavedLocallyOnYour')}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('twoWayBackgroundSync')}
                    </strong>{' '}
                    {t('fetchAssignedTicketsAndPushTime')}
                  </span>
                </li>

                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground font-semibold">
                      {t('deepWorkObservability')}
                    </strong>{' '}
                    {t('measureUninterruptedCodingBlocksTrackContext')}
                  </span>
                </li>
              </ul>
            </div>

            <div className="border-border/50 mt-8 border-t pt-4">
              <span className="text-primary font-mono text-[11px] font-medium">
                {t('localFirstOpenCoreBuiltWith')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
