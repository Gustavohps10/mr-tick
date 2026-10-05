'use client'

import { Button } from '@mr-tick/ui/button'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import * as React from 'react'

export function ServerSideModeToggle({
  className,
  ...props
}: React.HTMLAttributes<HTMLButtonElement>) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={className}
        {...props}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] opacity-50" />
      </Button>
    )
  }

  function handleToggleTheme() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggleTheme}
      className={className}
      {...props}
    >
      <div className="relative flex items-center justify-center">
        <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </div>
      <span className="sr-only">Alternar tema</span>
    </Button>
  )
}
