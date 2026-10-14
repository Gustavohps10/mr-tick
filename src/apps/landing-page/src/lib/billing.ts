export type SupportedBillingCurrency = 'brl' | 'usd'

export interface PlusPlanPriceOption {
  currency: string
  unitAmount: number
}

export interface PlusPlanCatalogItem {
  priceId: string
  productId: string
  name: string
  description: string | null
  interval: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
  defaultCurrency: string
  currencyOptions: PlusPlanPriceOption[]
}

export interface BillingPlansCatalogResponse {
  recommendedCurrency: string
  countryCode: string | null
  plans: PlusPlanCatalogItem[]
}

export interface CreateCheckoutSessionResponse {
  sessionId: string
  url: string
}

const DEFAULT_MISTERTICK_API_URL =
  'https://mistertick-api.mistertick.workers.dev'

export function resolveMisterTickApiCandidateUrls(): string[] {
  const configured = process.env.NEXT_PUBLIC_MISTERTICK_API_URL
  if (configured) {
    const trimmed = configured.trim()
    if (trimmed.length > 0) return [trimmed.replace(/\/+$/, '')]
  }
  return [DEFAULT_MISTERTICK_API_URL]
}

export function normalizeSupportedCurrency(
  currency: string | undefined,
): SupportedBillingCurrency {
  if (!currency) return 'usd'
  const normalized = currency.trim().toLowerCase()
  if (normalized === 'brl') return 'brl'
  return 'usd'
}

export interface ResolveBillingCurrencyInput {
  countryCode?: string | null
  acceptLanguage?: string | null
  locale?: string | null
}

export function resolveServerSideBillingCurrency(
  input: ResolveBillingCurrencyInput,
): SupportedBillingCurrency {
  if (input.countryCode) {
    const code = input.countryCode.trim().toUpperCase()
    if (code === 'BR') {
      return 'brl'
    }
  }
  if (input.locale) {
    const loc = input.locale.trim().toLowerCase()
    if (loc === 'pt-br' || loc === 'pt') {
      return 'brl'
    }
  }
  if (input.acceptLanguage) {
    const lang = input.acceptLanguage.toLowerCase()
    if (lang.includes('pt-br')) {
      return 'brl'
    }
  }
  return 'usd'
}

export function detectBrowserPreferredCurrency(): SupportedBillingCurrency {
  if (typeof window === 'undefined') return 'usd'
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timeZone) {
      const normalizedTz = timeZone.toLowerCase()
      if (
        normalizedTz.includes('sao_paulo') ||
        normalizedTz.includes('fortaleza') ||
        normalizedTz.includes('recife') ||
        normalizedTz.includes('belem') ||
        normalizedTz.includes('manaus') ||
        normalizedTz.includes('cuiaba') ||
        normalizedTz.includes('porto_velho') ||
        normalizedTz.includes('boa_vista') ||
        normalizedTz.includes('rio_branco') ||
        normalizedTz.includes('maceio') ||
        normalizedTz.includes('bahia') ||
        normalizedTz.includes('araguaina') ||
        normalizedTz.includes('noronha')
      ) {
        return 'brl'
      }
    }
    const language = window.navigator.language
    if (language) {
      if (language.toLowerCase().startsWith('pt-br')) return 'brl'
    }
  } catch {
    return 'usd'
  }
  return 'usd'
}

export function formatFreePrice(currency: SupportedBillingCurrency): string {
  if (currency === 'brl') return 'R$ 0'
  return '$0'
}

export function formatUnitAmount(
  unitAmount: number,
  currency: SupportedBillingCurrency,
): string {
  const majorUnits = unitAmount / 100
  if (currency === 'brl') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(majorUnits)
  }
  const hasCents = unitAmount % 100 !== 0
  if (hasCents) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(majorUnits)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(majorUnits)
}

export function formatPlanInterval(
  interval: PlusPlanCatalogItem['interval'],
  intervalCount: number,
): string {
  if (intervalCount === 1) return `/${interval}`
  return `/${intervalCount} ${interval}s`
}

export function findCurrencyOption(
  plan: PlusPlanCatalogItem,
  currency: SupportedBillingCurrency,
): PlusPlanPriceOption | null {
  const match = plan.currencyOptions.find(
    (option) => option.currency.toLowerCase() === currency,
  )
  if (match) return match
  return null
}

