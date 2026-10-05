'use client'

import { Button } from '@mr-tick/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@mr-tick/ui/tabs'
import { Building2, Check, Sparkles, User, X } from 'lucide-react'
import * as React from 'react'

export interface PricingFeature {
  text: string
  status: 'check' | 'block'
}

export interface PricingPlan {
  name: string
  price: string
  period?: string
  description: string
  features: PricingFeature[]
  highlighted?: boolean
  badge?: string
  cta: string
}

const INDIVIDUAL_PLANS: PricingPlan[] = [
  {
    name: 'Free (Open Core)',
    price: '$0',
    description:
      'Everything an individual developer needs for local task execution and time tracking.',
    features: [
      { text: 'Native Desktop App (macOS, Windows, Linux)', status: 'check' },
      {
        text: '100% Local Persistence (Embedded Local Storage)',
        status: 'check',
      },
      { text: 'Global keyboard shortcuts & quick timer bar', status: 'check' },
      { text: 'Basic daily time & activity summaries', status: 'check' },
      { text: '1 Workspace and 1 integrated DataSource', status: 'check' },
      { text: 'Advanced Deep Work focus analytics', status: 'block' },
      { text: 'Team coordination & squad dashboards', status: 'block' },
    ],
    cta: 'Download Free',
  },
  {
    name: 'Individual Pro',
    price: '$4',
    period: '/month',
    description:
      'For engineers aiming for maximum focus, Deep Work metrics, and multiple tool integrations.',
    features: [
      { text: 'Unlimited Workspaces & DataSources', status: 'check' },
      {
        text: 'Multiple integrations (Jira, Redmine, GitHub, YouTrack)',
        status: 'check',
      },
      { text: 'Advanced Deep Work & focus analytics', status: 'check' },
      {
        text: 'Context switching frequency detection',
        status: 'check',
      },
      {
        text: 'Exportable effort reports (JSON, CSV)',
        status: 'check',
      },
      { text: 'Commit & Pull Request correlation', status: 'check' },
      { text: 'Team squad aggregation', status: 'block' },
    ],
    highlighted: true,
    badge: 'Most Popular',
    cta: 'Start 14-Day Free Trial',
  },
]

const ENTERPRISE_PLANS: PricingPlan[] = [
  {
    name: 'Team Squads',
    price: '$10',
    period: '/user /month',
    description:
      'Shared visibility, effort allocation, and workflow observability for engineering teams.',
    features: [
      { text: 'Unlimited Workspaces & DataSources', status: 'check' },
      { text: 'Automatic bi-directional task sync', status: 'check' },
      { text: 'Collective hours & capacity dashboard', status: 'check' },
      { text: 'Effort reports by sprint and epic', status: 'check' },
      { text: 'Aggregated team Deep Work metrics', status: 'check' },
      { text: 'Member role management & team admin', status: 'check' },
      { text: 'Dedicated self-hosted deployment', status: 'block' },
    ],
    highlighted: true,
    badge: 'For Tech Teams',
    cta: 'Start Team Trial',
  },
  {
    name: 'Self-Hosted Enterprise',
    price: 'Custom',
    description:
      'On-premise enterprise infrastructure, custom SSO, audit logs, and dedicated SLA.',
    features: [
      {
        text: 'Deploy on your own infrastructure (Docker/K8s)',
        status: 'check',
      },
      { text: 'Custom SAML SSO & Active Directory', status: 'check' },
      { text: 'Custom Addon development support', status: 'check' },
      { text: 'Enterprise audit logs & compliance', status: 'check' },
      { text: 'Dedicated account manager & 99.9% SLA', status: 'check' },
      { text: 'Custom DataSource connectors built on demand', status: 'check' },
    ],
    cta: 'Contact Sales',
  },
]

export function Pricing() {
  return (
    <section
      id="pricing"
      className="bg-muted/15 relative overflow-hidden py-24 lg:py-32"
    >
      <div className="container mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-14 text-center">
          <div className="border-primary/25 bg-primary/5 text-primary mb-3.5 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold">
            <Sparkles className="size-3.5" />
            Simple, Transparent Pricing
          </div>

          <h2 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Start free. Upgrade when you need team power.
          </h2>

          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
            Mr. Tick is Open Core. Free forever for local individual use, with
            Pro analytics and Team collaboration plans.
          </p>
        </div>

        {/* Pricing Tabs */}
        <Tabs defaultValue="individual" className="mx-auto max-w-4xl">
          <div className="mb-10 flex justify-center">
            <TabsList className="border-border/60 bg-muted/60 rounded-lg border p-1">
              <TabsTrigger
                value="individual"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 rounded-md px-5 py-2 text-xs font-semibold data-[state=active]:shadow-xs"
              >
                <User className="size-3.5" />
                For Developers
              </TabsTrigger>
              <TabsTrigger
                value="enterprise"
                className="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 rounded-md px-5 py-2 text-xs font-semibold data-[state=active]:shadow-xs"
              >
                <Building2 className="size-3.5" />
                For Engineering Teams
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Individual Plans */}
          <TabsContent value="individual">
            <div className="grid gap-6 md:grid-cols-2">
              {INDIVIDUAL_PLANS.map((plan) => (
                <PlanCard key={plan.name} plan={plan} />
              ))}
            </div>
          </TabsContent>

          {/* Enterprise Plans */}
          <TabsContent value="enterprise">
            <div className="grid gap-6 md:grid-cols-2">
              {ENTERPRISE_PLANS.map((plan) => (
                <PlanCard key={plan.name} plan={plan} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  return (
    <div
      className={`relative flex flex-col justify-between rounded-lg border p-8 backdrop-blur-sm transition-all duration-300 ${
        plan.highlighted
          ? 'border-primary/50 bg-card shadow-primary/5 ring-primary/20 shadow-xl ring-1'
          : 'border-border/60 bg-card/70 hover:border-border'
      }`}
    >
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-3 right-6">
          <span className="bg-primary text-primary-foreground rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-wide uppercase shadow-md">
            {plan.badge}
          </span>
        </div>
      )}

      <div>
        <h3 className="text-foreground text-lg font-bold">{plan.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {plan.description}
        </p>

        {/* Price */}
        <div className="my-6 flex items-baseline gap-1">
          <span className="text-foreground text-4xl font-extrabold tracking-tight">
            {plan.price}
          </span>
          {plan.period && (
            <span className="text-muted-foreground text-xs font-medium">
              {plan.period}
            </span>
          )}
        </div>

        {/* Features List */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <p className="text-muted-foreground/70 font-mono text-[11px] font-semibold tracking-wider uppercase">
            What&apos;s included
          </p>
          <ul className="space-y-2.5">
            {plan.features.map((feature) => (
              <li
                key={feature.text}
                className="flex items-start gap-2.5 text-xs"
              >
                {feature.status === 'check' ? (
                  <Check className="text-primary mt-0.5 size-4 shrink-0" />
                ) : (
                  <X className="text-muted-foreground/40 mt-0.5 size-4 shrink-0" />
                )}
                <span
                  className={
                    feature.status === 'check'
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground/60 line-through'
                  }
                >
                  {feature.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-8">
        <Button
          asChild
          variant={plan.highlighted ? 'default' : 'outline'}
          className="w-full text-xs font-semibold"
        >
          <a href="/download">{plan.cta}</a>
        </Button>
      </div>
    </div>
  )
}
