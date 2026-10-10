import { randomUUID } from 'node:crypto'

import {
  type AddonContext,
  type AddonSettingsGroup,
  type CoreRuntimeState,
  type IAddon,
  type IDataSource,
} from '@mr-tick/sdk'
import { z } from 'zod'

import { FakeAuthenticationStrategy } from './FakeAuthenticationStrategy'
import { FAKE_MEMBER, FAKE_METADATA, FAKE_TASKS } from './fakeData'
import { FakeDatabaseStore } from './FakeDatabaseStore'
import { FakeMemberProvider } from './FakeMemberProvider'
import { FakeMetadataProvider } from './FakeMetadataProvider'
import { FakeTaskProvider } from './FakeTaskProvider'
import { FakeTimeEntryProvider } from './FakeTimeEntryProvider'
import { CORE_SDK_PROBE_TASK_ID } from './runtime-probe-fixture'

const configFields: {
  credentials: AddonSettingsGroup[]
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
}

export const FakeDataSource: IDataSource = {
  getConnectionSchema: () => [
    {
      id: 'credentials',
      label: 'Credenciais',
      groups: configFields.credentials,
    },
  ],
  getMappingFields: async () => new FakeMetadataProvider().getMappingFields(),
  createInstance: (context) => ({
    authStrategy: new FakeAuthenticationStrategy(),
    tasksProvider: new FakeTaskProvider(context),
    timeEntriesProvider: new FakeTimeEntryProvider(context),
    membersProvider: new FakeMemberProvider(context),
    metadataProvider: new FakeMetadataProvider(context),
  }),
}

