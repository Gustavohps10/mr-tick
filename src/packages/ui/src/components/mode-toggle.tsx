'use client'

import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'

export function ModeToggle({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { setTheme, theme } = useTheme()

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  function handleToggleTheme() {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      {...props}
      onClick={handleToggleTheme}
    >
      {isDark ? (
        <Moon className="h-[1.2rem] w-[1.2rem] transition-all" />
      ) : (
        <Sun className="h-[1.2rem] w-[1.2rem] transition-all" />
      )}
    </Button>
  )
}
