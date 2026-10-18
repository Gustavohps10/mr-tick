import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requireFromDesktop = createRequire(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../src/apps/desktop/package.json',
  ),
)
const { chromium } = requireFromDesktop('@playwright/test')

interface InspectOptions {
  port?: number
  action?: 'screenshot' | 'click' | 'fill' | 'eval' | 'inspect'
  selector?: string
  text?: string
  outputPath?: string
  evalCode?: string
}

function parseCliArgs(): InspectOptions {
  const args = process.argv.slice(2)
  const options: InspectOptions = {
    port: 9333,
    action: 'screenshot',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--port' && args[i + 1]) {
      options.port = parseInt(args[++i], 10)
    } else if (arg === '--action' && args[i + 1]) {
      options.action = args[++i] as InspectOptions['action']
    } else if (arg === '--selector' && args[i + 1]) {
      options.selector = args[++i]
    } else if (arg === '--text' && args[i + 1]) {
      options.text = args[++i]
    } else if (arg === '--output' && args[i + 1]) {
      options.outputPath = args[++i]
    } else if (arg === '--eval' && args[i + 1]) {
      options.evalCode = args[++i]
    } else if (!arg.startsWith('--') && !options.selector) {
      options.selector = arg
    }
  }

  return options
}

async function run() {
  const options = parseCliArgs()
  const cdpUrl = `http://127.0.0.1:${options.port}`

  console.log(`🔌 Conectando ao Electron via CDP em ${cdpUrl}...`)

  let browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
  } catch (err: any) {
    console.error(
      `❌ Não foi possível conectar ao Electron na porta ${options.port}.`,
    )
    console.error(
      `💡 Certifique-se de que o app foi iniciado com "yarn dev:debug" ou com MR_TICK_DEBUG=1.`,
    )
    console.error(`Detalhe do erro: ${err?.message || err}`)
    process.exit(1)
  }

  const contexts = browser.contexts()
  if (contexts.length === 0) {
    console.error('❌ Nenhum contexto do navegador encontrado.')
    await browser.close()
    process.exit(1)
  }

  const pages = contexts.flatMap((ctx: any) => ctx.pages())
  if (pages.length === 0) {
    console.error('❌ Nenhuma janela/página encontrada no Electron.')
    await browser.close()
    process.exit(1)
  }

  // Prioriza a janela principal do app (não a widget secundária transparente)
  let page = pages[0]
  for (const candidate of pages) {
    const url = candidate.url()
    if (
      (url.includes('localhost') ||
        url.includes('renderer') ||
        url.includes('index.html')) &&
      !url.includes('#/runtime') &&
      !url.includes('/widgets/timer')
    ) {
      page = candidate
      break
    }
  }

  const currentUrl = page.url()
  const title = await page.title()
  console.log(`📱 Janela conectada: "${title}" (${currentUrl})`)

  page.on('console', (msg) => {
    console.log(`💬 [PAGE ${msg.type()}]:`, msg.text())
  })
  page.on('pageerror', (err) => {
    console.log(`💥 [PAGE UNCAUGHT]:`, err.message)
  })

  switch (options.action) {
    case 'screenshot': {
      const defaultDir = resolve(process.cwd(), '.screenshots')
      if (!existsSync(defaultDir)) {
        mkdirSync(defaultDir, { recursive: true })
      }
      const filename =
        options.outputPath ||
        resolve(defaultDir, `screenshot-${Date.now()}.png`)
      await page.screenshot({ path: filename, fullPage: true })
      console.log(`📸 Screenshot salvo com sucesso em: ${filename}`)
      break
    }

    case 'click': {
      if (!options.selector) {
        console.error(
          '❌ Parâmetro --selector é obrigatório para a ação "click".',
        )
        process.exit(1)
      }
      console.log(`👆 Clicando no elemento: ${options.selector}...`)
      await page.waitForSelector(options.selector, { timeout: 10000 })
      await page.click(options.selector)
      console.log(`✅ Elemento clicado com sucesso.`)
      break
    }

    case 'fill': {
      if (!options.selector) {
        console.error(
          '❌ Parâmetro --selector é obrigatório para a ação "fill".',
        )
        process.exit(1)
      }
      console.log(
        `✍️ Preenchendo "${options.text || ''}" em: ${options.selector}...`,
      )
      await page.waitForSelector(options.selector, { timeout: 10000 })
      await page.fill(options.selector, options.text || '')
      console.log(`✅ Campo preenchido com sucesso.`)
      break
    }

    case 'eval': {
      if (!options.evalCode) {
        console.error('❌ Parâmetro --eval é obrigatório para a ação "eval".')
        process.exit(1)
      }
      const evalResult = await page.evaluate(options.evalCode)
      console.log('⚡ Resultado da avaliação:', evalResult)
      break
    }

    case 'inspect':
    default: {
      const bodyText = await page.innerText('body')
      console.log('📄 Conteúdo resumido da tela:')
      console.log(bodyText.slice(0, 1000))
      break
    }
  }

  await browser.close()
}

run().catch((err) => {
  console.error('💥 Erro durante execução do app-inspect:', err)
  process.exit(1)
})
