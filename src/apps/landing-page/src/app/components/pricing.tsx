'use client'

import { Button } from '@mr-tick/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@mr-tick/ui/tabs'
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import * as React from 'react'

import {
  createPlusCheckout,
  detectBrowserPreferredCurrency,
  fetchPlusPlansCatalog,
  findCurrencyOption,
  formatFreePrice,
  formatPlanInterval,
  formatUnitAmount,
  normalizeSupportedCurrency,
  type PlusPlanCatalogItem,
  type SupportedBillingCurrency,
} from '@/lib/billing'

export interface PricingFeature {
  text: string
  status: 'check' | 'block'
}

export interface PricingPlan {
  id: string
  name: string
  price: string
  period?: string
  description: string
  features: PricingFeature[]
  highlighted?: boolean
  badge?: string
  comingSoon?: boolean
  cta: string
  actionKind: 'download' | 'checkout' | 'coming-soon'
  stripePriceId?: string
}

const PLUS_FEATURES: PricingFeature[] = [
  { text: 'Official Mr. Tick Plus Addons catalog access', status: 'check' },
  {
    text: 'Multiple integrations (Redmine, Jira, GitHub, YouTrack)',
    status: 'check',
  },
  {
    text: 'Up to 2 simultaneous activated desktop devices',
    status: 'check',
  },
  { text: 'Advanced synchronization & effort correlation', status: 'check' },
  {
    text: 'Signed Ed25519 offline lease & automatic renewal',
    status: 'check',
  },
  {
    text: 'Instant activation key delivery via email',
    status: 'check',
  },
  { text: 'Team squad aggregation (Enterprise)', status: 'block' },
]

const ENTERPRISE_PLANS: PricingPlan[] = [
  {
    id: 'team-squads',
    name: 'Team Squads',
    price: 'Coming Soon',
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
    badge: 'Coming Soon',
    comingSoon: true,
    cta: 'Coming Soon',
    actionKind: 'coming-soon',
  },
  {
    id: 'self-hosted-enterprise',
    name: 'Self-Hosted Enterprise',
    price: 'Coming Soon',
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
    badge: 'Coming Soon',
    comingSoon: true,
    cta: 'Coming Soon',
    actionKind: 'coming-soon',
  },
]

function resolveDefaultPlusPriceLabel(
  currency: SupportedBillingCurrency,
): string {
  if (currency === 'brl') return formatUnitAmount(1990, 'brl')
  return formatUnitAmount(700, 'usd')
}

function buildPlusPlanCard(
  stripePlan: PlusPlanCatalogItem | null,
  currency: SupportedBillingCurrency,
): PricingPlan {
  let name = 'Mr. Tick Plus'
  let description =
    'Official Plus addons, advanced synchronization, and activation on up to 2 simultaneous devices.'
  let price = resolveDefaultPlusPriceLabel(currency)
  let period = '/month'
  let stripePriceId: string | undefined = undefined

  if (stripePlan) {
    if (stripePlan.name.trim().length > 0) {
      name = stripePlan.name
    }
    if (stripePlan.description) {
      if (stripePlan.description.trim().length > 0) {
        description = stripePlan.description
      }
    }
    const matchedOption = findCurrencyOption(stripePlan, currency)
    if (matchedOption) {
      price = formatUnitAmount(matchedOption.unitAmount, currency)
    }
    period = formatPlanInterval(stripePlan.interval, stripePlan.intervalCount)
    stripePriceId = stripePlan.priceId
  }

  return {
    id: 'mr-tick-plus',
    name,
    price,
    period,
    description,
    features: PLUS_FEATURES,
    highlighted: true,
    badge: 'Most Popular',
    cta: 'Subscribe to Mr. Tick Plus',
    actionKind: 'checkout',
    stripePriceId,
  }
}

