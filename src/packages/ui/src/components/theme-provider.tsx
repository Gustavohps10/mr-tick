'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { useHostBridge } from '@/hooks'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'mr-tick-theme',
  ...props
}: ThemeProviderProps) {
  const bridge = useHostBridge()
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [mounted, setMounted] = useState(false)

  // Carrega o tema inicial do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      setThemeState(saved)
    }
    setMounted(true)
  }, [storageKey])

  // Escuta alterações de tema disparadas por outras janelas via IPC
  useEffect(() => {
    const unsubscribe = bridge.events.on<Theme>('theme:changed', (newTheme) => {
      if (newTheme) {
        localStorage.setItem(storageKey, newTheme)
        setThemeState(newTheme)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [bridge, storageKey])

  // Aplica as classes CSS no <html>
  useEffect(() => {
    if (!mounted) return

    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme, mounted])

  const value = {
    theme,
    setTheme: (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
      bridge.system.toggleTheme({ body: { theme: nextTheme } })
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
