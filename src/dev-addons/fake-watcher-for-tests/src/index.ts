import { randomUUID } from 'node:crypto'

import {
  type AddonContext,
  type AddonExecuteOperationalActionRequest,
  type AddonOperationalItem,
  type AddonOperationalListRequest,
  type AddonOperationalListResponse,
  type AddonResolvedDependencyEntry,
  type AddonResolveOptionsRequest,
  type AddonResolveOptionsResponse,
  type AddonSettingObjectValue,
  type AddonSettingsCollectionField,
  type AddonSettingsField,
  type AddonSettingsOperationalListField,
  type AddonSettingsOption,
  type AddonSettingsSchema,
  type AddonSettingsTab,
  type AddonSettingsValues,
  type AddonSettingValue,
  type AddonTaskReferenceValue,
  type AddonValidateSettingsRequest,
  type AddonVaultScope,
  AppError,
  type CoreConnectionScope,
  Either,
  type IAddon,
  isBoolean,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
  type LocalEntryInput,
  type LocalOperationIdentity,
} from '@mr-tick/sdk'

interface RoomAllocationRule {
  readonly ruleName: string
  readonly building: string
  readonly floor: string
  readonly room: string
  readonly targetTask?: AddonTaskReferenceValue
  readonly active: boolean
  readonly rank: number
}

interface OperationalSessionState {
  readonly itemId: string
  readonly title: string
  readonly subtitle?: string
  status: 'pending' | 'resolved' | 'interrupted' | 'error'
  readonly reason: string
  readonly timestamp: string
  readonly durationSeconds: number
  readonly building: string
  readonly rawSignal: string
  readonly operationId: LocalOperationIdentity
}

function findDependencyValue(
  dependencies: readonly AddonResolvedDependencyEntry[],
  fieldId: string,
): AddonSettingValue | undefined {
  const match = dependencies.find((dep) => {
    const lastStep = dep.address.path[dep.address.path.length - 1]
    return lastStep?.kind === 'field' && lastStep.fieldId === fieldId
  })
  return match?.value
}

function parseTaskReference(
  raw: AddonSettingValue | undefined,
): AddonTaskReferenceValue | undefined {
  if (!isRecord(raw)) return undefined
  const workspaceId = raw['workspaceId']
  const connectionInstanceId = raw['connectionInstanceId']
  const taskId = raw['taskId']
  if (
    !isNonEmptyString(workspaceId) ||
    !isNonEmptyString(connectionInstanceId) ||
    !isNonEmptyString(taskId)
  ) {
    return undefined
  }
  const titleSnapshot = raw['titleSnapshot']
  if (isString(titleSnapshot)) {
    return {
      workspaceId,
      connectionInstanceId,
      taskId,
      titleSnapshot,
    }
  }
  return {
    workspaceId,
    connectionInstanceId,
    taskId,
  }
}

function unwrapCollectionItemValues(
  item: AddonSettingValue,
): AddonSettingObjectValue | null {
  if (!isRecord(item)) return null
  const nested = item['values']
  if (isRecord(nested)) {
    return nested
  }
  return item
}

function parseSessionState(rawJson: string): OperationalSessionState | null {
  try {
    const parsed: object = JSON.parse(rawJson)
    if (!isRecord(parsed)) return null
    const itemId = parsed['itemId']
    const title = parsed['title']
    const status = parsed['status']
    const reason = parsed['reason']
    const timestamp = parsed['timestamp']
    const durationSeconds = parsed['durationSeconds']
    const building = parsed['building']
    const rawSignal = parsed['rawSignal']
    const operationId = parsed['operationId']
    if (
      !isString(itemId) ||
      !isString(title) ||
      (status !== 'pending' &&
        status !== 'resolved' &&
        status !== 'interrupted' &&
        status !== 'error') ||
      !isString(reason) ||
      !isString(timestamp) ||
      !isNumber(durationSeconds) ||
      !isString(building) ||
      !isString(rawSignal) ||
      !isRecord(operationId)
    ) {
      return null
    }
    const commandId = operationId['commandId']
    const entryId = operationId['entryId']
    if (!isString(commandId) || !isString(entryId)) return null
    const subtitleRaw = parsed['subtitle']
    let subtitle: string | undefined = undefined
    if (isString(subtitleRaw)) {
      subtitle = subtitleRaw
    }
    return {
      itemId,
      title,
      subtitle,
      status,
      reason,
      timestamp,
      durationSeconds,
      building,
      rawSignal,
      operationId: { commandId, entryId },
    }
  } catch {
    return null
  }
}

