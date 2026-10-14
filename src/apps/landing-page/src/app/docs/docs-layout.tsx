import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Footer } from '@/app/components/footer'
import { Navbar } from '@/app/components/navbar'
import { source } from '@/lib/source'

export default async function Layout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const t = await getTranslations('docsUi')
  const translations = {
    'Search(search trigger)': t('searchTrigger'),
    'Search(search dialog)': t('searchDialog'),
    'No results found(search dialog)': t('noResults'),
    'On this page(table of contents)': t('onThisPage'),
    'Table of Contents(inline table of contents)': t('toc'),
    'Next Page(pagination)': t('next'),
    'Previous Page(pagination)': t('previous'),
    'Edit on GitHub(edit page)': t('edit'),
    'Last updated on(page footer)': t('updated'),
    'Copy Text(code block)(aria-label)': t('copyText'),
    'Copied Text(code block)(aria-label)': t('copied'),
    'Copy Anchor Link(heading anchor)(aria-label)': t('copyAnchor'),
    'Open Search(search trigger)(aria-label)': t('openSearch'),
    'Close Search(search dialog)(aria-label)': t('closeSearch'),
    'Open Sidebar(sidebar)(aria-label)': t('openSidebar'),
    'Close Sidebar(sidebar)(aria-label)': t('closeSidebar'),
    'Close Sidebar(aria-label)': t('closeSidebarGeneric'),
    'Collapse Sidebar(sidebar)(aria-label)': t('collapseSidebar'),
    'Hide Sidebar(sidebar)': t('hideSidebar'),
    'Show Sidebar(sidebar)': t('showSidebar'),
    'Toggle Menu(mobile menu)(aria-label)': t('toggleMenu'),
    'Toggle Theme(theme switcher)(aria-label)': t('toggleTheme'),
    'Light(theme switcher)(aria-label)': t('light'),
    'Dark(theme switcher)(aria-label)': t('dark'),
    'System(theme switcher)(aria-label)': t('system'),
    'Choose a language(language switcher)': t('chooseLanguage'),
    'Choose a language(language switcher)(aria-label)': t(
      'chooseLanguageLabel',
    ),
    'No Headings(table of contents)': t('noHeadings'),
    'Copy Markdown(page actions)': t('copyMarkdown'),
    'View as Markdown(page actions)': t('viewMarkdown'),
    'Open(page actions)': t('open'),
    'Open in ChatGPT(page actions)': t('openChatGPT'),
    'Open in Claude(page actions)': t('openClaude'),
    'Open in Cursor(page actions)': t('openCursor'),
    'Open in GitHub(page actions)': t('openGitHub'),
    'Open in Scira AI(page actions)': t('openScira'),
    'Ask AI(AI chat button)': t('askAI'),
    'Close Banner(banner)(aria-label)': t('closeBanner'),
    'Back to Home(404 page)': t('backHome'),
    'Page Not Found(404 page)': t('notFound'),
    'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)':
      t('notFoundDetail'),
    'Layout Tab(layout tab trigger)': t('layoutTab'),
    'Default(type table)': t('default'),
    'Parameters(type table)': t('parameters'),
    'Prop(type table)': t('prop'),
    'Returns(type table)': t('returns'),
    'Type(type table)': t('type'),
    'Copy Link(accordion)(aria-label)': t('copyLink'),
  }
  return (
    <RootProvider theme={{ enabled: false }} i18n={{ locale, translations }}>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex-1 pt-16">
          <DocsLayout
            tree={source.getPageTree(locale)}
            nav={{ enabled: false }}
            sidebar={{
              defaultOpenLevel: 2,
              collapsible: false,
              footer: null,
            }}
          >
            {children}
          </DocsLayout>
        </div>
        <Footer />
      </div>
    </RootProvider>
  )
}
