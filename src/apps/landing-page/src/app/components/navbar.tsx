'use client'

import { Separator } from '@mr-tick/ui/separator'
import { BookOpenTextIcon, Github, Star } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

import { MobileMenu } from '@/components/mobile-menu'
import { ServerSideModeToggle } from '@/components/mode-toggle'

export interface NavItem {
  href: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/#positioning', label: 'Why Mr. Tick' },
  { href: '/#integrations', label: 'Integrations & SDK' },
  { href: '/#offline', label: 'Architecture' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
]

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      id="landing-navbar"
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'border-border/60 bg-background/85 border-b shadow-sm backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-6 lg:px-8">
        {/* Brand Logo */}
        <Link
          href="/"
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <div className="flex h-9 w-auto shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105">
            <Image
              src="/logo-icon.svg"
              alt="Logo Mr-tick"
              width={48}
              height={48}
              className="h-8 w-auto object-contain dark:invert"
              priority
            />
          </div>

          <Image
            src="/logo-text.svg"
            alt="Mr-tick"
            width={124}
            height={26}
            className="h-auto w-[124px] object-contain dark:invert"
            priority
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden h-full items-center py-2 md:flex">
          <div className="mr-4 flex items-center gap-5">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>

          <Separator orientation="vertical" className="mx-3 !h-4 self-center" />

          <Link
            href="/docs"
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <BookOpenTextIcon className="size-4" />
            Docs
          </Link>

          <Separator orientation="vertical" className="mx-2 !h-4 self-center" />

          <div className="flex items-center">
            <ServerSideModeToggle />
          </div>

          <Separator orientation="vertical" className="mx-2 !h-4 self-center" />

          <a
            href="https://github.com/gustavohps10/mr-tick"
            target="_blank"
            rel="noreferrer"
            className="group text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-all"
          >
            <Github className="size-4" />
            <span className="text-foreground/90">gustavohps10/mr-tick</span>
            <div className="ml-0.5 flex items-center gap-1">
              <Star className="size-3.5 transition-transform duration-200 group-hover:scale-110" />
              <span className="text-xs tabular-nums opacity-80">120</span>
            </div>
          </a>
        </nav>

        {/* Mobile Menu */}
        <MobileMenu />
      </div>
    </header>
  )
}