export default class FakeWatcherAddon implements IAddon {
  private context: AddonContext | null = null
  private activeWorkspaceId: string | null = null
  private activeRevision = 0
  private currentRules: readonly RoomAllocationRule[] = []
  private defaultTask?: AddonTaskReferenceValue

  activate(context: AddonContext): void {
    this.context = context
    console.log(
      '🏛️ [FakeWatcherAddon] Ativando Observer Neutro de Salas de Reunião...',
    )

    context.host.events.on('workspace:changed', (payload) => {
      if (
        isRecord(payload) &&
        isNonEmptyString(payload['currentWorkspaceId'])
      ) {
        this.activeWorkspaceId = payload['currentWorkspaceId']
      }
    })

    context.contributions.settings.register(() => this.getSettingsSchema(), {
      optionsProviders: {
        'floors-provider': (request) => this.resolveFloors(request),
        'rooms-provider': (request) => this.resolveRooms(request),
      },
      operationalListProviders: {
        'unassigned-allocations-provider': async (request) =>
          this.resolveUnassignedAllocations(request),
      },
      operationalActionHandlers: {
        'assign-task': async (request) => this.handleAssignTask(request),
        'dismiss-allocation': async (request) =>
          this.handleDismissAllocation(request),
      },
      onValidate: (request) => this.handleValidateSettings(request),
      onApply: (ctx) => {
        this.activeRevision = ctx.revision
        if (ctx.scope.kind === 'workspace') {
          this.activeWorkspaceId = ctx.scope.workspaceId
        }
        this.syncAppliedValues(ctx.values)
        let wsLabel = 'global'
        if (this.activeWorkspaceId !== null) {
          wsLabel = this.activeWorkspaceId
        }
        console.log(
          `🏛️ [FakeWatcherAddon] Configurações de salas aplicadas! Revisão: ${ctx.revision}, Workspace: ${wsLabel}`,
        )
        return Either.success()
      },
    })

    context.contributions.menus.timerbar.register({
      id: 'fake-watcher-popover',
      type: 'popover',
      icon: 'Building',
      tooltip: 'Meeting Room Observer (Fixture Neutra)',
      items: [
        {
          id: 'fake-watcher:sim-meeting',
          label: 'Simular Reunião Encerrada (Sala 101 - 30 min)',
          icon: 'Video',
        },
      ],
    })

    context.contributions.commands.register(
      'fake-watcher:sim-meeting',
      async () => {
        console.log(
          '🏛️ [FakeWatcherAddon] Simulação: Reunião Sala 101 encerrada.',
        )
        const end = new Date()
        const start = new Date(end.getTime() - 1800 * 1000)
        await this.triggerControlledMeetingCapture({
          building: 'building-north',
          floor: 'floor-n1',
          room: 'room-101',
          durationSeconds: 1800,
          startTimeISO: start.toISOString(),
          endTimeISO: end.toISOString(),
        })
        return { status: 'success' }
      },
    )
  }

  deactivate(): void {
    console.log('🏛️ [FakeWatcherAddon] Desativando Observer Neutro...')
    this.context = null
    this.activeWorkspaceId = null
    this.currentRules = []
  }

