'use client'

import { Button } from '@mr-tick/ui/button'
import { Input } from '@mr-tick/ui/input'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import * as React from 'react'

import { Footer } from '@/app/components/footer'
import { EmailVerificationModal } from '@/components/email-verification-modal'
import { Link } from '@/i18n/navigation'
import {
  createPlusCheckout,
  fetchPlusPlansCatalog,
  findCurrencyOption,
  formatFreePrice,
  formatUnitAmount,
  type PlusPlanCatalogItem,
  type RecoveredLicenseItem,
  recoverLicensesApi,
  rotateLicenseKeyApi,
  sendEmailVerificationCode,
  type SupportedBillingCurrency,
  verifyEmailVerificationCode,
} from '@/lib/billing'

export interface LicenseViewProps {
  navbar: React.ReactNode
  initialCurrency?: SupportedBillingCurrency
  initialPlan?: PlusPlanCatalogItem | null
}

function resolveErrorMessage(
  errorCode: string | undefined,
  t: (key: string) => string,
): string {
  if (!errorCode) return t('errors.generic')
  if (
    errorCode === 'RATE_LIMIT_EXCEEDED' ||
    errorCode === 'MAX_ATTEMPTS_EXCEEDED'
  ) {
    return t('errors.rateLimit')
  }
  if (errorCode === 'NETWORK_ERROR') {
    return t('errors.network')
  }
  if (errorCode === 'INVALID_CODE') {
    return t('errors.invalidCode')
  }
  return errorCode
}

function validateEmail(val: string): boolean {
  const trimmed = val.trim()
  if (!trimmed.includes('@')) return false
  if (!trimmed.includes('.')) return false
  return trimmed.length >= 5
}

