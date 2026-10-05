'use client'

import { Button } from '@mr-tick/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mr-tick/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import React from 'react'
import { FaApple, FaLinux, FaWindows } from 'react-icons/fa'

type ButtonProps = ComponentProps<typeof Button>

type OS = 'windows' | 'mac' | 'linux' | 'unknown'

const downloads: Record<Exclude<OS, 'unknown'>, string> = {
  windows: '/downloads/app-setup.exe',
  mac: '/downloads/app.dmg',
  linux: '/downloads/app.AppImage',
}

const labels: Record<OS, string> = {
  windows: 'Download for Windows',
  mac: 'Download for macOS',
  linux: 'Download for Linux',
  unknown: 'Download',
}

const icons: Record<Exclude<OS, 'unknown'>, React.ReactNode> = {
  windows: <FaWindows className="size-4" />,
  mac: <FaApple className="size-4" />,
  linux: <FaLinux className="size-4" />,
}

type DownloadCTAProps = ButtonProps

export function DownloadCTA({
  className,
  size = 'lg',
  ...props
}: DownloadCTAProps) {
  const [currentOS, setCurrentOS] = React.useState<OS>('unknown')

  React.useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()

    const detected = ua.includes('win')
      ? 'windows'
      : ua.includes('mac')
        ? 'mac'
        : ua.includes('linux')
          ? 'linux'
          : 'unknown'

    setCurrentOS(detected)
  }, [])

  return (
    <div className="inline-flex items-stretch">
      <Button
        {...props}
        size={size}
        asChild
        className={`gap-2 rounded-r-none ${className ?? ''}`}
      >
        <a href={currentOS === 'unknown' ? '/downloads' : downloads[currentOS]}>
          {currentOS !== 'unknown' && icons[currentOS]}
          {labels[currentOS]}
        </a>
      </Button>

      <div className="bg-border/60 w-px" />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={props.variant}
            className="w-[24px] rounded-l-none px-2.5"
          >
            <ChevronDown className="size-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCurrentOS('windows')}>
            <FaWindows className="mr-2 size-4" />
            Windows
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCurrentOS('mac')}>
            <FaApple className="mr-2 size-4" />
            macOS
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCurrentOS('linux')}>
            <FaLinux className="mr-2 size-4" />
            Linux
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