interface TimerDiagnosticEvent {
  seconds?: number
  action: 'start' | 'pause' | 'resume' | 'stop'
  workspaceId?: string
  taskId?: string
  taskName?: string
}
export default class FakeDataSourceAddon implements IAddon {
  private readonly runtimeProbeOperation = {
    commandId: randomUUID(),
    entryId: randomUUID(),
  }
  private readonly runtimeSuggestionOperation = {
    commandId: randomUUID(),
    entryId: randomUUID(),
  }
  private readonly runtimeStates: CoreRuntimeState[] = []
  private readonly timerEventDiagnostics: TimerDiagnosticEvent[] = []
  private readonly timerEventUnsubscribers: Array<() => void> = []
  activate(context: AddonContext): void {
    console.log('🟢 [FakeDataSourceAddon] Registrando FakeDataSource...')
    context.contributions.dataSources.register(FakeDataSource)

    // --- REGISTRO DO MENU DE TESTES / CAOS NA TIMERBAR ---
    context.contributions.menus.timerbar.register({
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

    if (process.env.PLAYWRIGHT_TEST === '1') {
      context.core.runtime.onStateChanged((state) =>
        this.runtimeStates.push(state),
      )
      context.contributions.commands.register(
        'fake-db:runtime-core-state',
        () => ({
          state: context.core.runtime.getState(),
          states: [...this.runtimeStates],
        }),
      )
      context.contributions.commands.register(
        'fake-db:runtime-core-suggest',
        async () => {
          const workspaceId = process.env.MR_TICK_RUNTIME_PROBE_WORKSPACE
          const connectionInstanceId =
            process.env.MR_TICK_RUNTIME_PROBE_CONNECTION
          if (workspaceId === undefined || connectionInstanceId === undefined)
            return { ok: false, error: 'PROBE_SCOPE_REQUIRED' }
          const scope = { workspaceId, connectionInstanceId }
          const workspace = await context.core.workspaces.get(workspaceId)
          if (workspace.isFailure())
            return { ok: false, error: workspace.failure.messageKey }
          const connection = await context.core.connections.get(scope)
          if (connection.isFailure())
            return { ok: false, error: connection.failure.messageKey }
          const task = await context.core.tasks.get({
            ...scope,
            taskId: CORE_SDK_PROBE_TASK_ID,
          })
          if (task.isFailure())
            return { ok: false, error: task.failure.messageKey }
          const metadata = await context.core.metadata.get(scope)
          if (metadata.isFailure())
            return { ok: false, error: metadata.failure.messageKey }
          const activity = metadata.success.values.activities.find(
            (item) => item.id === 'act-coding',
          )
          if (activity === undefined)
            return { ok: false, error: 'PROBE_ACTIVITY_UNAVAILABLE' }
          const result = await context.core.timeEntries.createSuggestion(
            workspaceId,
            {
              taskId: task.success.taskId,
              connectionInstanceId,
              dataSourceId: connection.success.dataSourceId,
              activityId: activity.id,
              activityName: activity.name,
              timeSpentSeconds: 900,
              startDate: '2026-10-08T10:00:00.000Z',
              endDate: '2026-10-08T10:15:00.000Z',
              comments: 'SDK core suggestion proof',
            },
            this.runtimeSuggestionOperation,
          )
          if (result.isFailure())
            return { ok: false, error: result.failure.messageKey }
          return {
            ok: true,
            workspace: workspace.success,
            connection: connection.success,
            task: task.success,
            entry: result.success,
          }
        },
      )
      context.contributions.commands.register(
        'fake-db:runtime-create-entry',
        async () => {
          const workspaceId = process.env.MR_TICK_RUNTIME_PROBE_WORKSPACE
          const connectionInstanceId =
            process.env.MR_TICK_RUNTIME_PROBE_CONNECTION
          if (
            workspaceId === undefined ||
            workspaceId.length === 0 ||
            connectionInstanceId === undefined ||
            connectionInstanceId.length === 0
          )
            return { ok: false, error: 'RUNTIME_PROBE_SCOPE_REQUIRED' }
          const task = FAKE_TASKS.find((item) => item.id === 'DEV-9999')
          const activity = FAKE_METADATA.activities.find(
            (item) => item.id === 'act-coding',
          )
          if (task === undefined || activity === undefined)
            return { ok: false, error: 'RUNTIME_PROBE_FIXTURE_CONTEXT_MISSING' }
          const connection = await context.core.connections.get({
            workspaceId,
            connectionInstanceId,
          })
          if (connection.isFailure())
            return {
              ok: false,
              error: connection.failure.messageKey,
              statusCode: connection.failure.statusCode,
            }
          const result = await context.core.timeEntries.create(
            workspaceId,
            {
              taskId: task.id,
              activityId: activity.id,
              activityName: activity.name,
              connectionInstanceId,
              dataSourceId: connection.success.dataSourceId,
              userId: String(FAKE_MEMBER.id),
              userName: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
              timeSpentSeconds: 900,
              startDate: '2026-10-08T10:00:00.000Z',
              endDate: '2026-10-08T10:15:00.000Z',
              comments: 'SDK runtime proof',
            },
            this.runtimeProbeOperation,
          )
          if (result.isFailure())
            return {
              ok: false,
              error: result.failure.messageKey,
              statusCode: result.failure.statusCode,
            }
          return {
            ok: true,
            entry: result.success,
            operation: this.runtimeProbeOperation,
          }
        },
      )
      context.contributions.commands.register(
        'fake-db:runtime-get-entry',
        async () => {
          const workspaceId = process.env.MR_TICK_RUNTIME_PROBE_WORKSPACE
          if (workspaceId === undefined || workspaceId.length === 0)
            return { ok: false, error: 'RUNTIME_PROBE_SCOPE_REQUIRED' }
          const result = await context.core.timeEntries.getById(
            workspaceId,
            this.runtimeProbeOperation.entryId,
          )
          if (result.isFailure())
            return {
              ok: false,
              error: result.failure.messageKey,
              statusCode: result.failure.statusCode,
            }
          return { ok: true, entry: result.success }
        },
      )
      context.contributions.commands.register(
        'fake-db:runtime-quick-timer',
        async (taskId, expectedTitle) => {
          const workspaceId = process.env.MR_TICK_RUNTIME_PROBE_WORKSPACE
          const connectionInstanceId =
            process.env.MR_TICK_RUNTIME_PROBE_CONNECTION
          if (
            workspaceId === undefined ||
            workspaceId.length === 0 ||
            connectionInstanceId === undefined ||
            connectionInstanceId.length === 0
          )
            return { ok: false, error: 'RUNTIME_PROBE_SCOPE_REQUIRED' }
          if (typeof taskId !== 'string' || typeof expectedTitle !== 'string')
            return { ok: false, error: 'RUNTIME_PROBE_TASK_CONTEXT_REQUIRED' }
          const task = FAKE_TASKS.find((item) => item.id === taskId)
          const activity = FAKE_METADATA.activities.find(
            (item) => item.id === 'act-coding',
          )
          if (task === undefined || activity === undefined)
            return { ok: false, error: 'RUNTIME_PROBE_FIXTURE_CONTEXT_MISSING' }
          if (task.title !== expectedTitle)
            return { ok: false, error: 'RUNTIME_PROBE_TASK_TITLE_MISMATCH' }
          const connection = await context.core.connections.get({
            workspaceId,
            connectionInstanceId,
          })
          if (connection.isFailure())
            return {
              ok: false,
              error: connection.failure.messageKey,
              statusCode: connection.failure.statusCode,
            }
          const entryId = randomUUID()
          const started = await context.core.timer.start(
            workspaceId,
            {
              taskId: task.id,
              activityId: activity.id,
              activityName: activity.name,
              connectionInstanceId,
              dataSourceId: connection.success.dataSourceId,
              userId: String(FAKE_MEMBER.id),
              userName: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
              timeSpentSeconds: 0,
              startDate: new Date().toISOString(),
              comments: 'Quick SDK timer proof',
              mode: 'countup',
            },
            { commandId: randomUUID(), entryId },
          )
          if (started.isFailure())
            return { ok: false, error: started.failure.messageKey }
          const paused = await context.core.timer.pause(workspaceId, {
            commandId: randomUUID(),
            entryId,
          })
          if (paused.isFailure())
            return { ok: false, error: paused.failure.messageKey }
          const resumed = await context.core.timer.resume(workspaceId, {
            commandId: randomUUID(),
            entryId,
          })
          if (resumed.isFailure())
            return { ok: false, error: resumed.failure.messageKey }
          const stopped = await context.core.timer.stop(workspaceId, {
            commandId: randomUUID(),
            entryId,
          })
          if (stopped.isFailure())
            return { ok: false, error: stopped.failure.messageKey }
          return { ok: true, entryId, taskId: task.id, taskName: task.title }
        },
      )
      this.timerEventUnsubscribers.push(
        context.host.events.on('timer:start', (payload) => {
          this.timerEventDiagnostics.push({
            action: 'start',
            seconds: payload.baseSeconds,
            workspaceId: payload.workspaceId,
            taskId: payload.taskId,
            taskName: payload.taskName,
          })
        }),
        context.host.events.on('timer:pause', (payload) => {
          this.timerEventDiagnostics.push({
            action: 'pause',
            seconds: payload.currentSeconds,
            workspaceId: payload.workspaceId,
            taskId: payload.taskId,
            taskName: payload.taskName,
          })
        }),
        context.host.events.on('timer:resume', (payload) => {
          this.timerEventDiagnostics.push({
            action: 'resume',
            seconds: payload.currentSeconds,
            workspaceId: payload.workspaceId,
            taskId: payload.taskId,
            taskName: payload.taskName,
          })
        }),
        context.host.events.on('timer:stop', (payload) => {
          this.timerEventDiagnostics.push({
            action: 'stop',
            seconds: payload.currentSeconds,
            workspaceId: payload.workspaceId,
            taskId: payload.taskId,
            taskName: payload.taskName,
          })
        }),
      )
      context.contributions.commands.register(
        'fake-db:get-timer-event-diagnostics',
        () => ({
          events: this.timerEventDiagnostics.map((event) => ({ ...event })),
        }),
      )
      context.contributions.commands.register(
        'fake-db:reset-timer-event-diagnostics',
        () => {
          this.timerEventDiagnostics.length = 0
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:rename-activity-metadata',
        (...args) => {
          const input = z
            .tuple([z.object({ activityId: z.string().min(1) })])
            .safeParse(args)
          if (!input.success)
            return { ok: false, error: 'FAKE_METADATA_COMMAND_INVALID' }
          const [scope] = input.data
          const renamed = store.renameActivityMetadata(scope.activityId)
          if (!renamed)
            return { ok: false, error: 'FAKE_METADATA_ACTIVITY_NOT_FOUND' }
          return { ok: true, ...renamed }
        },
      )
      context.contributions.commands.register(
        'fake-db:pause-one-time-entry-pull',
        () => {
          store.pauseTimeEntryPulls(1)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:pause-two-time-entry-pulls',
        () => {
          store.pauseTimeEntryPulls(2)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:release-time-entry-pulls',
        () => ({
          released: store.releaseTimeEntryPulls(),
        }),
      )
      context.contributions.commands.register(
        'fake-db:reject-next-time-entry-update',
        () => {
          store.configureUpdateFailure(false, 422)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:delete-last-legacy-confirmed-entry',
        () => ({
          deleted: store.deleteLastLegacyConfirmedEntry(),
        }),
      )
      context.contributions.commands.register(
        'fake-db:auth-next-time-entry-delete',
        () => {
          store.configureDeleteFailure(401, 'SESSION_REQUIRES_LOGIN')
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:legacy-update-and-lose-canonical-read',
        () => {
          store.configureLegacyUpdateConfirmation()
          return { configured: true }
        },
      )

      context.contributions.commands.register(
        'fake-db:pause-canonical-recovery',
        () => {
          store.pauseCanonicalReadRecovery()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:release-canonical-recovery',
        () => ({
          released: store.releaseCanonicalReadRecovery(),
        }),
      )

      context.contributions.commands.register(
        'fake-db:reject-next-time-entry-delete',
        () => {
          store.configureDeleteFailure(422)
          return { configured: true }
        },
      )

      context.contributions.commands.register(
        'fake-db:pause-next-time-entry-update',
        () => {
          store.pauseNextTimeEntryUpdate()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:change-paused-update-remote',
        () => ({
          changed: store.changePausedUpdateRemote(),
        }),
      )
      context.contributions.commands.register(
        'fake-db:release-paused-time-entry-update',
        () => ({
          released: store.releasePausedUpdate(),
        }),
      )

      context.contributions.commands.register(
        'fake-db:pause-next-time-entry-delete',
        () => {
          store.pauseNextTimeEntryDelete()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:release-paused-time-entry-delete',
        () => ({
          released: store.releasePausedDelete(),
        }),
      )

      context.contributions.commands.register(
        'fake-db:fail-next-time-entry-update',
        () => {
          store.configureUpdateFailure(false)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:fail-update-and-edit-remote',
        () => {
          store.configureUpdateFailure(true)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:fail-next-time-entry-delete',
        () => {
          store.configureDeleteFailure()
          return { configured: true }
        },
      )

      context.contributions.commands.register(
        'fake-db:partial-next-time-entry-list',
        () => {
          store.returnPartialNextTimeEntryList()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:fail-next-time-entry-list',
        () => {
          store.failNextTimeEntryListRequest()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:get-time-entry-sync-diagnostics',
        () => store.getTimeEntrySyncDiagnostics(),
      )
      context.contributions.commands.register(
        'fake-db:lose-next-time-entry-create-response',
        () => {
          store.setSimulateTimeEntryCreateResponseLoss(true)
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:pause-next-time-entry-create',
        () => {
          store.pauseNextTimeEntryCreateRequest()
          return { configured: true }
        },
      )
      context.contributions.commands.register(
        'fake-db:release-paused-time-entry-create',
        () => ({
          released: store.releasePausedTimeEntryCreateRequest(),
        }),
      )
    }

    context.contributions.commands.register(
      'fake-db:delete-today',
      async () => {
        const count = store.deleteTimeEntriesFromToday()
        await context.host.notifications.warning(
          `${count} apontamento(s) de hoje excluído(s) no remoto.`,
          'Fake DB: Hard Delete',
        )
        return { count }
      },
    )

    context.contributions.commands.register(
      'fake-db:delete-yesterday',
      async () => {
        const count = store.deleteTimeEntriesFromYesterday()
        await context.host.notifications.warning(
          `${count} apontamento(s) de ontem excluído(s) no remoto.`,
          'Fake DB: Hard Delete',
        )
        return { count }
      },
    )

    context.contributions.commands.register(
      'fake-db:delete-random',
      async () => {
        const id = store.deleteRandomRecentTimeEntry()
        if (id) {
          await context.host.notifications.warning(
            `Apontamento ${id} removido do servidor fake.`,
            'Fake DB: Registro Removido',
          )
        } else {
          await context.host.notifications.info(
            'Nenhum apontamento para excluir.',
            'Fake DB',
          )
        }
        return { id }
      },
    )

    context.contributions.commands.register(
      'fake-db:touch-conflict',
      async () => {
        const updated = store.touchRecentTimeEntryConflict()
        if (updated) {
          await context.host.notifications.info(
            `Registro ${updated.id} alterado no remoto (updatedAt atualizado). O próximo push causará conflito.`,
            'Fake DB: Conflito Criado',
          )
        } else {
          await context.host.notifications.warning(
            'Nenhum registro encontrado para alterar.',
            'Fake DB',
          )
        }
        return { updated }
      },
    )

    context.contributions.commands.register(
      'fake-db:inject-today',
      async () => {
        const created = store.injectTimeEntry(0, 2)
        await context.host.notifications.success(
          `Apontamento ${created.id} injetado hoje no servidor fake. Execute pull para receber.`,
          'Fake DB: Novo Registro',
        )
        return { created }
      },
    )

    context.contributions.commands.register(
      'fake-db:inject-yesterday',
      async () => {
        const created = store.injectTimeEntry(-1, 3)
        await context.host.notifications.success(
          `Apontamento ${created.id} injetado ontem no servidor fake. Execute pull para receber.`,
          'Fake DB: Registro Retroativo',
        )
        return { created }
      },
    )

    context.contributions.commands.register('fake-db:reset-seed', async () => {
      store.resetToSeed()
      await context.host.notifications.success(
        'Banco fake resetado com sucesso para as 1.000 tarefas e apontamentos padrão.',
        'Fake DB: Reset Seed',
      )
      return { reset: true }
    })

    context.contributions.commands.register(
      'fake-db:simulate-auth-error',
      async () => {
        store.setSimulateAuthError(true)
        await context.host.notifications.error(
          'Servidor fake configurado para retornar 401 Unauthorized.',
          'Fake DB: 401 Simulado',
        )
        return { success: true }
      },
    )

    context.contributions.commands.register(
      'fake-db:restore-auth',
      async () => {
        store.setSimulateAuthError(false)
        await context.host.notifications.success(
          'Autenticação restaurada com sucesso no servidor fake.',
          'Fake DB: Auth Restaurada',
        )
        return { success: true }
      },
    )
  }

  deactivate(): void {
    for (const unsubscribe of this.timerEventUnsubscribers) unsubscribe()
    this.timerEventUnsubscribers.length = 0
    this.timerEventDiagnostics.length = 0
    console.log('🛑 [FakeDataSourceAddon] Desativado.')
  }
}