  getSettingsSchema(): AddonSettingsSchema {
    const allocationRuleFields: readonly AddonSettingsField[] = [
      {
        id: 'ruleName',
        type: 'text',
        label: 'Nome da Alocação',
        placeholder: 'Ex: Daily de Engenharia',
        required: true,
      },
      {
        id: 'building',
        type: 'select',
        label: 'Edifício / Prédio',
        required: true,
        source: {
          kind: 'static',
          options: [
            { label: 'Prédio Norte (Inovação)', value: 'building-north' },
            { label: 'Prédio Sul (Operações)', value: 'building-south' },
          ],
        },
      },
      {
        id: 'floor',
        type: 'select',
        label: 'Andar',
        required: true,
        source: {
          kind: 'dynamic',
          providerId: 'floors-provider',
          dependsOn: [
            {
              base: 'parent',
              address: { path: [{ kind: 'field', fieldId: 'building' }] },
            },
          ],
        },
      },
      {
        id: 'room',
        type: 'select',
        label: 'Sala de Reunião',
        required: true,
        source: {
          kind: 'dynamic',
          providerId: 'rooms-provider',
          dependsOn: [
            {
              base: 'parent',
              address: { path: [{ kind: 'field', fieldId: 'floor' }] },
            },
          ],
        },
      },
      {
        id: 'targetTask',
        type: 'task-reference',
        label: 'Tarefa Vinculada',
        required: true,
      },
      {
        id: 'active',
        type: 'boolean',
        label: 'Regra Ativa',
        defaultValue: true,
      },
      {
        id: 'rank',
        type: 'number',
        label: 'Prioridade / Ordem de Avaliação',
        defaultValue: 1,
      },
    ]

    const roomCollection: AddonSettingsCollectionField = {
      id: 'roomAllocations',
      type: 'collection',
      label: 'Regras de Alocação de Salas',
      description:
        'Associe salas físicas a tarefas de apontamento com resolução relativa de dependências (Prédio -> Andar -> Sala).',
      itemLabel: 'Regra de Sala',
      enabledFieldId: 'active',
      allowReorder: true,
      allowDuplicate: true,
      fields: allocationRuleFields,
    }

    const pendingAllocationsList: AddonSettingsOperationalListField = {
      id: 'pendingAllocations',
      type: 'operational-list',
      label: 'Sessões em Salas Sem Alocação Resolvida',
      description:
        'Sessões de reunião observadas onde a sala ou o destino não puderam ser determinados automaticamente.',
      providerId: 'unassigned-allocations-provider',
      actions: [
        {
          id: 'assign-task',
          label: 'Associar Tarefa e Aceitar',
          variant: 'default',
          fields: [
            {
              id: 'targetTask',
              type: 'task-reference',
              label: 'Tarefa de Destino',
              required: true,
            },
          ],
        },
        {
          id: 'dismiss-allocation',
          label: 'Descartar Sessão',
          variant: 'destructive',
        },
      ],
    }

    const watcherTab: AddonSettingsTab = {
      id: 'rooms-observer-tab',
      kind: 'capability',
      label: 'Observador de Salas',
      description:
        'Configurações neutras de automação de salas de conferência e estações de trabalho.',
      groups: [
        {
          id: 'rooms-group',
          label: 'Regras de Associação Automática',
          description:
            'Regras declarativas avaliadas na detecção de presença em sala.',
          fields: [
            {
              id: 'enableRoomObserver',
              type: 'boolean',
              label: 'Habilitar observação de salas de conferência',
              defaultValue: true,
            },
            {
              id: 'defaultTask',
              type: 'task-reference',
              label:
                'Tarefa Padrão (Fallback quando nenhuma sala corresponder)',
            },
            roomCollection,
            pendingAllocationsList,
          ],
        },
      ],
    }

    return [watcherTab]
  }

