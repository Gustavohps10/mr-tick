import fs from 'node:fs/promises'
import path from 'node:path'

import pako from 'pako'

const ROOT_DIR = process.cwd()
const CONCURRENCY_LIMIT = 3
const basePumlPath = path.resolve(ROOT_DIR, 'docs/srs/diagrams/puml')
const baseImagePath = path.resolve(ROOT_DIR, 'docs/srs/diagrams/puml-images')
const mdFile = path.resolve(
  ROOT_DIR,
  'docs/srs/software-requirements-specification.md',
)

const blockToFolder: Record<string, string> = {
  CLASSES_DIAGRAM: 'classes',
  COMPONENT_DIAGRAM: 'component',
  FLOW: 'flow',
  INFRA_DIAGRAM: 'infra',
  INTEGRATION_DIAGRAM: 'integration',
  UML_DIAGRAM: 'uml',
}

function encodePuml(text: string): string {
  const data = Buffer.from(text, 'utf8')
  const compressed = pako.deflateRaw(data, { level: 9 })
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'
  let r = ''
  for (let i = 0; i < compressed.length; i += 3) {
    const b1 = compressed[i],
      b2 = i + 1 < compressed.length ? compressed[i + 1] : 0
    const b3 = i + 2 < compressed.length ? compressed[i + 2] : 0
    r += chars[b1 >> 2]
    r += chars[((b1 & 0x3) << 4) | (b2 >> 4)]
    r += chars[((b2 & 0xf) << 2) | (b3 >> 6)]
    r += chars[b3 & 0x3f]
  }
  return r
}

async function exists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function writeFileWithRetry(file: string, buffer: Buffer, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.writeFile(file, buffer)
      return
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

async function generateDiagram(inputFile: string, outputFile: string) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  const content = await fs.readFile(inputFile, 'utf-8')
  const fullContent = content.includes('@startuml')
    ? content
    : `@startuml\n${content}\n@enduml`
  const encoded = encodePuml(fullContent)
  const url = `https://www.plantuml.com/plantuml/png/${encoded}`
  console.log(`🌐 Gerando: ${path.basename(outputFile)} via PlantUML`)
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`HTTP ${response.status} em ${path.basename(inputFile)}`)
  const arrayBuffer = await response.arrayBuffer()
  await writeFileWithRetry(outputFile, Buffer.from(arrayBuffer))
  console.log(`✅ Gerado: ${path.basename(outputFile)}`)
}

async function updateMarkdown() {
  if (!(await exists(mdFile))) {
    console.error('💥 Markdown não encontrado!')
    return
  }

  let mdContent = await fs.readFile(mdFile, 'utf-8')
  let hasChanges = false

  for (const [blockName, folder] of Object.entries(blockToFolder)) {
    const startTag = `<!--<BEGIN_${blockName}> -->`
    const endTag = `<!--END_${blockName} -->`

    const startIndex = mdContent.indexOf(startTag)
    const endIndex = mdContent.indexOf(endTag)

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      console.log(`⚠️  Bloco [${blockName}]: Não encontrado ou mal formatado.`)
      continue
    }

    const dirPath = path.join(baseImagePath, folder)
    if (!(await exists(dirPath))) {
      console.log(
        `⚠️  Bloco [${blockName}]: Pasta "${folder}" não existe em puml-images.`,
      )
      continue
    }

    const allFiles = await fs.readdir(dirPath)
    const pngFiles = allFiles
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort()

    if (pngFiles.length === 0) {
      console.log(`⚠️  Bloco [${blockName}]: Nenhum PNG encontrado.`)
      continue
    }

    // Legenda em Markdown nível 6 + imagem
    const imgTags = pngFiles
      .map((file) => {
        const pumlName = file.replace(/\.png$/i, '.puml')
        return `###### ${pumlName}\n<img src="./diagrams/puml-images/${folder}/${file}" alt="${blockName}" />`
      })
      .join('\n\n')

    const beforeBlock = mdContent.slice(0, startIndex + startTag.length)
    const afterBlock = mdContent.slice(endIndex)
    mdContent = `${beforeBlock}\n${imgTags}\n${afterBlock}`

    console.log(`✅ Bloco [${blockName}] atualizado.`)
    hasChanges = true
  }

  if (hasChanges) {
    await fs.writeFile(mdFile, mdContent, 'utf-8')
    console.log('✨ Markdown atualizado com todas as imagens!')
  } else {
    console.log('ℹ️ Nenhuma alteração necessária no Markdown.')
  }
}

async function main() {
  try {
    const tasks: { i: string; o: string; type: string }[] = []

    if (!(await exists(basePumlPath))) {
      console.error('💥 Diretório base de PUMLs não encontrado!')
      return
    }

    const typeDirs = await fs.readdir(basePumlPath)
    for (const type of typeDirs) {
      const pumlDir = path.join(basePumlPath, type)
      if (!(await exists(pumlDir))) continue
      const files = (await fs.readdir(pumlDir)).filter((f) =>
        f.endsWith('.puml'),
      )
      for (const file of files) {
        tasks.push({
          i: path.join(pumlDir, file),
          o: path.join(baseImagePath, type, file.replace('.puml', '.png')),
          type,
        })
      }
    }

    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const chunk = tasks.slice(i, i + CONCURRENCY_LIMIT)
      await Promise.all(chunk.map((t) => generateDiagram(t.i, t.o)))
    }

    await updateMarkdown()
    console.log('✨ Todos os diagramas processados e Markdown atualizado!')
  } catch (err: any) {
    console.error('💥 Falha:', err.message)
  }
}

main()
