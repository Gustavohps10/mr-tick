import type {
  AddonContext,
  AddonSettingsGroup,
  IAddon,
  IDataSource,
} from '@mr-tick/sdk'

import { FakeAuthenticationStrategy } from './FakeAuthenticationStrategy'
import { FakeDatabaseStore } from './FakeDatabaseStore'
import { FakeMemberProvider } from './FakeMemberProvider'
import { FakeMetadataProvider } from './FakeMetadataProvider'
import { FakeTaskProvider } from './FakeTaskProvider'
import { FakeTimeEntryProvider } from './FakeTimeEntryProvider'

const configFields: {
  credentials: AddonSettingsGroup[]
  configuration: AddonSettingsGroup[]
} = {
  credentials: [
    {
      id: 'credentials_group',
      label: 'Autenticação Simulada (Fake)',
      description:
        'Preencha as credenciais de teste para conectar ao servidor simulado.',
      fields: [
        {
          id: 'serverUrl',
          type: 'text',
          label: 'URL do Servidor',
          placeholder: 'https://fake.mr-tick-app.local',
          defaultValue: 'https://fake.mr-tick-app.local',
        },
        {
          id: 'username',
          type: 'text',
          label: 'Usuário',
          placeholder: 'Admin',
          defaultValue: 'Admin',
        },
        {
          id: 'password',
          type: 'password',
          label: 'Senha de Acesso',
          placeholder: '123',
          defaultValue: '123',
        },
      ],
    },
  ],
  configuration: [
    {
      id: 'config_group',
      label: 'Parâmetros de Teste',
      description: 'Opções de comportamento da instância fake.',
      fields: [
        {
          id: 'syncInterval',
          type: 'number',
          label: 'Intervalo de Sync (Minutos)',
          placeholder: '5',
          defaultValue: 5,
        },
      ],
    },
  ],
}

export const FakeDataSource: IDataSource = {
  getConnectionSchema: () => [
    {
      id: 'credentials',
      label: 'Credenciais',
      groups: configFields.credentials,
    },
    {
      id: 'configuration',
      label: 'Configurações',
      groups: configFields.configuration,
    },
  ],
  createInstance: (context) => ({
    authStrategy: new FakeAuthenticationStrategy(),
    tasksProvider: new FakeTaskProvider(context),
    timeEntriesProvider: new FakeTimeEntryProvider(context),
    membersProvider: new FakeMemberProvider(context),
    metadataProvider: new FakeMetadataProvider(context),
  }),
}