  resolveFloors(
    request: AddonResolveOptionsRequest,
  ): Either<AppError, AddonResolveOptionsResponse> {
    const buildingValue = findDependencyValue(request.dependencies, 'building')

    if (buildingValue === 'building-north') {
      const options: readonly AddonSettingsOption[] = [
        { label: '1º Andar (Norte - Lab Software)', value: 'floor-n1' },
        { label: '2º Andar (Norte - Lab Hardware)', value: 'floor-n2' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    if (buildingValue === 'building-south') {
      const options: readonly AddonSettingsOption[] = [
        { label: '3º Andar (Sul - Operações e Suporte)', value: 'floor-s3' },
        { label: '4º Andar (Sul - Diretoria)', value: 'floor-s4' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    return Either.success({
      availability: 'empty',
      options: [],
      reason: 'Selecione um Edifício para listar os andares disponíveis.',
      hasMore: false,
    })
  }

  resolveRooms(
    request: AddonResolveOptionsRequest,
  ): Either<AppError, AddonResolveOptionsResponse> {
    const floorValue = findDependencyValue(request.dependencies, 'floor')

    if (floorValue === 'floor-n1') {
      const options: readonly AddonSettingsOption[] = [
        { label: 'Sala 101 - Foco Individual', value: 'room-101' },
        { label: 'Sala 102 - Daily e Alinhamento', value: 'room-102' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    if (floorValue === 'floor-n2') {
      const options: readonly AddonSettingsOption[] = [
        { label: 'Sala 201 - Laboratório de Testes', value: 'room-201' },
        { label: 'Sala 202 - Sala de Guerra', value: 'room-202' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    if (floorValue === 'floor-s3') {
      const options: readonly AddonSettingsOption[] = [
        { label: 'Sala 301 - Auditório Principal', value: 'room-301' },
        { label: 'Sala 302 - Sala Criativa de Design', value: 'room-302' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    if (floorValue === 'floor-s4') {
      const options: readonly AddonSettingsOption[] = [
        { label: 'Sala 401 - Diretoria Executiva', value: 'room-401' },
      ]
      return Either.success({
        availability: 'available',
        options,
        hasMore: false,
      })
    }

    return Either.success({
      availability: 'empty',
      options: [],
      reason: 'Selecione um Andar para listar as salas disponíveis.',
      hasMore: false,
    })
  }

  private getStorageScope(explicitScope?: AddonVaultScope): AddonVaultScope {
    if (explicitScope) {
      return explicitScope
    }
    if (this.activeWorkspaceId) {
      return { kind: 'workspace', workspaceId: this.activeWorkspaceId }
    }
    return { kind: 'addon' }
  }

  private async getSession(
    scope: AddonVaultScope,
    itemId: string,
  ): Promise<OperationalSessionState | null> {
    if (!this.context) return null
    const res = await this.context.host.storage.get(scope, `session:${itemId}`)
    if (res.isFailure() || !res.success) return null
    return parseSessionState(res.success)
  }

  private async saveSession(
    scope: AddonVaultScope,
    session: OperationalSessionState,
  ): Promise<Either<AppError, void>> {
    if (!this.context) {
      return Either.failure(AppError.Internal('ADDON_CONTEXT_UNINITIALIZED'))
    }
    return this.context.host.storage.set(
      scope,
      `session:${session.itemId}`,
      JSON.stringify(session),
    )
  }

  private async deleteSession(
    scope: AddonVaultScope,
    itemId: string,
  ): Promise<Either<AppError, void>> {
    if (!this.context) {
      return Either.failure(AppError.Internal('ADDON_CONTEXT_UNINITIALIZED'))
    }
    return this.context.host.storage.delete(scope, `session:${itemId}`)
  }

  private async listSessions(
    scope: AddonVaultScope,
    limit: number,
    cursor?: string,
  ): Promise<
    Either<
      AppError,
      {
        items: OperationalSessionState[]
        hasMore: boolean
        nextCursor?: string
      }
    >
  > {
    if (!this.context) {
      return Either.failure(AppError.Internal('ADDON_CONTEXT_UNINITIALIZED'))
    }
    const page = await this.context.host.storage.list(scope, {
      prefix: 'session:',
      limit,
      cursor,
    })
    if (page.isFailure()) {
      return Either.failure(page.failure)
    }
    const items: OperationalSessionState[] = []
    for (const entry of page.success.entries) {
      const parsed = parseSessionState(entry.value)
      if (parsed !== null) {
        items.push(parsed)
      }
    }
    let nextCursor: string | undefined = undefined
    if (page.success.hasMore) {
      nextCursor = page.success.nextCursor
    }
    return Either.success({
      items,
      hasMore: page.success.hasMore,
      nextCursor,
    })
  }

  async resolveUnassignedAllocations(
    request: AddonOperationalListRequest,
  ): Promise<Either<AppError, AddonOperationalListResponse>> {
    if (!this.context) {
      return Either.failure(AppError.Internal('ADDON_CONTEXT_UNINITIALIZED'))
    }

    let limit = 50
    if (request.limit !== undefined) {
      limit = request.limit
    }
    const listResult = await this.listSessions(
      request.scope,
      limit,
      request.cursor,
    )
    if (listResult.isFailure()) {
      return Either.failure(listResult.failure)
    }

    // Inicializa a sessão determinística padrão no storage canônico do escopo caso esteja vazio
    if (listResult.success.items.length === 0 && !request.cursor) {
      const defaultStart = new Date(Date.now() - 2700 * 1000)
      const defaultSession: OperationalSessionState = {
        itemId: 'session-north-unassigned-01',
        title: 'Sessão Não Alocada - Sala 999 (Prédio Norte)',
        subtitle: 'Duração: 45 min detectada via Beacon 999',
        status: 'pending',
        reason: 'Nenhuma regra correspondeu à sala 999 do Prédio Norte.',
        timestamp: defaultStart.toISOString(),
        durationSeconds: 2700,
        building: 'building-north',
        rawSignal: 'BEACON_ROOM_999',
        operationId: {
          commandId: 'cmd-op-session-north-01',
          entryId: 'entry-op-session-north-01',
        },
      }
      await this.saveSession(request.scope, defaultSession)
      listResult.success.items.push(defaultSession)
    }

    const items: AddonOperationalItem[] = []
    for (const session of listResult.success.items) {
      if (session.status === 'pending') {
        items.push({
          itemId: session.itemId,
          title: session.title,
          subtitle: session.subtitle,
          status: session.status,
          reason: session.reason,
          timestamp: session.timestamp,
          durationSeconds: session.durationSeconds,
          data: {
            building: session.building,
            rawSignal: session.rawSignal,
          },
          availableActions: [
            {
              id: 'assign-task',
              label: 'Associar Tarefa e Aceitar',
              variant: 'default',
            },
            {
              id: 'dismiss-allocation',
              label: 'Descartar Sessão',
              variant: 'destructive',
            },
          ],
        })
      }
    }

    if (listResult.success.hasMore && listResult.success.nextCursor) {
      return Either.success({
        items,
        hasMore: true,
        nextCursor: listResult.success.nextCursor,
      })
    }

    return Either.success({
      items,
      hasMore: false,
    })
  }

  async handleAssignTask(
    request: AddonExecuteOperationalActionRequest,
  ): Promise<Either<AppError, void>> {
    if (!this.context) {
      return Either.failure(AppError.Internal('ADDON_CONTEXT_UNINITIALIZED'))
    }

    const session = await this.getSession(request.scope, request.itemId)
    if (!session || session.status !== 'pending') {
      return Either.failure(AppError.NotFound('OPERATIONAL_SESSION_NOT_FOUND'))
    }

    const targetTask = parseTaskReference(request.payload?.['targetTask'])

    if (!targetTask) {
      return Either.failure(
        AppError.ValidationError('TARGET_TASK_REFERENCE_REQUIRED'),
      )
    }

    const scope: CoreConnectionScope = {
      workspaceId: targetTask.workspaceId,
      connectionInstanceId: targetTask.connectionInstanceId,
    }

    // Resolução do autor pelo membersProvider do datasource de destino
    const memberResult = await this.context.core.members.getCurrentUser(scope)
    let authorId: string | undefined
    let authorName: string | undefined

    if (memberResult.isSuccess()) {
      authorId = memberResult.success.id
      authorName = memberResult.success.name
    }

    const startTime = new Date(session.timestamp).getTime()
    const endTime = new Date(startTime + session.durationSeconds * 1000)

    const payload: LocalEntryInput = {
      taskId: targetTask.taskId,
      connectionInstanceId: targetTask.connectionInstanceId,
      userId: authorId,
      userName: authorName,
      comments: `Alocação Resolvida: ${session.title}`,
      timeSpentSeconds: session.durationSeconds,
      startDate: session.timestamp,
      endDate: endTime.toISOString(),
      source: 'ai_suggestion',
    }

    const created = await this.context.core.timeEntries.createSuggestion(
      targetTask.workspaceId,
      payload,
      session.operationId,
    )

    if (created.isFailure()) {
      return Either.failure(created.failure)
    }

    session.status = 'resolved'
    await this.saveSession(request.scope, session)
    return Either.success()
  }

  async handleDismissAllocation(
    request: AddonExecuteOperationalActionRequest,
  ): Promise<Either<AppError, void>> {
    const session = await this.getSession(request.scope, request.itemId)
    if (!session) {
      return Either.failure(AppError.NotFound('OPERATIONAL_SESSION_NOT_FOUND'))
    }
    await this.deleteSession(request.scope, request.itemId)
    return Either.success()
  }

  handleValidateSettings(
    request: AddonValidateSettingsRequest,
  ): Either<AppError, void> {
    const allocations = request.values['roomAllocations']
    if (Array.isArray(allocations)) {
      for (const item of allocations) {
        const record = unwrapCollectionItemValues(item)
        if (record !== null) {
          const ruleName = record['ruleName']
          if (!isString(ruleName) || ruleName.trim().length === 0) {
            return Either.failure(
              AppError.ValidationError('RULE_NAME_CANNOT_BE_EMPTY'),
            )
          }
        }
      }
    }
    return Either.success()
  }

  private syncAppliedValues(values: AddonSettingsValues): void {
    const rawAllocations = values['roomAllocations']
    const parsedRules: RoomAllocationRule[] = []

    if (Array.isArray(rawAllocations)) {
      for (const raw of rawAllocations) {
        const rec = unwrapCollectionItemValues(raw)
        if (rec !== null) {
          let ruleName = ''
          if (isString(rec['ruleName'])) ruleName = rec['ruleName']
          let building = ''
          if (isString(rec['building'])) building = rec['building']
          let floor = ''
          if (isString(rec['floor'])) floor = rec['floor']
          let room = ''
          if (isString(rec['room'])) room = rec['room']
          let active = true
          if (isBoolean(rec['active'])) active = rec['active']
          let rank = 1
          if (isNumber(rec['rank'])) rank = rec['rank']
          parsedRules.push({
            ruleName,
            building,
            floor,
            room,
            targetTask: parseTaskReference(rec['targetTask']),
            active,
            rank,
          })
        }
      }
    }

    parsedRules.sort((a, b) => a.rank - b.rank)
    this.currentRules = parsedRules
    this.defaultTask = parseTaskReference(values['defaultTask'])
  }

  async triggerControlledMeetingCapture(observed: {
    building: string
    floor: string
    room: string
    durationSeconds: number
    startTimeISO: string
    endTimeISO: string
  }): Promise<Either<AppError, void>> {
    if (!this.context) {
      return Either.failure(
        AppError.Internal('NO_ACTIVE_WORKSPACE_FOR_CAPTURE'),
      )
    }
    if (!this.activeWorkspaceId) {
      const wsRes = await this.context.core.workspaces.list()
      if (wsRes.isSuccess() && wsRes.success.length > 0 && wsRes.success[0]) {
        this.activeWorkspaceId = wsRes.success[0].id
      }
    }
    if (!this.activeWorkspaceId) {
      return Either.failure(
        AppError.Internal('NO_ACTIVE_WORKSPACE_FOR_CAPTURE'),
      )
    }
    if (this.currentRules.length === 0 && !this.defaultTask) {
      const snap = await this.context.host.vault.getSettings({
        kind: 'workspace',
        workspaceId: this.activeWorkspaceId,
      })
      if (snap.isSuccess()) {
        this.syncAppliedValues(snap.success.values)
      }
    }

    let matchedRule: RoomAllocationRule | undefined
    for (const rule of this.currentRules) {
      if (
        rule.active &&
        rule.building === observed.building &&
        rule.floor === observed.floor &&
        rule.room === observed.room
      ) {
        matchedRule = rule
        break
      }
    }

    let taskRef: AddonTaskReferenceValue | undefined = matchedRule?.targetTask
    if (taskRef === undefined) {
      taskRef = this.defaultTask
    }
    const operationId: LocalOperationIdentity = {
      commandId: randomUUID(),
      entryId: randomUUID(),
    }

    if (!taskRef?.taskId) {
      // Cria pendência operacional durável via storage canônico do escopo
      const unassignedId = `unassigned-${randomUUID()}`
      const newSession: OperationalSessionState = {
        itemId: unassignedId,
        title: `Reunião em ${observed.room} (${observed.building})`,
        subtitle: `Duração observada: ${Math.round(observed.durationSeconds / 60)} min`,
        status: 'pending',
        reason:
          'Nenhuma regra correspondente e nenhuma tarefa padrão configurada.',
        timestamp: observed.startTimeISO,
        durationSeconds: observed.durationSeconds,
        building: observed.building,
        rawSignal: `ROOM_SENSOR_${observed.room}`,
        operationId,
      }
      const scope = this.getStorageScope()
      await this.saveSession(scope, newSession)
      return Either.success()
    }

    const scope: CoreConnectionScope = {
      workspaceId: taskRef.workspaceId,
      connectionInstanceId: taskRef.connectionInstanceId,
    }

    const memberResult = await this.context.core.members.getCurrentUser(scope)
    let authorId: string | undefined
    let authorName: string | undefined

    if (memberResult.isSuccess()) {
      authorId = memberResult.success.id
      authorName = memberResult.success.name
    }

    let ruleLabel = 'Padrão'
    if (matchedRule !== undefined && matchedRule.ruleName.length > 0) {
      ruleLabel = matchedRule.ruleName
    }

    const payload: LocalEntryInput = {
      taskId: taskRef.taskId,
      connectionInstanceId: taskRef.connectionInstanceId,
      userId: authorId,
      userName: authorName,
      comments: `Reunião em ${observed.room} (${ruleLabel})`,
      timeSpentSeconds: observed.durationSeconds,
      startDate: observed.startTimeISO,
      endDate: observed.endTimeISO,
      source: 'ai_suggestion',
    }

    const result = await this.context.core.timeEntries.createSuggestion(
      this.activeWorkspaceId,
      payload,
      operationId,
    )

    if (result.isFailure()) {
      return Either.failure(result.failure)
    }

    return Either.success()
  }
}