function LicenseViewInner({
  initialCurrency,
  initialPlan,
}: {
  initialCurrency?: SupportedBillingCurrency
  initialPlan?: PlusPlanCatalogItem | null
}) {
  const t = useTranslations('licensePage')
  const tPricing = useTranslations('pricing')
  const locale = useLocale()
  const searchParams = useSearchParams()

  // Currency & Catalog state
  let resolvedCurrency: SupportedBillingCurrency = 'usd'
  if (initialCurrency) {
    resolvedCurrency = initialCurrency
  }
  if (!initialCurrency && locale === 'pt-br') {
    resolvedCurrency = 'brl'
  }
  const currency = resolvedCurrency
  const [stripePlan, setStripePlan] =
    React.useState<PlusPlanCatalogItem | null>(() => {
      if (initialPlan) return initialPlan
      return null
    })

  // Self-service & modal action states
  const initialAction = searchParams.get('action')
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = React.useState(
    () => initialAction === 'checkout',
  )
  const [showRecover, setShowRecover] = React.useState(
    () => initialAction === 'recover',
  )
  const [showRotate, setShowRotate] = React.useState(
    () => initialAction === 'rotate',
  )

  // Recover states
  const [recoverEmail, setRecoverEmail] = React.useState('')
  const [recoverCode, setRecoverCode] = React.useState('')
  const [recoverStep, setRecoverStep] = React.useState<
    'email' | 'code' | 'results'
  >('email')
  const [recoverLoading, setRecoverLoading] = React.useState(false)
  const [recoverError, setRecoverError] = React.useState<string | null>(null)
  const [recoveredLicenses, setRecoveredLicenses] = React.useState<
    RecoveredLicenseItem[]
  >([])

  // Rotate states
  const [rotateEmail, setRotateEmail] = React.useState('')
  const [rotateCode, setRotateCode] = React.useState('')
  const [rotateStep, setRotateStep] = React.useState<
    'email' | 'code' | 'select' | 'success'
  >('email')
  const [rotateLoading, setRotateLoading] = React.useState(false)
  const [rotateError, setRotateError] = React.useState<string | null>(null)
  const [rotateVerificationToken, setRotateVerificationToken] = React.useState<
    string | null
  >(null)
  const [rotatableLicenses, setRotatableLicenses] = React.useState<
    RecoveredLicenseItem[]
  >([])
  const [confirmRotateId, setConfirmRotateId] = React.useState<string | null>(
    null,
  )
  const [rotatedResult, setRotatedResult] = React.useState<{
    newKey: string
    revokedCount: number
  } | null>(null)

  // Copy feedback state
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (stripePlan) return
    let isMounted = true
    fetchPlusPlansCatalog().then((catalog) => {
      if (!isMounted) return
      if (!catalog) return
      const firstPlan = catalog.plans.find(
        (plan) => plan.interval === 'month' && plan.intervalCount === 1,
      )
      if (firstPlan) {
        setStripePlan(firstPlan)
      }
    })

    return () => {
      isMounted = false
    }
  }, [stripePlan])

  const handleCopy = (keyString: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(keyString)
      setCopiedKey(keyString)
      window.setTimeout(() => {
        setCopiedKey(null)
      }, 2500)
    }
  }

  // --- Handlers: Checkout Modal ---
  const handleCheckoutVerified = async (
    verifiedEmail: string,
    token: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const origin = window.location.origin
    let priceIdToUse: string | undefined
    if (stripePlan) {
      const option = findCurrencyOption(stripePlan, currency)
      if (option) {
        priceIdToUse = stripePlan.priceId
      }
    }

    let successPath = '/billing/success?session_id={CHECKOUT_SESSION_ID}'
    let cancelPath = '/billing/cancel'
    if (locale === 'pt-br') {
      successPath = '/pt-br/billing/success?session_id={CHECKOUT_SESSION_ID}'
      cancelPath = '/pt-br/billing/cancel'
    }

    const outcome = await createPlusCheckout({
      priceId: priceIdToUse,
      currency,
      email: verifiedEmail,
      verificationToken: token,
      successUrl: `${origin}${successPath}`,
      cancelUrl: `${origin}${cancelPath}`,
    })

    if (!outcome.ok || !outcome.url) {
      return { ok: false, error: outcome.error }
    }
    window.location.assign(outcome.url)
    return { ok: true }
  }

  // --- Handlers: Recover ---
  const handleRecoverSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setRecoverError(null)
    const normalized = recoverEmail.trim().toLowerCase()
    if (!validateEmail(normalized)) {
      setRecoverError(t('errors.invalidEmail'))
      return
    }
    setRecoverLoading(true)
    const result = await sendEmailVerificationCode(normalized)
    setRecoverLoading(false)
    if (!result.ok) {
      setRecoverError(resolveErrorMessage(result.error, t))
      return
    }
    setRecoverStep('code')
  }

  const handleRecoverVerifyAndFetch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setRecoverError(null)
    const normalizedEmail = recoverEmail.trim().toLowerCase()
    const trimmedCode = recoverCode.trim()
    if (trimmedCode.length !== 6) {
      setRecoverError(t('errors.invalidCode'))
      return
    }
    setRecoverLoading(true)
    const verifyResult = await verifyEmailVerificationCode(
      normalizedEmail,
      trimmedCode,
    )
    if (!verifyResult.ok || !verifyResult.verificationToken) {
      setRecoverLoading(false)
      setRecoverError(resolveErrorMessage(verifyResult.error, t))
      return
    }

    const recoverResult = await recoverLicensesApi(
      normalizedEmail,
      verifyResult.verificationToken,
    )
    setRecoverLoading(false)
    if (!recoverResult.ok || !recoverResult.data) {
      setRecoverError(resolveErrorMessage(recoverResult.error, t))
      return
    }
    setRecoveredLicenses(recoverResult.data.licenses)
    setRecoverStep('results')
  }

  // --- Handlers: Rotate ---
  const handleRotateSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setRotateError(null)
    const normalized = rotateEmail.trim().toLowerCase()
    if (!validateEmail(normalized)) {
      setRotateError(t('errors.invalidEmail'))
      return
    }
    setRotateLoading(true)
    const result = await sendEmailVerificationCode(normalized)
    setRotateLoading(false)
    if (!result.ok) {
      setRotateError(resolveErrorMessage(result.error, t))
      return
    }
    setRotateStep('code')
  }

  const handleRotateVerifyIdentity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setRotateError(null)
    const normalizedEmail = rotateEmail.trim().toLowerCase()
    const trimmedCode = rotateCode.trim()
    if (trimmedCode.length !== 6) {
      setRotateError(t('errors.invalidCode'))
      return
    }
    setRotateLoading(true)
    const verifyResult = await verifyEmailVerificationCode(
      normalizedEmail,
      trimmedCode,
    )
    if (!verifyResult.ok || !verifyResult.verificationToken) {
      setRotateLoading(false)
      setRotateError(resolveErrorMessage(verifyResult.error, t))
      return
    }
    setRotateVerificationToken(verifyResult.verificationToken)

    const recoverResult = await recoverLicensesApi(
      normalizedEmail,
      verifyResult.verificationToken,
    )
    setRotateLoading(false)
    if (!recoverResult.ok || !recoverResult.data) {
      setRotateError(resolveErrorMessage(recoverResult.error, t))
      return
    }
    setRotatableLicenses(recoverResult.data.licenses)
    setRotateStep('select')
  }

  const handleExecuteRotate = async (licenseId: string) => {
    if (!rotateVerificationToken) return
    setRotateError(null)
    setRotateLoading(true)
    const normalizedEmail = rotateEmail.trim().toLowerCase()
    const result = await rotateLicenseKeyApi(
      normalizedEmail,
      licenseId,
      rotateVerificationToken,
    )
    setRotateLoading(false)
    setConfirmRotateId(null)

    if (!result.ok || !result.data) {
      setRotateError(resolveErrorMessage(result.error, t))
      return
    }

    setRotatedResult({
      newKey: result.data.newActivationKey,
      revokedCount: result.data.revokedDevicesCount,
    })
    setRotateStep('success')
  }

  // Price formatting
  let formattedPrice = '$7'
  if (currency === 'brl') {
    formattedPrice = 'R$ 19,90'
  }
  if (stripePlan) {
    const opt = findCurrencyOption(stripePlan, currency)
    if (opt) {
      formattedPrice = formatUnitAmount(opt.unitAmount, currency)
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-10 text-center sm:text-left">
        <h1 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
      </div>

      {/* Plans Comparison Grid */}
      <div className="mb-12">
        <div className="mb-6">
          <h2 className="text-foreground text-lg font-bold">
            {tPricing('title')}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {tPricing('subtitle')}
          </p>
        </div>

        {/* 3 Plans Scheme */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Plan 1: Free Open-Core */}
          <div className="border-border/60 bg-card/60 flex flex-col justify-between rounded-lg border p-6 backdrop-blur-sm">
            <div>
              <div className="mb-4">
                <span className="border-border/80 bg-muted/60 text-muted-foreground rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase">
                  Open Core
                </span>
                <h3 className="text-foreground mt-2 text-base font-bold">
                  {tPricing('freePlan.name')}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {tPricing('freePlan.description')}
                </p>
              </div>

              <div className="border-border/40 border-t pt-3 pb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-foreground text-2xl font-extrabold tracking-tight">
                    {formatFreePrice(currency)}
                  </span>
                  <span className="text-muted-foreground text-xs font-medium">
                    {tPricing('freePlan.period')}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground">
                    {tPricing('freePlan.features.desktop')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground">
                    {tPricing('freePlan.features.persistence')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground">
                    {tPricing('freePlan.features.shortcuts')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground">
                    {tPricing('freePlan.features.community')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <X className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground/60 line-through">
                    {tPricing('freePlan.features.addonsBlock')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <X className="text-muted-foreground/40 mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground/60 line-through">
                    {tPricing('freePlan.features.teamsBlock')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full text-xs font-semibold"
              >
                <Link href="/download">
                  <Download className="mr-1.5 size-3.5" />
                  {tPricing('downloadFree')}
                </Link>
              </Button>
            </div>
          </div>

          {/* Plan 2: Mr. Tick Plus (Featured) */}
          <div className="border-primary/50 bg-card shadow-primary/5 ring-primary/20 relative flex flex-col justify-between rounded-lg border p-6 shadow-md ring-1 backdrop-blur-sm">
            <div>
              <div className="mb-4">
                <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase">
                  {tPricing('plusPlan.badge')}
                </span>
                <h3 className="text-foreground mt-2 text-base font-bold">
                  Mr. Tick Plus
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {tPricing('plusPlan.description')}
                </p>
              </div>

              <div className="border-border/40 border-t pt-3 pb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-foreground text-2xl font-extrabold tracking-tight">
                    {formattedPrice}
                  </span>
                  <span className="text-muted-foreground text-xs font-medium">
                    /mês
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground font-medium">
                    {t('checkout.features.addons')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground font-medium">
                    {t('checkout.features.devices')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground font-medium">
                    {t('checkout.features.sync')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground font-medium">
                    {t('checkout.features.offline')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span className="text-foreground font-medium">
                    {t('checkout.features.cancelAnytime')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                type="button"
                size="sm"
                className="w-full text-xs font-semibold"
                onClick={() => setIsCheckoutModalOpen(true)}
              >
                {t('checkout.cardTitle')}
              </Button>
            </div>
          </div>

          {/* Plan 3: Team & Enterprise */}
          <div className="border-border/60 bg-card/40 flex flex-col justify-between rounded-lg border p-6 opacity-85 backdrop-blur-sm">
            <div>
              <div className="mb-4">
                <span className="border-border/80 bg-muted/60 text-muted-foreground rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase">
                  {tPricing('soon')}
                </span>
                <h3 className="text-foreground mt-2 text-base font-bold">
                  {tPricing('team.name')}
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {tPricing('team.description')}
                </p>
              </div>

              <div className="border-border/40 border-t pt-3 pb-4">
                <span className="text-muted-foreground text-sm font-semibold">
                  {tPricing('comingSoon')}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {tPricing('team.workspaces')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {tPricing('team.capacity')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {tPricing('team.reports')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {tPricing('enterprise.infrastructure')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    {tPricing('enterprise.sso')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="w-full text-xs font-semibold opacity-60"
              >
                <Building2 className="mr-1.5 size-3.5" />
                {tPricing('comingSoon')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Verification Modal */}
      <EmailVerificationModal
        open={isCheckoutModalOpen}
        onOpenChange={setIsCheckoutModalOpen}
        onVerified={handleCheckoutVerified}
      />

      {/* Self-service management sections */}
      <div className="mt-8 space-y-4">
        {/* Section 1: Key Recovery */}
        <div
          id="recover"
          className="border-border/60 bg-card/60 rounded-lg border p-6 backdrop-blur-sm"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <KeyRound className="text-muted-foreground size-4" />
                <h3 className="text-foreground text-sm font-semibold">
                  {t('recoverSection.title')}
                </h3>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('recoverSection.desc')}
              </p>
            </div>

            {!showRecover && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => setShowRecover(true)}
              >
                {t('recoverSection.actionBtn')}
              </Button>
            )}
          </div>

          {showRecover && (
            <div className="mt-6 border-t pt-4">
              {recoverError && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{recoverError}</span>
                </div>
              )}

              {recoverStep === 'email' && (
                <form
                  onSubmit={handleRecoverSendCode}
                  className="max-w-md space-y-4"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="recover-email-input"
                      className="text-foreground text-xs font-semibold"
                    >
                      {t('recoverSection.emailLabel')}
                    </label>
                    <div className="relative">
                      <Mail className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                      <Input
                        id="recover-email-input"
                        type="email"
                        required
                        placeholder={t('recoverSection.emailPlaceholder')}
                        value={recoverEmail}
                        onChange={(e) => setRecoverEmail(e.target.value)}
                        className="pl-9 text-xs"
                        disabled={recoverLoading}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="gap-2 text-xs font-semibold"
                    disabled={recoverLoading}
                  >
                    {recoverLoading && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t('recoverSection.sendBtn')}
                    {!recoverLoading && <ArrowRight className="size-3.5" />}
                  </Button>
                </form>
              )}

              {recoverStep === 'code' && (
                <form
                  onSubmit={handleRecoverVerifyAndFetch}
                  className="max-w-md space-y-4"
                >
                  <p className="text-muted-foreground text-xs">
                    {t('recoverSection.codeDesc', { email: recoverEmail })}
                  </p>

                  <div className="space-y-2">
                    <Input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="000000"
                      value={recoverCode}
                      onChange={(e) =>
                        setRecoverCode(e.target.value.replace(/\D/g, ''))
                      }
                      className="text-center font-mono text-base tracking-widest"
                      disabled={recoverLoading}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="gap-2 text-xs font-semibold"
                    disabled={recoverLoading}
                  >
                    {recoverLoading && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t('recoverSection.verifyBtn')}
                  </Button>
                </form>
              )}

              {recoverStep === 'results' && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-xs">
                    {t('recoverSection.emailSent')}
                  </p>

                  {recoveredLicenses.length === 0 && (
                    <div className="border-border/60 bg-muted/20 text-muted-foreground rounded-lg border p-4 text-xs">
                      {t('recoverSection.empty')}
                    </div>
                  )}

                  <div className="space-y-3">
                    {recoveredLicenses.map((item, index) => {
                      const itemKey =
                        item.id ||
                        item.licenseId ||
                        item.activationKey ||
                        `lic-${index}`
                      return (
                        <div
                          key={itemKey}
                          className="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-foreground font-semibold">
                              Mr. Tick Plus ({item.status.toUpperCase()})
                            </span>
                            <span className="text-muted-foreground">
                              {item.maxDevices} dispositivos
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="bg-background border-border/80 text-foreground flex-1 rounded-md border px-3 py-1.5 font-mono text-xs select-all">
                              {item.activationKey}
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => handleCopy(item.activationKey)}
                            >
                              {copiedKey === item.activationKey ? (
                                <Check className="text-primary size-3.5" />
                              ) : (
                                <Copy className="text-muted-foreground size-3.5" />
                              )}
                              {copiedKey === item.activationKey
                                ? t('recoverSection.copied')
                                : t('recoverSection.copy')}
                            </Button>
                          </div>

                          <div className="flex justify-end pt-1">
                            <Button
                              asChild
                              size="sm"
                              className="gap-1.5 text-xs"
                            >
                              <a
                                href={`mistertick://activate?key=${encodeURIComponent(
                                  item.activationKey,
                                )}`}
                              >
                                <ExternalLink className="size-3.5" />
                                {t('recoverSection.activateDesktop')}
                              </a>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Compromised Key / Rotate */}
        <div
          id="rotate"
          className="border-border/60 bg-card/60 rounded-lg border p-6 backdrop-blur-sm"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-muted-foreground size-4" />
                <h3 className="text-foreground text-sm font-semibold">
                  {t('rotateSection.title')}
                </h3>
              </div>
              <p className="text-muted-foreground text-xs">
                {t('rotateSection.desc')}
              </p>
            </div>

            {!showRotate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => setShowRotate(true)}
              >
                {t('rotateSection.actionBtn')}
              </Button>
            )}
          </div>

          {showRotate && (
            <div className="mt-6 border-t pt-4">
              <div className="border-border/60 bg-muted/30 text-muted-foreground mb-4 rounded-lg border p-3 text-xs leading-relaxed">
                {t('rotateSection.warning')}
              </div>

              {rotateError && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{rotateError}</span>
                </div>
              )}

              {rotateStep === 'email' && (
                <form
                  onSubmit={handleRotateSendCode}
                  className="max-w-md space-y-4"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="rotate-email-input"
                      className="text-foreground text-xs font-semibold"
                    >
                      {t('rotateSection.emailLabel')}
                    </label>
                    <div className="relative">
                      <Mail className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                      <Input
                        id="rotate-email-input"
                        type="email"
                        required
                        placeholder={t('rotateSection.emailPlaceholder')}
                        value={rotateEmail}
                        onChange={(e) => setRotateEmail(e.target.value)}
                        className="pl-9 text-xs"
                        disabled={rotateLoading}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="gap-2 text-xs font-semibold"
                    disabled={rotateLoading}
                  >
                    {rotateLoading && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t('rotateSection.sendBtn')}
                    {!rotateLoading && <ArrowRight className="size-3.5" />}
                  </Button>
                </form>
              )}

              {rotateStep === 'code' && (
                <form
                  onSubmit={handleRotateVerifyIdentity}
                  className="max-w-md space-y-4"
                >
                  <p className="text-muted-foreground text-xs">
                    {t('rotateSection.codeDesc', { email: rotateEmail })}
                  </p>

                  <div className="space-y-2">
                    <Input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="000000"
                      value={rotateCode}
                      onChange={(e) =>
                        setRotateCode(e.target.value.replace(/\D/g, ''))
                      }
                      className="text-center font-mono text-base tracking-widest"
                      disabled={rotateLoading}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="gap-2 text-xs font-semibold"
                    disabled={rotateLoading}
                  >
                    {rotateLoading && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t('rotateSection.confirmBtn')}
                  </Button>
                </form>
              )}

              {rotateStep === 'select' && (
                <div className="space-y-4">
                  <h4 className="text-foreground text-xs font-semibold">
                    {t('rotateSection.selectTitle')}
                  </h4>

                  <div className="space-y-3">
                    {rotatableLicenses.map((lic, index) => {
                      const licId = lic.licenseId || lic.id || lic.activationKey
                      const licKey = `${licId}-${index}`
                      return (
                        <div
                          key={licKey}
                          className="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-foreground font-semibold">
                              {lic.activationKey}
                            </span>
                            <span className="text-muted-foreground">
                              {lic.maxDevices} dispositivos
                            </span>
                          </div>

                          {confirmRotateId === licId ? (
                            <div className="border-destructive/40 bg-destructive/10 space-y-3 rounded-lg border p-3">
                              <p className="text-destructive text-xs font-medium">
                                {t('rotateSection.confirmQuestion')}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs font-semibold"
                                  onClick={() => handleExecuteRotate(licId)}
                                  disabled={rotateLoading}
                                >
                                  {rotateLoading && (
                                    <Loader2 className="mr-1.5 size-3 animate-spin" />
                                  )}
                                  {t('rotateSection.confirmBtn')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => setConfirmRotateId(null)}
                                  disabled={rotateLoading}
                                >
                                  {t('rotateSection.confirmCancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="gap-1.5 text-xs font-semibold"
                              onClick={() => setConfirmRotateId(licId)}
                            >
                              <RotateCcw className="size-3" />
                              {t('rotateSection.actionBtn')}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {rotateStep === 'success' && rotatedResult && (
                <div className="space-y-4">
                  <div className="border-border/60 bg-muted/30 space-y-1 rounded-lg border p-4 text-xs">
                    <p className="text-foreground font-semibold">
                      {t('rotateSection.successTitle')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('rotateSection.successDesc', {
                        count: rotatedResult.revokedCount,
                      })}
                    </p>
                  </div>

                  <div className="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-4">
                    <label className="text-foreground text-xs font-semibold">
                      {t('rotateSection.newKeyLabel')}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="bg-background border-border/80 text-foreground flex-1 rounded-md border px-3 py-1.5 font-mono text-xs select-all">
                        {rotatedResult.newKey}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={() => handleCopy(rotatedResult.newKey)}
                      >
                        {copiedKey === rotatedResult.newKey ? (
                          <Check className="text-primary size-3.5" />
                        ) : (
                          <Copy className="text-muted-foreground size-3.5" />
                        )}
                        {copiedKey === rotatedResult.newKey
                          ? t('rotateSection.copied')
                          : t('rotateSection.copy')}
                      </Button>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button asChild size="sm" className="gap-1.5 text-xs">
                        <a
                          href={`mistertick://activate?key=${encodeURIComponent(
                            rotatedResult.newKey,
                          )}`}
                        >
                          <ExternalLink className="size-3.5" />
                          {t('rotateSection.activateDesktop')}
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LicenseView({
  navbar,
  initialCurrency,
  initialPlan,
}: LicenseViewProps) {
  return (
    <div className="bg-background text-foreground selection:bg-primary/30 flex min-h-screen flex-col antialiased">
      {navbar}
      <main className="flex-1 pt-24 pb-16">
        <React.Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="text-primary size-6 animate-spin" />
            </div>
          }
        >
          <LicenseViewInner
            initialCurrency={initialCurrency}
            initialPlan={initialPlan}
          />
        </React.Suspense>
      </main>
      <Footer />
    </div>
  )
}
