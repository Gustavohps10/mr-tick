'use client'

import { useLocale } from 'next-intl'
import * as React from 'react'

import { getPathname, usePathname } from '@/i18n/navigation'

export function LanguageToggle() {
  const currentLocale = useLocale()
  const pathname = usePathname()
  const [pending, setPending] = React.useState(false)

  const switchLocale = (newLocale: 'en' | 'pt-br') => {
    if (newLocale === currentLocale) return
    // A locale change replaces the root document and its theme bootstrap script.
    // The explicit prefix lets middleware save the choice before canonicalizing EN.
    const href = getPathname({
      href: pathname + window.location.search + window.location.hash,
      locale: newLocale,
      forcePrefix: true,
    })
    setPending(true)
    window.location.replace(href)
  }

  return (
    <div className="border-border/60 bg-muted/50 flex items-center rounded-lg border p-0.5 text-xs">
      <button
        type="button"
        disabled={pending}
        aria-pressed={currentLocale === 'en'}
        onClick={() => switchLocale('en')}
        className={`rounded px-2 py-0.5 font-medium transition-all ${currentLocale === 'en' ? 'bg-background text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={currentLocale === 'pt-br'}
        onClick={() => switchLocale('pt-br')}
        className={`rounded px-2 py-0.5 font-medium transition-all ${currentLocale === 'pt-br' ? 'bg-background text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
        title="Português (Brasil)"
      >
        PT
      </button>
    </div>
  )
}
