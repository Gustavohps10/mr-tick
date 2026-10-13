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
const LOCAL_MISTERTICK_API_URL = 'http://localhost:8787'

export function resolveMisterTickApiCandidateUrls(): string[] {
  const configured = process.env.NEXT_PUBLIC_MISTERTICK_API_URL
  if (configured) {
    const trimmed = configured.trim()
    if (trimmed.length > 0) return [trimmed.replace(/\/+$/, '')]
  }
  if (typeof window !== 'undefined') {
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return [LOCAL_MISTERTICK_API_URL, DEFAULT_MISTERTICK_API_URL]
    }
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
  const fallback = plan.currencyOptions[0]
  if (fallback) return fallback
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

export async function createPlusCheckout(input: {
  priceId?: string
  currency: SupportedBillingCurrency
  successUrl: string
  cancelUrl: string
}): Promise<CreateCheckoutSessionResponse | null> {
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
      if (!response.ok) continue
      const data: CreateCheckoutSessionResponse = await response.json()
      if (!data.url) continue
      return data
    } catch {
      continue
    }
  }
  return null
}