export async function fetchPlusPlansCatalog(): Promise<BillingPlansCatalogResponse | null> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/plans`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      })
      if (!response.ok) continue
      const data: BillingPlansCatalogResponse = await response.json()
      if (!Array.isArray(data.plans)) continue
      return data
    } catch {
      continue
    }
  }
  return null
}

export interface SendVerificationCodeResponse {
  sent: boolean
  expiresInSeconds: number
}

export interface VerifyCodeResponse {
  verified: boolean
  verificationToken?: string
  error?: string
}

export interface RecoveredLicenseItem {
  id: string
  licenseId: string
  activationKey: string
  status: string
  maxDevices: number
  tier?: string
  expiresAt?: string | null
  paidThrough?: number
}

export interface RecoverLicensesResponse {
  recoveredCount: number
  emailDispatched: boolean
  licenses: RecoveredLicenseItem[]
}

export async function sendEmailVerificationCode(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/auth/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        let errMessage = 'REQUEST_FAILED'
        try {
          const body = (await response.json()) as { error?: string }
          if (body.error) errMessage = body.error
        } catch {}
        return { ok: false, error: errMessage }
      }
      return { ok: true }
    } catch {
      continue
    }
  }
  return { ok: false, error: 'NETWORK_ERROR' }
}

export async function verifyEmailVerificationCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; verificationToken?: string; error?: string }> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/auth/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, code }),
      })
      if (!response.ok) {
        let errMessage = 'INVALID_CODE'
        try {
          const body = (await response.json()) as { error?: string }
          if (body.error) errMessage = body.error
        } catch {}
        return { ok: false, error: errMessage }
      }
      const data = (await response.json()) as VerifyCodeResponse
      if (data.verificationToken) {
        return { ok: true, verificationToken: data.verificationToken }
      }
      return { ok: false, error: 'INVALID_CODE' }
    } catch {
      continue
    }
  }
  return { ok: false, error: 'NETWORK_ERROR' }
}

export async function recoverLicensesApi(
  email: string,
  verificationToken: string,
): Promise<{ ok: boolean; data?: RecoverLicensesResponse; error?: string }> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/licenses/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, verificationToken }),
      })
      if (!response.ok) {
        let errMessage = 'RECOVERY_FAILED'
        try {
          const body = (await response.json()) as { error?: string }
          if (body.error) errMessage = body.error
        } catch {}
        return { ok: false, error: errMessage }
      }
      const rawData = (await response.json()) as {
        recoveredCount?: number
        emailDispatched?: boolean
        licenses?: Array<{
          id?: string
          licenseId?: string
          activationKey: string
          status: string
          maxDevices?: number
          tier?: string
          expiresAt?: string | null
          paidThrough?: number
        }>
      }
      const rawList = Array.isArray(rawData.licenses) ? rawData.licenses : []
      const licenses: RecoveredLicenseItem[] = rawList.map((lic) => {
        let uniqueId = lic.licenseId
        if (!uniqueId) uniqueId = lic.id
        if (!uniqueId) uniqueId = lic.activationKey
        let devices = 2
        if (lic.maxDevices !== undefined && lic.maxDevices > 0) {
          devices = lic.maxDevices
        }
        return {
          id: uniqueId,
          licenseId: uniqueId,
          activationKey: lic.activationKey,
          status: lic.status,
          maxDevices: devices,
          tier: lic.tier,
          expiresAt: lic.expiresAt,
          paidThrough: lic.paidThrough,
        }
      })
      const count =
        rawData.recoveredCount !== undefined
          ? rawData.recoveredCount
          : licenses.length
      const data: RecoverLicensesResponse = {
        recoveredCount: count,
        emailDispatched: Boolean(rawData.emailDispatched),
        licenses,
      }
      return { ok: true, data }
    } catch {
      continue
    }
  }
  return { ok: false, error: 'NETWORK_ERROR' }
}

export interface RotateLicenseKeyResponse {
  licenseId: string
  newActivationKey: string
  paidThrough: number
  status: string
  revokedDevicesCount: number
}

export async function rotateLicenseKeyApi(
  email: string,
  licenseId: string,
  verificationToken: string,
): Promise<{ ok: boolean; data?: RotateLicenseKeyResponse; error?: string }> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/licenses/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, licenseId, verificationToken }),
      })
      if (!response.ok) {
        let errMessage = 'ROTATE_FAILED'
        try {
          const body = (await response.json()) as { error?: string }
          if (body.error) errMessage = body.error
        } catch {}
        return { ok: false, error: errMessage }
      }
      const data = (await response.json()) as RotateLicenseKeyResponse
      return { ok: true, data }
    } catch {
      continue
    }
  }
  return { ok: false, error: 'NETWORK_ERROR' }
}

export interface CreatePlusCheckoutResult {
  ok: boolean
  url?: string
  sessionId?: string
  error?: string
}

export async function createPlusCheckout(input: {
  priceId?: string
  currency: SupportedBillingCurrency
  email: string
  verificationToken: string
  successUrl: string
  cancelUrl: string
}): Promise<CreatePlusCheckoutResult> {
  const candidates = resolveMisterTickApiCandidateUrls()
  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        let errMessage = 'CHECKOUT_CREATION_FAILED'
        try {
          const body = (await response.json()) as {
            code?: string
            error?: string
          }
          if (body.code) {
            errMessage = body.code
          }
          if (!body.code && body.error) {
            errMessage = body.error
          }
        } catch {}
        return { ok: false, error: errMessage }
      }
      const data: CreateCheckoutSessionResponse = await response.json()
      if (!data.url) return { ok: false, error: 'INVALID_CHECKOUT_SESSION' }
      return { ok: true, url: data.url, sessionId: data.sessionId }
    } catch {
      continue
    }
  }
  return { ok: false, error: 'NETWORK_ERROR' }
}