export default class FakeDataSourceAddon implements IAddon {
  activate(context: AddonContext): void {
    console.log('🟢 [FakeDataSourceAddon] Registrando FakeDataSource...')
    context.dataSources.register(FakeDataSource)

    // --- REGISTRO DO MENU DE TESTES / CAOS NA TIMERBAR ---
    context.menus.timerbar.register({
      id: 'fake-db-simulator',
      type: 'popover',
      label: 'Fake DB',
      icon: 'Database',
      tooltip: 'Simulador de Cenários Remotos (Fake DB)',
      items: [
        {
          id: 'fake-db:delete-today',
          label: 'Excluir hoje',
          icon: 'Trash2',
          description: 'Simula hard delete de hoje para testar sweep window',
          danger: true,
        },
        {
          id: 'fake-db:delete-yesterday',
          label: 'Excluir ontem',
          icon: 'CalendarX',
          description: 'Simula hard delete de ontem',
          danger: true,
        },
        {
          id: 'fake-db:delete-random',
          label: 'Excluir último',
          icon: 'Scissors',
          description: 'Remove o registro mais recente do database.json',
          danger: true,
        },
        {
          id: 'fake-db:touch-conflict',
          label: 'Gerar conflito no último',
          icon: 'AlertTriangle',
          description: 'Altera updatedAt e tempo gasto remotamente',
        },
        {
          id: 'fake-db:inject-today',
          label: 'Criar apontamento hoje',
          icon: 'PlusCircle',
          description: 'Cria apontamento recente para testar pull incremental',
        },
        {
          id: 'fake-db:inject-yesterday',
          label: 'Criar apontamento ontem',
          icon: 'History',
          description: 'Cria apontamento retroativo no remoto',
        },
        {
          id: 'fake-db:reset-seed',
          label: 'Resetar banco fake',
          icon: 'RotateCcw',
          description: 'Restaura as 1.000 tarefas e apontamentos originais',
        },
        {
          id: 'fake-db:simulate-auth-error',
          label: 'Simular erro 401 (Auth)',
          icon: 'ShieldAlert',
          description: 'Simula token expirado/401 no servidor fake',
          danger: true,
        },
        {
          id: 'fake-db:restore-auth',
          label: 'Restaurar autenticação',
          icon: 'ShieldCheck',
          description: 'Restaura autenticação válida no servidor fake',
        },
      ],
    })

    // --- REGISTRO DOS COMANDOS ASSOCIADOS ---
    const store = FakeDatabaseStore.getInstance()

    context.commands.register('fake-db:delete-today', async () => {
      const count = store.deleteTimeEntriesFromToday()
      await context.notifications.warning(
        `${count} apontamento(s) de hoje excluído(s) no remoto.`,
        'Fake DB: Hard Delete',
      )
      return { count }
    })

    context.commands.register('fake-db:delete-yesterday', async () => {
      const count = store.deleteTimeEntriesFromYesterday()
      await context.notifications.warning(
        `${count} apontamento(s) de ontem excluído(s) no remoto.`,
        'Fake DB: Hard Delete',
      )
      return { count }
    })

    context.commands.register('fake-db:delete-random', async () => {
      const id = store.deleteRandomRecentTimeEntry()
      if (id) {
        await context.notifications.warning(
          `Apontamento ${id} removido do servidor fake.`,
          'Fake DB: Registro Removido',
        )
      } else {
        await context.notifications.info(
          'Nenhum apontamento para excluir.',
          'Fake DB',
        )
      }
      return { id }
    })

    context.commands.register('fake-db:touch-conflict', async () => {
      const updated = store.touchRecentTimeEntryConflict()
      if (updated) {
        await context.notifications.info(
          `Registro ${updated.id} alterado no remoto (updatedAt atualizado). O próximo push causará conflito.`,
          'Fake DB: Conflito Criado',
        )
      } else {
        await context.notifications.warning(
          'Nenhum registro encontrado para alterar.',
          'Fake DB',
        )
      }
      return { updated }
    })

    context.commands.register('fake-db:inject-today', async () => {
      const created = store.injectTimeEntry(0, 2)
      await context.notifications.success(
        `Apontamento ${created.id} injetado hoje no servidor fake. Execute pull para receber.`,
        'Fake DB: Novo Registro',
      )
      return { created }
    })

    context.commands.register('fake-db:inject-yesterday', async () => {
      const created = store.injectTimeEntry(-1, 3)
      await context.notifications.success(
        `Apontamento ${created.id} injetado ontem no servidor fake. Execute pull para receber.`,
        'Fake DB: Registro Retroativo',
      )
      return { created }
    })

    context.commands.register('fake-db:reset-seed', async () => {
      store.resetToSeed()
      await context.notifications.success(
        'Banco fake resetado com sucesso para as 1.000 tarefas e apontamentos padrão.',
        'Fake DB: Reset Seed',
      )
      return { reset: true }
    })

    context.commands.register('fake-db:simulate-auth-error', async () => {
      store.setSimulateAuthError(true)
      await context.notifications.error(
        'Servidor fake configurado para retornar 401 Unauthorized.',
        'Fake DB: 401 Simulado',
      )
      return { success: true }
    })

    context.commands.register('fake-db:restore-auth', async () => {
      store.setSimulateAuthError(false)
      await context.notifications.success(
        'Autenticação restaurada com sucesso no servidor fake.',
        'Fake DB: Auth Restaurada',
      )
      return { success: true }
    })
  }

  deactivate(): void {
    console.log('🛑 [FakeDataSourceAddon] Desativado.')
  }
}
