import { Github, Link as LinkIcon } from 'lucide-react'
import React from 'react'

interface FooterProps {
  logo?: {
    url: string
    src: string
    alt: string
    title: string
  }
  sections?: Array<{
    title: string
    links: Array<{ name: string; href: string }>
  }>
  description?: string
  socialLinks?: Array<{
    icon: React.ReactElement
    href: string
    label: string
  }>
  copyright?: string
  legalLinks?: Array<{
    name: string
    href: string
  }>
}

const defaultSections = [
  {
    title: 'Projeto',
    links: [
      { name: 'Sobre', href: '#' },
      { name: 'Changelog', href: '#' },
      { name: 'Documentação', href: '#' },
      { name: 'Contribuir', href: '#' },
    ],
  },
  {
    title: 'Tecnologias',
    links: [
      { name: 'React', href: 'https://reactjs.org/' },
      { name: 'TypeScript', href: 'https://www.typescriptlang.org/' },
      { name: 'Tailwind CSS', href: 'https://tailwindcss.com/' },
      { name: 'ShadCN UI', href: 'https://ui.shadcn.dev/' },
    ],
  },
  {
    title: 'Contato',
    links: [
      { name: 'GitHub', href: 'https://github.com/seuusuario' },
      { name: 'Portfólio', href: 'https://seuportifolio.com' },
      { name: 'Email', href: 'mailto:seu@email.com' },
    ],
  },
]

const defaultSocialLinks = [
  {
    icon: <Github className="size-5" />,
    href: 'https://github.com/seuusuario',
    label: 'GitHub',
  },
  {
    icon: <LinkIcon className="size-5" />,
    href: 'https://seuportifolio.com',
    label: 'Portfólio',
  },
]

const defaultLegalLinks = [
  { name: 'Termos de Uso', href: '#' },
  { name: 'Política de Privacidade', href: '#' },
]

export function Footer({
  logo = {
    url: '/',
    src: 'https://www.shadcnblocks.com/images/block/logos/shadcnblockscom-icon.svg',
    alt: 'Logo',
    title: 'Nome do Projeto',
  },
  sections = defaultSections,
  description = 'Projeto open source desenvolvido de forma independente com foco em aprendizado e compartilhamento.',
  socialLinks = defaultSocialLinks,
  copyright = '© 2025 Nome do Projeto. Todos os direitos reservados.',
  legalLinks = defaultLegalLinks,
}: FooterProps) {
  return (
    <footer className="mt-5 border border-l-0 bg-zinc-50 p-4 dark:bg-zinc-900">
      <section className="py-20">
        <div className="container">
          <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
            <div className="flex w-full flex-col justify-between gap-6 lg:items-start">
              {/* Logo */}
              <div className="flex items-center gap-2 lg:justify-start">
                <a href={logo.url}>
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    title={logo.title}
                    className="h-8"
                  />
                </a>
                <h2 className="text-xl font-semibold">{logo.title}</h2>
              </div>
              <p className="text-muted-foreground max-w-[70%] text-sm">
                {description}
              </p>
              <ul className="text-muted-foreground flex items-center space-x-6">
                {socialLinks.map((social, idx) => (
                  <li key={idx} className="hover:text-primary font-medium">
                    <a href={social.href} aria-label={social.label}>
                      {social.icon}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid w-full gap-6 md:grid-cols-3 lg:gap-20">
              {sections.map((section, sectionIdx) => (
                <div key={sectionIdx}>
                  <h3 className="mb-4 font-bold">{section.title}</h3>
                  <ul className="text-muted-foreground space-y-3 text-sm">
                    {section.links.map((link, linkIdx) => (
                      <li
                        key={linkIdx}
                        className="hover:text-primary font-medium"
                      >
                        <a href={link.href}>{link.name}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="text-muted-foreground mt-8 flex flex-col justify-between gap-4 border-t py-8 text-xs font-medium md:flex-row md:items-center md:text-left">
            <p className="order-2 lg:order-1">{copyright}</p>
            <ul className="order-1 flex flex-col gap-2 md:order-2 md:flex-row">
              {legalLinks.map((link, idx) => (
                <li key={idx} className="hover:text-primary">
                  <a href={link.href}> {link.name}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </footer>
  )
}
