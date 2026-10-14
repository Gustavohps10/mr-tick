import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'

import { Navbar } from '@/app/components/navbar'
import {
  fetchPlusPlansCatalog,
  resolveServerSideBillingCurrency,
} from '@/lib/billing'

import LicenseView from './license-view'

interface LicensePageProps {
  params?: Promise<{ locale?: string }>
}

export default async function LicensePage(props: LicensePageProps) {
  let locale: string | null = null
  if (props.params) {
    const resolvedParams = await props.params
    if (resolvedParams.locale) {
      locale = resolvedParams.locale
    }
  }
  if (!locale) {
    try {
      locale = await getLocale()
    } catch {}
  }

  const headerList = await headers()
  let countryCode: string | null = null
  const cfCountry = headerList.get('cf-ipcountry')
  if (cfCountry) {
    countryCode = cfCountry
  }
  if (!cfCountry) {
    const vercelCountry = headerList.get('x-vercel-ip-country')
    if (vercelCountry) {
      countryCode = vercelCountry
    }
  }
  const acceptLanguage = headerList.get('accept-language')

  const currency = resolveServerSideBillingCurrency({
    countryCode,
    acceptLanguage,
    locale,
  })

  const catalog = await fetchPlusPlansCatalog()
  let initialPlan = null
  if (catalog) {
    const foundPlan = catalog.plans.find(
      (plan) => plan.interval === 'month' && plan.intervalCount === 1,
    )
    if (foundPlan) {
      initialPlan = foundPlan
    }
  }

  return (
    <LicenseView
      navbar={<Navbar />}
      initialCurrency={currency}
      initialPlan={initialPlan}
    />
  )
}
