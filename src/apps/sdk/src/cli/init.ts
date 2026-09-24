import fs from 'fs'
import inquirer from 'inquirer'
import path from 'path'

import { VALID_ADDON_CATEGORIES } from '../contracts/manifest'
import { writeYaml } from '../utils/yaml'

export async function runInitWizard(targetDirName?: string) {
  console.log('\n🚀 Bem-vindo ao inicializador de plugins do Mr-tick!\n')

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'id',
      message: 'ID único do plugin (ex: mr-tick-datasource-redmine):',
      default: targetDirName || 'mr-tick-plugin-sample',
      validate: (input: string) => {
        if (!input.trim()) return 'O ID não pode ser vazio.'
        if (!/^[a-z0-9-_@/]+$/i.test(input.trim())) {
          return 'Use apenas letras, números, hífens ou underlines.'
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'name',
      message: 'Nome legível do plugin (ex: Redmine Integration):',
      default: 'Meu Plugin Mr-tick',
    },
    {
      type: 'checkbox',
      name: 'categories',
      message: 'Selecione uma ou mais categorias do plugin:',
      choices: VALID_ADDON_CATEGORIES.map((cat) => ({
        name: cat,
        value: cat,
        checked: cat === 'dataSource',
      })),
      validate: (choices: string[]) => {
        if (choices.length === 0) {
          return 'Selecione pelo menos uma categoria oficial.'
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'author',
      message: 'Autor ou organização:',
      default: 'Mr-tick Community',
    },
    {
      type: 'input',
      name: 'shortDescription',
      message: 'Descrição curta (1 linha):',
      default: 'Integração oficial para o Mr-tick',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Descrição detalhada:',
      default: 'Extensão para integração e sincronização com o Mr-tick.',
    },
  ])

  const targetDir = path.resolve(process.cwd(), targetDirName || answers.id)

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const srcDir = path.join(targetDir, 'src')
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true })
  }

  // 1. package.json
  const packageJson = {
    name: answers.id,
    version: '0.1.0',
    description: answers.shortDescription,
    author: answers.author,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    scripts: {
      build: 'tsup src/index.ts --format esm,cjs --dts --clean',
      manifest: 'mr-tick manifest .',
      validate: 'mr-tick validate .',
      pack: 'mr-tick pack .',
    },
    devDependencies: {
      '@mr-tick/sdk': '^0.3.0',
      tsup: '^8.5.0',
      typescript: '^5.8.0',
    },
  }
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf-8',
  )

  // 2. tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      declaration: true,
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*'],
  }
  fs.writeFileSync(
    path.join(targetDir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2),
    'utf-8',
  )

  // 3. manifest.yaml
  const manifest = {
    id: answers.id,
    name: answers.name,
    version: '0.1.0',
    categories: answers.categories,
    author: answers.author,
    shortDescription: answers.shortDescription,
    description: answers.description,
    tags: [answers.categories[0], 'mr-tick'],
    screenshots: [],
    requiredApiVersion: '>=0.1.0',
    releaseDate: new Date().toISOString().split('T')[0],
    changelog: ['Versão inicial do plugin'],
  }
  writeYaml(path.join(targetDir, 'manifest.yaml'), manifest)

  // 4. src/index.ts boilerplate
  const isDataSource = answers.categories.includes('dataSource')
  const indexTsContent = `import { AddonContext, IAddon } from '@mr-tick/sdk'

export default class ${toPascalCase(answers.name)}Plugin implements IAddon {
  public async activate(context: AddonContext): Promise<void> {
    console.log('[${answers.name}] Plugin ativado com sucesso!')

    ${
      isDataSource
        ? `// Registre seu conector de DataSource aqui:\n    // context.dataSources.register(new MyDataSource())`
        : `// Registre seus comandos ou menus aqui:\n    // context.menus.sidebar.register({ id: '${answers.id}', label: '${answers.name}' })`
    }
  }

  public async deactivate(): Promise<void> {
    console.log('[${answers.name}] Plugin desativado.')
  }
}
`
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTsContent, 'utf-8')

  console.log(`\n✅ Plugin criado com sucesso em: ${targetDir}`)
  console.log('\nPróximos passos:')
  console.log(`  cd ${path.relative(process.cwd(), targetDir) || '.'}`)
  console.log('  npm install')
  console.log('  npm run build')
  console.log('  npm run pack\n')
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}
