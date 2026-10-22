import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const directory = path.resolve(import.meta.dirname, '../../content/docs')
const documentationFiles = fs
  .readdirSync(directory, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.mdx'))

const pages = documentationFiles.filter((name) => !name.endsWith('.pt-br.mdx'))
const translatedPages = documentationFiles
  .filter((name) => name.endsWith('.pt-br.mdx'))
  .map((name) => name.replace(/\.pt-br\.mdx$/, '.mdx'))

function codeExamples(content: string) {
  return [...content.matchAll(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm)].map(
    (match) => match[0],
  )
}

describe('documentation language coverage', () => {
  it('covers every documentation page in both languages', () => {
    expect(pages.length).toBeGreaterThan(0)
    expect(translatedPages.toSorted()).toEqual(pages.toSorted())
  })

  it.each(pages)(
    'has translated prose and preserves API examples: %s',
    (name) => {
      const english = fs
        .readFileSync(path.join(directory, name), 'utf8')
        .replaceAll('\r\n', '\n')
      const portuguese = fs
        .readFileSync(
          path.join(directory, name.replace(/\.mdx$/, '.pt-br.mdx')),
          'utf8',
        )
        .replaceAll('\r\n', '\n')
      expect(english).toMatch(/^title: \S.*$/m)
      expect(portuguese).toMatch(/^title: \S.*$/m)
      expect(english).toMatch(/^description: \S.*$/m)
      expect(portuguese).toMatch(/^description: \S.*$/m)

      expect(english.match(/^description: (.+)$/m)?.[1]).not.toBe(
        portuguese.match(/^description: (.+)$/m)?.[1],
      )
      expect(codeExamples(english)).toEqual(codeExamples(portuguese))
      expect(portuguese).not.toContain('](/docs')
      expect(english).not.toContain('](/pt-br/docs')
    },
  )
})
