import { describe, expect, it } from 'vitest'

import {
  findCurrencyOption,
  formatFreePrice,
  formatUnitAmount,
  type PlusPlanCatalogItem,
  resolveServerSideBillingCurrency,
} from './billing'

const plan: PlusPlanCatalogItem = {
  priceId: 'price_test',
  productId: 'product_test',
  name: 'Mr. Tick Plus',
  description: null,
  interval: 'month',
  intervalCount: 1,
  defaultCurrency: 'usd',
  currencyOptions: [
    { currency: 'usd', unitAmount: 700 },
    { currency: 'brl', unitAmount: 1990 },
  ],
}

describe('landing currency selection', () => {
  it('uses the amount belonging to the selected currency', () => {
    expect(findCurrencyOption(plan, 'brl')?.unitAmount).toBe(1990)
    expect(findCurrencyOption(plan, 'usd')?.unitAmount).toBe(700)
    expect(formatUnitAmount(1990, 'brl').replace(/\s/g, ' ')).toBe('R$ 19,90')
    expect(formatUnitAmount(700, 'usd')).toBe('$7')
    expect(formatFreePrice('brl')).toBe('R$ 0')
    expect(formatFreePrice('usd')).toBe('$0')
  })

  it('never relabels an amount from another currency', () => {
    const usdOnly: PlusPlanCatalogItem = {
      ...plan,
      currencyOptions: [{ currency: 'usd', unitAmount: 700 }],
    }
    expect(findCurrencyOption(usdOnly, 'brl')).toBeNull()
  })
})

describe('resolveServerSideBillingCurrency', () => {
  it('detects BRL when countryCode is BR', () => {
    expect(resolveServerSideBillingCurrency({ countryCode: 'BR' })).toBe('brl')
    expect(resolveServerSideBillingCurrency({ countryCode: 'br' })).toBe('brl')
  })

  it('detects BRL when locale is pt-br or pt', () => {
    expect(resolveServerSideBillingCurrency({ locale: 'pt-br' })).toBe('brl')
    expect(resolveServerSideBillingCurrency({ locale: 'pt' })).toBe('brl')
  })

  it('detects BRL when acceptLanguage contains pt-br', () => {
    expect(
      resolveServerSideBillingCurrency({
        acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8',
      }),
    ).toBe('brl')
  })

  it('defaults to USD for international users', () => {
    expect(resolveServerSideBillingCurrency({ countryCode: 'US' })).toBe('usd')
    expect(resolveServerSideBillingCurrency({ locale: 'en' })).toBe('usd')
    expect(
      resolveServerSideBillingCurrency({
        acceptLanguage: 'en-US,en;q=0.9',
      }),
    ).toBe('usd')
    expect(resolveServerSideBillingCurrency({})).toBe('usd')
  })
})
