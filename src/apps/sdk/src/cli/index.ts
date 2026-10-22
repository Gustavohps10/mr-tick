import { program } from 'commander'
import inquirer from 'inquirer'
import path from 'path'

import { AddonConfig } from '../AddonConfig'
import { AddonTier } from '../contracts/manifest'
import { readYaml } from '../utils/yaml'
import { readCatalogSigningEnvironment } from './catalogSigning'
import { runInitWizard } from './init'
import { runManifestWizard } from './manifest'
import { buildAddon } from './pkg'
import { printPrSnippet } from './prSnippet'
import { syncManifest } from './sync'
import { runValidationCommand } from './validate'

function parseCliTier(rawTier: string | undefined): AddonTier | undefined {
  if (!rawTier) return undefined
  const normalized = rawTier.trim().toLowerCase()
  if (normalized === 'plus') return 'plus'
  if (normalized === 'free') return 'free'
  return undefined
}

program
  .name('mr-tick')
  .description('CLI do Mr-tick SDK para criar, validar e empacotar plugins')
  .version(__SDK_VERSION__)

program
  .command('init [name]')
  .description(
    'Inicializa um novo projeto de plugin com TypeScript e boilerplates',
  )
  .action(async (name?: string) => {
    await runInitWizard(name)
  })

program
  .command('manifest [addonDir]')
  .description('Cria ou atualiza interativamente o manifest.yaml do plugin')
  .action(async (addonDir = '.') => {
    await runManifestWizard(addonDir)
  })

program
  .command('sync [addonDir]')
  .alias('sync:manifest')
  .description(
    'Sincroniza capturas de tela, ícones e URLs dinâmicas no manifest.yaml',
  )
  .action((addonDir = '.') => {
    syncManifest(addonDir)
  })

program
  .command('validate [addonDir]')
  .description('Valida o manifest.yaml e a estrutura de arquivos do plugin')
  .action((addonDir = '.') => {
    runValidationCommand(addonDir)
  })

program
  .command('pack [addonDir]')
  .alias('pkg')
  .description('Empacota o plugin em formato .tladdon e atualiza o manifesto')
  .option('--download-url <url>', 'URL pública de download do pacote .tladdon')
  .option('--tier <tier>', 'Tier do addon (free ou plus)')
  .option('--changelog <items...>', 'Notas e mudanças desta versão')
  .addHelpText(
    'after',
    '\nAssinatura opcional: defina MR_TICK_CATALOG_SIGNING_KEY (JWK privada Ed25519 em JSON) e MR_TICK_CATALOG_KEY_ID. Gera catalog-version.json no pacote e um recibo <pacote>.manifest.json ao lado do arquivo .tladdon.',
  )
  .action(
    async (
      addonDir = '.',
      options: {
        downloadUrl?: string
        tier?: string
        changelog?: string[]
      },
    ) => {
      const cliTier = parseCliTier(options.tier)
      const manifestPath = path.join(path.resolve(addonDir), 'manifest.yaml')
      const existingManifest = readYaml<AddonConfig>(manifestPath)
      const isPlusTier = cliTier === 'plus' || existingManifest.tier === 'plus'

      let downloadUrl = options.downloadUrl
      if (!downloadUrl && !isPlusTier) {
        const answer = await inquirer.prompt<{ downloadUrl: string }>({
          type: 'input',
          name: 'downloadUrl',
          message:
            'URL pública de download do arquivo .tladdon (GitHub Release asset):',
        })
        downloadUrl = answer.downloadUrl
      }

      buildAddon(addonDir, {
        apiVersion: __SDK_VERSION__,
        signing: readCatalogSigningEnvironment(process.env),
        downloadUrl,
        tier: cliTier,
        changelog: options.changelog,
      })
    },
  )

program
  .command('pr-snippet [addonDir]')
  .description(
    'Exibe o YAML formatado para submeter o Pull Request no repositório de manifestos',
  )
  .action((addonDir = '.') => {
    printPrSnippet(addonDir)
  })

program.parse(process.argv)
