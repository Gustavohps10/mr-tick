import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

interface TextEdit {
  start: number
  end: number
  replacement: string
}

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const started = performance.now()
const diagnosticHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => packageRoot,
  getCanonicalFileName: (filename) => filename,
  getNewLine: () => '\n',
}

function reportDiagnostics(diagnostics: readonly ts.Diagnostic[]): void {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost),
  )
}

function readBuildConfig(): ts.ParsedCommandLine {
  const config = ts.getParsedCommandLineOfConfigFile(
    resolve(packageRoot, 'tsconfig.build.json'),
    {
      noEmit: false,
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmitOnError: true,
      composite: false,
      incremental: false,
    },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
        reportDiagnostics([diagnostic]),
    },
  )

  if (!config) process.exit(1)
  if (config.errors.length > 0) {
    reportDiagnostics(config.errors)
    process.exit(1)
  }

  return config
}

function requireDirectory(
  directory: string | undefined,
  option: string,
): string {
  if (!directory) throw new Error(`UI declarations require ${option}`)
  return directory
}

const config = readBuildConfig()
const sourceRoot = requireDirectory(config.options.rootDir, 'rootDir')
const outputRoot = requireDirectory(config.options.outDir, 'outDir')

const program = ts.createProgram(config.fileNames, config.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length > 0) {
  reportDiagnostics(diagnostics)
  process.exit(1)
}

const originalSources = new Map<string, ts.SourceFile>()
for (const source of program.getSourceFiles()) {
  if (source.isDeclarationFile) continue
  const output = resolve(
    outputRoot,
    relative(sourceRoot, source.fileName).replace(/\.tsx?$/, '.d.ts'),
  )
  originalSources.set(output, source)
}

function isModuleSpecifier(node: ts.StringLiteral): boolean {
  const parent = node.parent
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
    return parent.moduleSpecifier === node
  if (ts.isLiteralTypeNode(parent)) return ts.isImportTypeNode(parent.parent)
  return false
}

function rewriteDeclarations(
  filename: string,
  content: string,
  original: ts.SourceFile,
  compilerOptions: ts.CompilerOptions,
  sourceRoot: string,
  outputRoot: string,
): string {
  const source = ts.createSourceFile(
    filename,
    content,
    ts.ScriptTarget.Latest,
    true,
  )
  const edits: TextEdit[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isStringLiteral(node) &&
      isModuleSpecifier(node) &&
      (node.text.startsWith('@/') || node.text.startsWith('.'))
    ) {
      const resolved = ts.resolveModuleName(
        node.text,
        original.fileName,
        compilerOptions,
        ts.sys,
      ).resolvedModule
      if (!resolved && node.text.startsWith('@/'))
        throw new Error(`Unresolved private UI alias: ${node.text}`)
      if (resolved) {
        const sourcePath = relative(sourceRoot, resolved.resolvedFileName)
        if (sourcePath.startsWith('..') || isAbsolute(sourcePath))
          throw new Error(
            `UI declaration crosses its source boundary: ${node.text}`,
          )
        const target = resolve(
          outputRoot,
          sourcePath.replace(/\.d\.ts$/, '.js').replace(/\.tsx?$/, '.js'),
        )
        let modulePath = relative(dirname(filename), target).replace(/\\/g, '/')
        if (!modulePath.startsWith('.')) modulePath = `./${modulePath}`
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          replacement: JSON.stringify(modulePath),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  let rewritten = content
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    rewritten =
      rewritten.slice(0, edit.start) +
      edit.replacement +
      rewritten.slice(edit.end)
  }
  return rewritten
}

let declarations = 0
const result = program.emit(
  undefined,
  (filename, content) => {
    let output = content
    if (filename.endsWith('.d.ts')) {
      const original = originalSources.get(resolve(filename))
      if (!original)
        throw new Error(`Missing source for declaration ${filename}`)
      output = rewriteDeclarations(
        filename,
        content,
        original,
        config.options,
        sourceRoot,
        outputRoot,
      )
      declarations += 1
    }
    mkdirSync(dirname(filename), { recursive: true })
    writeFileSync(filename, output)
  },
  undefined,
  true,
)

if (result.emitSkipped || result.diagnostics.length > 0) {
  reportDiagnostics(result.diagnostics)
  process.exit(1)
}

console.log(
  `[ui:types] ${declarations} declarations in ${((performance.now() - started) / 1000).toFixed(2)}s; RSS ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MiB`,
)