function buildIndividualPlans(
  stripePlan: PlusPlanCatalogItem | null,
  currency: SupportedBillingCurrency,
): PricingPlan[] {
  const freePlan: PricingPlan = {
    id: 'free-open-core',
    name: 'Free (Open Core)',
    price: formatFreePrice(currency),
    period: '/forever',
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
      { text: 'Community & Open Core integrations', status: 'check' },
      { text: 'Official Mr. Tick Plus Addons catalog', status: 'block' },
      { text: 'Team coordination & squad dashboards', status: 'block' },
    ],
    cta: 'Download Free',
    actionKind: 'download',
  }

  return [freePlan, buildPlusPlanCard(stripePlan, currency)]
}

function getCurrencyButtonClass(isActive: boolean): string {
  if (isActive) {
    return 'bg-background text-foreground shadow-xs rounded-md px-3 py-1 text-xs font-semibold transition-all'
  }
  return 'text-muted-foreground hover:text-foreground rounded-md px-3 py-1 text-xs font-medium transition-all'
}

function getCardContainerClass(plan: PricingPlan): string {
  if (plan.highlighted) {
    return 'border-primary/50 bg-card shadow-primary/5 ring-primary/20 relative flex flex-col justify-between rounded-lg border p-8 shadow-xl ring-1 backdrop-blur-sm transition-all duration-300'
  }
  if (plan.comingSoon) {
    return 'border-border/50 bg-card/50 relative flex flex-col justify-between rounded-lg border p-8 opacity-90 backdrop-blur-sm transition-all duration-300'
  }
  return 'border-border/60 bg-card/70 hover:border-border relative flex flex-col justify-between rounded-lg border p-8 backdrop-blur-sm transition-all duration-300'
}

function getBadgeClass(plan: PricingPlan): string {
  if (plan.comingSoon) {
    return 'border-border bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[10px] font-bold tracking-wide uppercase'
  }
  return 'bg-primary text-primary-foreground rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-wide uppercase shadow-md'
}

function getFeatureTextClass(status: PricingFeature['status']): string {
  if (status === 'check') return 'text-foreground font-medium'
  return 'text-muted-foreground/60 line-through'
}

function renderFeatureIcon(status: PricingFeature['status']): React.ReactNode {
  if (status === 'check') {
    return <Check className="text-primary mt-0.5 size-4 shrink-0" />
  }
  return <X className="text-muted-foreground/40 mt-0.5 size-4 shrink-0" />
}

