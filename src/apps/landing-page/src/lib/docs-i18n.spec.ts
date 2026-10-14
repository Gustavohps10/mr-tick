import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const directory = path.resolve(import.meta.dirname, '../../content/docs')
const pages = fs
  .readdirSync(directory, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.mdx') && !name.endsWith('.pt-br.mdx'))

function codeExamples(content: string) {
  return [
    ...content.matchAll(/```(?:typescript|json|bash|yaml)\n[\s\S]*?```/g),
  ].map((match) => match[0])
}

describe('documentation language coverage', () => {
  it('covers every documentation page in both languages', () => {
    expect(pages).toHaveLength(11)
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
      expect(english.match(/^title: (.+)$/m)?.[1]).not.toBe(
        portuguese.match(/^title: (.+)$/m)?.[1],
      )
      expect(english.match(/^description: (.+)$/m)?.[1]).not.toBe(
        portuguese.match(/^description: (.+)$/m)?.[1],
      )
      expect(codeExamples(english)).toEqual(codeExamples(portuguese))
      expect(portuguese).not.toContain('](/docs')
      expect(english).not.toContain('](/pt-br/docs')
    },
  )
})
