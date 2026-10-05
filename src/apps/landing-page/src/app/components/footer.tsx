'use client'

import { Separator } from '@mr-tick/ui/separator'
import { Github, Linkedin, Twitter } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'

const FOOTER_SECTIONS = [
  {
    title: 'Product',
    links: [
      { label: 'Why Mr. Tick', href: '/#positioning' },
      { label: 'Integrations & SDK', href: '/#integrations' },
      { label: 'Architecture', href: '/#offline' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    title: 'Resources & Docs',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Quickstart Guide', href: '/docs/quickstart' },
      { label: 'Addon SDK', href: '/docs/apis/storage-and-events' },
      {
        label: 'GitHub Repository',
        href: 'https://github.com/gustavohps10/mr-tick',
        external: true,
      },
      {
        label: 'Report an Issue',
        href: 'https://github.com/gustavohps10/mr-tick/issues',
        external: true,
      },
    ],
  },
  {
    title: 'Legal & Privacy',
    links: [
      {
        label: 'MIT License (Open Source)',
        href: 'https://github.com/gustavohps10/mr-tick/blob/main/LICENSE',
        external: true,
      },
      { label: 'Terms of Service', href: '#' },
      { label: 'Privacy Policy', href: '#' },
      { label: 'Local-First Security', href: '/#offline' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-border/60 bg-card/60 relative border-t pt-16 pb-12">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand Info */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-auto shrink-0 items-center justify-center">
                <Image
                  src="/logo-icon.svg"
                  alt="Logo Mr-tick"
                  width={28}
                  height={34}
                  className="h-8 w-auto object-contain dark:invert"
                />
              </div>

              <Image
                src="/logo-text.svg"
                alt="Mr-tick"
                width={124}
                height={26}
                className="h-auto w-[124px] object-contain dark:invert"
              />
            </Link>

            <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-relaxed">
              The local-first workflow observability toolkit for software
              engineering. Track hours with precision, unify tickets, and
              protect your technical flow state.
            </p>

            {/* Social Links */}
            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://github.com/gustavohps10/mr-tick"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="border-border/60 bg-background hover:text-foreground text-muted-foreground hover:border-border flex size-9 items-center justify-center rounded-lg border transition-all"
              >
                <Github className="size-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="border-border/60 bg-background hover:text-foreground text-muted-foreground hover:border-border flex size-9 items-center justify-center rounded-lg border transition-all"
              >
                <Twitter className="size-4" />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="border-border/60 bg-background hover:text-foreground text-muted-foreground hover:border-border flex size-9 items-center justify-center rounded-lg border transition-all"
              >
                <Linkedin className="size-4" />
              </a>
            </div>
          </div>

          {/* Nav Columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-foreground font-mono text-xs font-bold tracking-wider uppercase">
                {section.title}
              </h4>
              <ul className="mt-4 space-y-2.5 text-xs">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="border-border/40 mt-12 mb-8" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-muted-foreground font-mono text-xs">
            © 2026 Mr. Tick. Released under the MIT License.
          </p>

          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-muted-foreground font-mono text-xs">
              All systems operational · Local-First
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
