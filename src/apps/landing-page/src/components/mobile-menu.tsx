'use client'

import { Separator } from '@mr-tick/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@mr-tick/ui/sheet'
import { BookOpenTextIcon, Github, Menu, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import { ServerSideModeToggle } from '@/components/mode-toggle'
import { Link } from '@/i18n/navigation'

import { LanguageToggle } from './language-toggle'

export function MobileMenu({ stars }: { stars: number | null }) {
  const t = useTranslations('navbar')
  return (
    <div className="flex items-center lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <button
            aria-label={t('menu')}
            className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-2 transition-colors"
          >
            <Menu className="size-5" />
          </button>
        </SheetTrigger>

        <SheetContent side="right" className="w-[300px] p-6">
          <SheetTitle>{t('menu')}</SheetTitle>
          <div className="mt-6 flex flex-col gap-6">
            {/* Links */}
            <div className="flex flex-col gap-4">
              {[
                { href: '/#positioning', label: t('whyMrTick') },
                { href: '/#integrations', label: t('integrations') },
                { href: '/#offline', label: t('architecture') },
                { href: '/license', label: t('license') },
                { href: '/download', label: t('download') },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <Separator />

            {/* Docs */}
            <Link
              href="/docs"
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium"
            >
              <BookOpenTextIcon className="size-4" />
              {t('docs')}
            </Link>

            <Separator />

            {/* Theme */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t('theme')}
              </span>
              <ServerSideModeToggle />
              <LanguageToggle />
            </div>

            <Separator />

            {/* Github */}
            <a
              href="https://github.com/gustavohps10/mr-tick"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center justify-between text-sm font-medium"
            >
              <div className="flex items-center gap-2">
                <Github className="size-4" />
                gustavohps10/mr-tick
              </div>

              <div className="flex items-center gap-1">
                <Star className="size-3.5" />
                <span className="text-xs tabular-nums opacity-80">
                  {stars !== null ? stars : '—'}
                </span>
              </div>
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
