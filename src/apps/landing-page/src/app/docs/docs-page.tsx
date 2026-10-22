import { MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { source } from '@/lib/source'

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const locale = await getLocale()
  const translations = await getTranslations('docs')
  const page = source.getPage(params.slug, locale)

  if (!page) notFound()

  const MDX = page.data.body
  const markdownUrl = `${page.url}.md`

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <MarkdownCopyButton markdownUrl={markdownUrl}>
          {translations('copyMarkdown')}
        </MarkdownCopyButton>
        <a href={markdownUrl} className="text-sm underline underline-offset-4">
          {translations('openMarkdown')}
        </a>
      </div>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams().map(({ slug }) => ({ slug }))
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const locale = await getLocale()
  const page = source.getPage(params.slug, locale)

  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      types: {
        'text/markdown': `${page.url}.md`,
      },
    },
  }
}
