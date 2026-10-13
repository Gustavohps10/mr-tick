'use client'

import * as React from 'react'

export function LanguageToggle() {
  const [currentLocale, setCurrentLocale] = React.useState<'en' | 'pt-br'>('en')

  React.useEffect(() => {
    // Check cookie or path
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
    if (match && (match[1] === 'pt-br' || match[1] === 'en')) {
      setCurrentLocale(match[1])
      return
    }
    if (window.location.pathname.startsWith('/pt-br')) {
      setCurrentLocale('pt-br')
      return
    }
    // Fallback to browser language
    if (navigator.language.toLowerCase().startsWith('pt')) {
      setCurrentLocale('pt-br')
    }
  }, [])

  const switchLocale = (newLocale: 'en' | 'pt-br') => {
    if (newLocale === currentLocale) return
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
    window.location.reload()
  }

  return (
    <div className="border-border/60 bg-muted/50 flex items-center rounded-lg border p-0.5 text-xs">
      <button
        type="button"
        onClick={() => switchLocale('en')}
        className={`rounded px-2 py-0.5 font-medium transition-all ${
          currentLocale === 'en'
            ? 'bg-background text-foreground font-semibold shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => switchLocale('pt-br')}
        className={`rounded px-2 py-0.5 font-medium transition-all ${
          currentLocale === 'pt-br'
            ? 'bg-background text-foreground font-semibold shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Português (Brasil)"
      >
        PT
      </button>
    </div>
  )
}