export function Pricing() {
  const [currency, setCurrency] =
    React.useState<SupportedBillingCurrency>('usd')
  const [stripePlan, setStripePlan] =
    React.useState<PlusPlanCatalogItem | null>(null)
  const [isLoadingCheckout, setIsLoadingCheckout] = React.useState(false)
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null)
  const [checkoutSuccess, setCheckoutSuccess] = React.useState(false)

  React.useEffect(() => {
    const preferred = detectBrowserPreferredCurrency()
    setCurrency(preferred)

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('checkout') === 'success') {
        setCheckoutSuccess(true)
      }
    }

    let isMounted = true
    fetchPlusPlansCatalog().then((catalog) => {
      if (!isMounted) return
      if (!catalog) return
      const firstPlan = catalog.plans[0]
      if (firstPlan) {
        setStripePlan(firstPlan)
      }
      if (catalog.countryCode) {
        setCurrency(normalizeSupportedCurrency(catalog.recommendedCurrency))
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  const handleCheckout = async (plan: PricingPlan) => {
    setCheckoutError(null)
    setIsLoadingCheckout(true)
    const origin = window.location.origin
    const session = await createPlusCheckout({
      priceId: plan.stripePriceId,
      currency,
      successUrl: `${origin}/?checkout=success#pricing`,
      cancelUrl: `${origin}/#pricing`,
    })
    if (!session) {
      setIsLoadingCheckout(false)
      setCheckoutError(
        'Could not start checkout session right now. Please try again in a moment.',
      )
      return
    }
    window.location.assign(session.url)
  }

  const individualPlans = buildIndividualPlans(stripePlan, currency)

  return (
    <section
      id="pricing"
      className="bg-muted/15 relative overflow-hidden py-24 lg:py-32"
    >
      <div className="container mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <div className="border-primary/25 bg-primary/5 text-primary mb-3.5 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold">
            <Sparkles className="size-3.5" />
            Simple, Transparent Pricing
          </div>

          <h2 className="text-foreground text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Start free. Upgrade to Mr. Tick Plus anytime.
          </h2>

          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
            Mr. Tick is Open Core. Free forever for local individual use, with
            Mr. Tick Plus for official addons and multi-device sync.
          </p>

          {/* Currency Switcher */}
          <div className="mt-6 flex items-center justify-center">
            <div className="border-border/60 bg-muted/60 inline-flex items-center gap-1 rounded-lg border p-1">
              <span className="text-muted-foreground flex items-center gap-1 px-2.5 text-[11px] font-medium">
                <Globe className="size-3" />
                Currency:
              </span>
              <button
                type="button"
                onClick={() => setCurrency('brl')}
                className={getCurrencyButtonClass(currency === 'brl')}
              >
                BRL (R$) · Brasil
              </button>
              <button
                type="button"
                onClick={() => setCurrency('usd')}
                className={getCurrencyButtonClass(currency === 'usd')}
              >
                USD ($) · International
              </button>
            </div>
          </div>
        </div>

        {checkoutSuccess && (
          <div className="border-primary/40 bg-primary/10 text-foreground mx-auto mb-8 flex max-w-2xl items-center gap-3 rounded-lg border px-4 py-3 text-xs font-medium">
            <CheckCircle2 className="text-primary size-4 shrink-0" />
            <span>
              Subscription confirmed! Your Mr. Tick Plus activation key has been
              sent to your checkout email.
            </span>
          </div>
        )}

        {checkoutError && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive mx-auto mb-8 max-w-2xl rounded-lg border px-4 py-3 text-center text-xs font-medium">
            {checkoutError}
          </div>
        )}

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
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase">
                  Soon
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Individual Plans */}
          <TabsContent value="individual">
            <div className="grid gap-6 md:grid-cols-2">
              {individualPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isLoadingCheckout={isLoadingCheckout}
                  onCheckout={handleCheckout}
                />
              ))}
            </div>
          </TabsContent>

          {/* Enterprise Plans */}
          <TabsContent value="enterprise">
            <div className="grid gap-6 md:grid-cols-2">
              {ENTERPRISE_PLANS.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isLoadingCheckout={isLoadingCheckout}
                  onCheckout={handleCheckout}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  isLoadingCheckout,
  onCheckout,
}: {
  plan: PricingPlan
  isLoadingCheckout: boolean
  onCheckout: (plan: PricingPlan) => Promise<void>
}) {
  return (
    <div className={getCardContainerClass(plan)}>
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-3 right-6">
          <span className={getBadgeClass(plan)}>
            {plan.comingSoon && <Clock className="size-3" />}
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
                {renderFeatureIcon(feature.status)}
                <span className={getFeatureTextClass(feature.status)}>
                  {feature.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-8">
        {plan.actionKind === 'download' && (
          <Button
            asChild
            variant="outline"
            className="w-full text-xs font-semibold"
          >
            <a href="/download">{plan.cta}</a>
          </Button>
        )}

        {plan.actionKind === 'checkout' && (
          <Button
            type="button"
            variant="default"
            disabled={isLoadingCheckout}
            onClick={() => void onCheckout(plan)}
            className="w-full text-xs font-semibold"
          >
            {isLoadingCheckout && (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            )}
            {plan.cta}
          </Button>
        )}

        {plan.actionKind === 'coming-soon' && (
          <Button
            type="button"
            variant="outline"
            disabled
            className="w-full cursor-not-allowed text-xs font-semibold opacity-60"
          >
            <Clock className="mr-1.5 size-3.5" />
            {plan.cta}
          </Button>
        )}
      </div>
    </div>
  )
}
