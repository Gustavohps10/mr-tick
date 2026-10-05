import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type {
  MemberDTO,
  MetadataDTO,
  MetadataItem,
  TaskDTO,
  TimeEntryDTO,
} from '@mr-tick/sdk'

import {
  FAKE_MEMBER,
  FAKE_METADATA,
  FAKE_TASKS,
  FAKE_TIME_ENTRIES,
} from './fakeData'

interface SerializedTimeEntryDTO {
  id?: string
  correlationId?: string
  comments?: string
  timeSpent: number
  startDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
  task: { id: string }
  activity: { id: string; name?: string }
  user: { id: string; name?: string }
}

interface SerializedTaskDTO {
  id: string
  title: string
  description?: string
  url?: string
  projectName?: string
  status: { id: string; name: string }
  priority?: { id: string; name: string }
  assignedTo?: { id?: string; name: string }
  author?: { id?: string; name: string }
  tracker?: { id: string }
  createdAt: string
  updatedAt: string
  startDate?: string
  dueDate?: string
  doneRatio?: number
}

interface SerializedDatabaseData {
  version: number
  updatedAt: string
  tasks: SerializedTaskDTO[]
  timeEntries: SerializedTimeEntryDTO[]
  metadata: MetadataDTO
  members: MemberDTO[]
}

function serializeTimeEntry(entry: TimeEntryDTO): SerializedTimeEntryDTO {
  return {
    id: entry.id,
    correlationId: entry.correlationId,
    comments: entry.comments,
    timeSpent: entry.timeSpent,
    startDate: entry.startDate ? entry.startDate.toISOString() : undefined,
    endDate: entry.endDate ? entry.endDate.toISOString() : undefined,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    task: entry.task,
    activity: entry.activity,
    user: entry.user,
  }
}

function deserializeTimeEntry(
  serialized: SerializedTimeEntryDTO,
): TimeEntryDTO {
  return {
    id: serialized.id,
    correlationId: serialized.correlationId,
    comments: serialized.comments,
    timeSpent: serialized.timeSpent,
    startDate: serialized.startDate
      ? new Date(serialized.startDate)
      : undefined,
    endDate: serialized.endDate ? new Date(serialized.endDate) : undefined,
    createdAt: new Date(serialized.createdAt),
    updatedAt: new Date(serialized.updatedAt),
    task: serialized.task,
    activity: serialized.activity,
    user: serialized.user,
  }
}

function serializeTask(task: TaskDTO): SerializedTaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    url: task.url,
    projectName: task.projectName,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo,
    author: task.author,
    tracker: task.tracker,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    startDate: task.startDate ? task.startDate.toISOString() : undefined,
    dueDate: task.dueDate ? task.dueDate.toISOString() : undefined,
    doneRatio: task.doneRatio,
  }
}

function deserializeTask(serialized: SerializedTaskDTO): TaskDTO {
  return {
    id: serialized.id,
    title: serialized.title,
    description: serialized.description,
    url: serialized.url,
    projectName: serialized.projectName,
    status: serialized.status,
    priority: serialized.priority,
    assignedTo: serialized.assignedTo,
    author: serialized.author,
    tracker: serialized.tracker,
    createdAt: new Date(serialized.createdAt),
    updatedAt: new Date(serialized.updatedAt),
    startDate: serialized.startDate
      ? new Date(serialized.startDate)
      : undefined,
    dueDate: serialized.dueDate ? new Date(serialized.dueDate) : undefined,
    doneRatio: serialized.doneRatio,
  }
}

function getDatabaseFilePath(): string {
  const appData = process.env.APPDATA
  const baseDirectory =
    appData && appData.length > 0
      ? join(appData, 'mr-tick')
      : join(homedir(), '.mr-tick')
  const storageDirectory = join(baseDirectory, 'mr-tick-datasource-fake')
  return join(storageDirectory, 'fake-remote-db.json')
}

export class FakeDatabaseStore {
  private static instance: FakeDatabaseStore | null = null

  private filePath: string
  private isInMemory: boolean
  private timeEntries: TimeEntryDTO[] = []
  private tasks: TaskDTO[] = []
  private metadata: MetadataDTO = FAKE_METADATA
  private members: MemberDTO[] = [FAKE_MEMBER]
  private isLoaded: boolean = false
  private simulateAuthError: boolean = false
  private simulateTimeEntryCreateResponseLoss: boolean = false
  private pauseNextTimeEntryCreate = false
  private timeEntryCreateGate: Promise<void> | undefined
  private releaseTimeEntryCreateGate: (() => void) | undefined
  private timeEntryPullAttempts = 0
  private timeEntryFindByIdAttempts = 0
  private timeEntryFindByCorrelationAttempts = 0
  private timeEntryCreateAttempts = 0
  private timeEntryCreatesInFlight = 0
  private partialNextTimeEntryList = false
  private timeEntryPartialLists = 0
  private failNextTimeEntryList = false
  private timeEntryListFailures = 0
  private timeEntryDeleteAttempts = 0
  private pausedDeleteId: string | undefined
  private tombstonePulls = 0
  private pauseNextDelete = false
  private deleteGate: Promise<void> | undefined
  private releaseDeleteGate: (() => void) | undefined

  public pauseNextTimeEntryDelete(): void {
    this.pauseNextDelete = true
  }

  public async waitForDeleteRelease(id: string): Promise<void> {
    if (!this.pauseNextDelete) return
    this.pauseNextDelete = false
    this.pausedDeleteId = id
    const entry = this.findTimeEntryById(id)
    if (entry) this.saveTimeEntry({ ...entry, updatedAt: new Date() })
    this.deleteGate = new Promise<void>((resolve) => {
      this.releaseDeleteGate = resolve
    })
    await this.deleteGate
    this.deleteGate = undefined
    this.pausedDeleteId = undefined
    this.releaseDeleteGate = undefined
  }

  public releasePausedDelete(): boolean {
    if (!this.releaseDeleteGate) return false
    this.releaseDeleteGate()
    return true
  }

  private pauseNextUpdate = false
  private updateGate: Promise<void> | undefined
  private releaseUpdateGate: (() => void) | undefined
  private pausedUpdateId: string | undefined

  public pauseNextTimeEntryUpdate(): void {
    this.pauseNextUpdate = true
  }

  public async waitForUpdateRelease(id: string): Promise<void> {
    if (!this.pauseNextUpdate) return
    this.pauseNextUpdate = false
    this.pausedUpdateId = id
    this.updateGate = new Promise<void>((resolve) => {
      this.releaseUpdateGate = resolve
    })
    await this.updateGate
    this.updateGate = undefined
    this.pausedUpdateId = undefined
    this.releaseUpdateGate = undefined
  }

  public changePausedUpdateRemote(): boolean {
    if (!this.pausedUpdateId) return false
    const entry = this.findTimeEntryById(this.pausedUpdateId)
    if (!entry) return false
    this.saveTimeEntry({
      ...entry,
      comments: 'EXTERNAL_DURING_UPDATE',
      updatedAt: new Date(),
    })
    return true
  }

  public releasePausedUpdate(): boolean {
    if (!this.releaseUpdateGate) return false
    this.releaseUpdateGate()
    return true
  }

  private lastLegacyConfirmedId: string | null = null
  private legacyNextUpdateResult = false
  private legacyWriteNormalization = false
  private loseCanonicalRead = false
  private canonicalReadFailures = 0

  public configureLegacyUpdateConfirmation(): void {
    this.legacyNextUpdateResult = true
    this.legacyWriteNormalization = true
  }

  public getLegacyWriteNormalization(): boolean {
    return this.legacyWriteNormalization
  }

  public consumeLegacyUpdateResult(id: string): boolean {
    if (!this.legacyNextUpdateResult) return false
    this.legacyNextUpdateResult = false
    this.lastLegacyConfirmedId = id
    this.loseCanonicalRead = true
    return true
  }

  public deleteLastLegacyConfirmedEntry(): boolean {
    if (!this.lastLegacyConfirmedId) return false
    return this.deleteTimeEntry(this.lastLegacyConfirmedId)
  }

  public consumeCanonicalReadFailure(): boolean {
    if (!this.loseCanonicalRead) return false
    this.loseCanonicalRead = false
    this.canonicalReadFailures++
    return true
  }

  private updateFailureStatus = 503
  private failNextUpdate = false
  private failNextDelete = false
  private deleteFailureStatus = 503
  private deleteFailureMessage = 'FAKE_TIME_ENTRY_DELETE_UNAVAILABLE'
  private externalChangeOnUpdateFailure = false
  private updateFailures = 0
  private deleteFailures = 0
  private updateAttempts = 0

  public getUpdateFailureStatus(): number {
    return this.updateFailureStatus
  }

  public configureUpdateFailure(
    externalChange: boolean,
    statusCode = 503,
  ): void {
    this.updateFailureStatus = statusCode
    this.failNextUpdate = true
    this.externalChangeOnUpdateFailure = externalChange
  }

  public configureDeleteFailure(
    statusCode: number = 503,
    messageKey: string = 'FAKE_TIME_ENTRY_DELETE_UNAVAILABLE',
  ): void {
    this.deleteFailureMessage = messageKey
    this.deleteFailureStatus = statusCode
    this.failNextDelete = true
  }

  public consumeUpdateFailure(id: string): boolean {
    this.updateAttempts++
    if (!this.failNextUpdate) return false
    this.failNextUpdate = false
    this.updateFailures++
    if (this.externalChangeOnUpdateFailure) {
      this.externalChangeOnUpdateFailure = false
      const entry = this.findTimeEntryById(id)
      if (entry)
        this.saveTimeEntry({
          ...entry,
          comments: 'EXTERNAL_EDIT_AFTER_FAILED_UPDATE',
          updatedAt: new Date(),
        })
    }
    return true
  }

  public consumeDeleteFailure():
    { statusCode: number; messageKey: string } | undefined {
    if (!this.failNextDelete) return undefined
    this.failNextDelete = false
    this.deleteFailures++
    return {
      statusCode: this.deleteFailureStatus,
      messageKey: this.deleteFailureMessage,
    }
  }

  public returnPartialNextTimeEntryList(): void {
    this.partialNextTimeEntryList = true
  }

  public consumeTimeEntryPartialList(): boolean {
    if (!this.partialNextTimeEntryList) return false
    this.partialNextTimeEntryList = false
    this.timeEntryPartialLists++
    return true
  }

  public failNextTimeEntryListRequest(): void {
    this.failNextTimeEntryList = true
  }

  public consumeTimeEntryListFailure(): boolean {
    if (!this.failNextTimeEntryList) return false
    this.failNextTimeEntryList = false
    this.timeEntryListFailures++
    return true
  }

  public recordTimeEntryDeleteAttempt(): void {
    this.timeEntryDeleteAttempts++
  }

  private constructor() {
    this.isInMemory = process.env.FAKE_DB_IN_MEMORY === 'true'
    this.filePath = getDatabaseFilePath()
    this.ensureLoaded()
  }

  public static getInstance(): FakeDatabaseStore {
    if (!FakeDatabaseStore.instance) {
      FakeDatabaseStore.instance = new FakeDatabaseStore()
    }
    return FakeDatabaseStore.instance
  }

  public static resetInstance(): void {
    FakeDatabaseStore.instance = null
  }

  public getFilePath(): string {
    return this.filePath
  }

  public setSimulateAuthError(value: boolean): void {
    this.simulateAuthError = value
  }

  public getSimulateAuthError(): boolean {
    return this.simulateAuthError
  }

  private retainedPulls = 0
  private pullPauseRemaining = 0
  private pullGate: Promise<void> | undefined
  private releasePullGate: (() => void) | undefined

  public pauseTimeEntryPulls(count: number): void {
    this.pullPauseRemaining = count
    this.retainedPulls = 0
    this.pullGate = new Promise<void>((resolve) => {
      this.releasePullGate = resolve
    })
  }

  public async waitForTimeEntryPullRelease(): Promise<void> {
    if (this.pullPauseRemaining === 0) return
    this.pullPauseRemaining--
    this.retainedPulls++
    await this.pullGate
  }

  public releaseTimeEntryPulls(): boolean {
    const release = this.releasePullGate
    if (!release) return false
    this.releasePullGate = undefined
    this.pullGate = undefined
    release()
    return true
  }
  public recordTimeEntryPullAttempt(): void {
    this.timeEntryPullAttempts++
  }

  public recordTimeEntryFindByIdAttempt(): void {
    this.timeEntryFindByIdAttempts++
  }

  public recordTimeEntryFindByCorrelationAttempt(): void {
    this.timeEntryFindByCorrelationAttempts++
  }

  public startTimeEntryCreate(): void {
    this.timeEntryCreateAttempts++
    this.timeEntryCreatesInFlight++
  }

  public finishTimeEntryCreate(): void {
    this.timeEntryCreatesInFlight--
  }

  public pauseNextTimeEntryCreateRequest(): void {
    this.pauseNextTimeEntryCreate = true
  }

  public waitForTimeEntryCreateRelease(): Promise<void> {
    if (!this.pauseNextTimeEntryCreate) return Promise.resolve()
    this.pauseNextTimeEntryCreate = false
    this.timeEntryCreateGate = new Promise<void>((resolve) => {
      this.releaseTimeEntryCreateGate = resolve
    })
    return this.timeEntryCreateGate
  }

  public releasePausedTimeEntryCreateRequest(): boolean {
    const release = this.releaseTimeEntryCreateGate
    if (!release) return false
    this.releaseTimeEntryCreateGate = undefined
    this.timeEntryCreateGate = undefined
    release()
    return true
  }

  public setSimulateTimeEntryCreateResponseLoss(value: boolean): void {
    this.simulateTimeEntryCreateResponseLoss = value
  }

  public consumeTimeEntryCreateResponseLoss(): boolean {
    if (!this.simulateTimeEntryCreateResponseLoss) return false
    this.simulateTimeEntryCreateResponseLoss = false
    return true
  }

  public getTimeEntrySyncDiagnostics(): {
    retainedPulls: number
    pullAttempts: number
    findByIdAttempts: number
    findByCorrelationAttempts: number
    createAttempts: number
    createsInFlight: number
    createPaused: boolean
    timeEntryCount: number
    partialLists: number
    listFailures: number
    deleteAttempts: number
    tombstonePulls: number
    deletePaused: boolean
    updatePaused: boolean
    canonicalReadFailures: number
    updateFailures: number
    deleteFailures: number
    updateAttempts: number
    entries: { id?: string; comments?: string }[]
    remoteIds: string[]
  } {
    return {
      retainedPulls: this.retainedPulls,
      pullAttempts: this.timeEntryPullAttempts,
      findByIdAttempts: this.timeEntryFindByIdAttempts,
      findByCorrelationAttempts: this.timeEntryFindByCorrelationAttempts,
      createAttempts: this.timeEntryCreateAttempts,
      createsInFlight: this.timeEntryCreatesInFlight,
      createPaused: Boolean(this.timeEntryCreateGate),
      timeEntryCount: this.timeEntries.length,
      partialLists: this.timeEntryPartialLists,
      listFailures: this.timeEntryListFailures,
      deleteAttempts: this.timeEntryDeleteAttempts,
      tombstonePulls: this.tombstonePulls,
      deletePaused: Boolean(this.deleteGate),
      updatePaused: Boolean(this.updateGate),
      canonicalReadFailures: this.canonicalReadFailures,
      updateFailures: this.updateFailures,
      deleteFailures: this.deleteFailures,
      updateAttempts: this.updateAttempts,
      entries: this.timeEntries.map((entry) => ({
        id: entry.id,
        comments: entry.comments,
      })),
      remoteIds: this.timeEntries.flatMap((entry) =>
        entry.id ? [entry.id] : [],
      ),
    }
  }

  private ensureLoaded(): void {
    if (this.isLoaded) return

    if (this.isInMemory) {
      this.resetToSeed()
      this.isLoaded = true
      return
    }

    const directory = dirname(this.filePath)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }

    if (existsSync(this.filePath)) {
      try {
        const rawContent = readFileSync(this.filePath, 'utf8')
        const parsed: SerializedDatabaseData = JSON.parse(rawContent)
        this.timeEntries = parsed.timeEntries.map(deserializeTimeEntry)
        this.tasks = parsed.tasks.map(deserializeTask)
        this.metadata = parsed.metadata ?? FAKE_METADATA
        this.members = parsed.members ?? [FAKE_MEMBER]

        let hasNewItems = false
        for (const seedTask of FAKE_TASKS) {
          if (!this.tasks.some((t) => t.id === seedTask.id)) {
            this.tasks.push(deserializeTask(serializeTask(seedTask)))
            hasNewItems = true
          }
        }
        for (const seedEntry of FAKE_TIME_ENTRIES) {
          if (!this.timeEntries.some((e) => e.id === seedEntry.id)) {
            this.timeEntries.push(
              deserializeTimeEntry(serializeTimeEntry(seedEntry)),
            )
            hasNewItems = true
          }
        }

        this.isLoaded = true
        if (hasNewItems && !this.isInMemory) {
          this.persist()
        }
        return
      } catch (readError) {
        console.error(
          '[DataSourceFake] Erro ao carregar arquivo existente, gerando seed:',
          readError,
        )
      }
    }

    this.resetToSeed()
    this.isLoaded = true
    console.log(
      `[DataSourceFake] Banco em disco inicializado com seed: ${this.filePath}`,
    )
  }

  private persist(): void {
    if (this.isInMemory) return

    const data: SerializedDatabaseData = {
      version: 1,
      updatedAt: new Date().toISOString(),
      timeEntries: this.timeEntries.map(serializeTimeEntry),
      tasks: this.tasks.map(serializeTask),
      metadata: this.metadata,
      members: this.members,
    }

    const directory = dirname(this.filePath)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }

    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8')
  }

  // --- TIME ENTRIES ---

  public getTimeEntries(): TimeEntryDTO[] {
    this.ensureLoaded()
    return [...this.timeEntries]
  }

  public findTimeEntryById(id: string): TimeEntryDTO | undefined {
    this.ensureLoaded()
    return this.timeEntries.find((entry) => entry.id === id)
  }

  public findTimeEntryByCorrelationId(
    correlationId: string,
  ): TimeEntryDTO | undefined {
    this.ensureLoaded()
    return this.timeEntries.find(
      (entry) => entry.correlationId === correlationId,
    )
  }

  public findTimeEntriesByRange(
    memberId: string,
    startDate: Date | string,
    endDate: Date | string,
  ): TimeEntryDTO[] {
    this.ensureLoaded()
    const start = startDate instanceof Date ? startDate : new Date(startDate)
    const end = endDate instanceof Date ? endDate : new Date(endDate)
    return this.timeEntries.filter((entry) => {
      const rawDate = entry.startDate ?? entry.createdAt
      const entryDate = rawDate instanceof Date ? rawDate : new Date(rawDate)
      const matchesMember =
        !memberId || (entry.user && String(entry.user.id) === String(memberId))
      return matchesMember && entryDate >= start && entryDate <= end
    })
  }

  public recordTimeEntryPullPage(items: TimeEntryDTO[]): void {
    if (
      this.pausedDeleteId &&
      items.some((entry) => entry.id === this.pausedDeleteId)
    )
      this.tombstonePulls++
  }
  public saveTimeEntry(entity: TimeEntryDTO): void {
    this.ensureLoaded()
    const existingIndex = this.timeEntries.findIndex(
      (item) => item.id === entity.id,
    )
    const now = new Date()

    let activityName = 'Desenvolvimento'
    if (entity.activity && entity.activity.name) {
      activityName = entity.activity.name
    }
    if (!entity.activity?.name && entity.activity?.id) {
      const foundActivity = this.metadata.activities.find(
        (activityItem: MetadataItem) => activityItem.id === entity.activity.id,
      )
      if (foundActivity) activityName = foundActivity.name
    }

    let userName = `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`
    if (entity.user && entity.user.name) {
      userName = entity.user.name
    }

    const dto: TimeEntryDTO = {
      id: entity.id,
      correlationId: entity.correlationId,
      comments: entity.comments,
      timeSpent: entity.timeSpent,
      startDate: entity.startDate,
      endDate: entity.endDate,
      createdAt: entity.createdAt ? entity.createdAt : now,
      updatedAt: entity.updatedAt ? entity.updatedAt : now,
      task: { id: entity.task.id },
      activity: { id: entity.activity.id, name: activityName },
      user: {
        id: entity.user.id,
        name: userName,
      },
    }

    if (existingIndex >= 0) {
      this.timeEntries[existingIndex] = dto
      this.persist()
      return
    }

    this.timeEntries.push(dto)
    this.persist()
  }

  public deleteTimeEntry(id: string): boolean {
    this.ensureLoaded()
    const initialLength = this.timeEntries.length
    this.timeEntries = this.timeEntries.filter((item) => item.id !== id)
    const wasRemoved = this.timeEntries.length < initialLength
    if (wasRemoved) {
      this.persist()
    }
    return wasRemoved
  }

  // --- TASKS ---

  public getTasks(): TaskDTO[] {
    this.ensureLoaded()
    return [...this.tasks]
  }

  public findTaskById(id: string): TaskDTO | undefined {
    this.ensureLoaded()
    return this.tasks.find((task) => task.id === id)
  }

  public pullTasks(
    checkpointId: string,
    checkpointUpdatedAt: Date | undefined,
    batchSize: number,
  ): TaskDTO[] {
    this.ensureLoaded()
    const sorted = [...this.tasks].sort((a, b) => {
      const timeDiff = a.updatedAt.getTime() - b.updatedAt.getTime()
      if (timeDiff !== 0) return timeDiff
      const aId = a.id ?? ''
      const bId = b.id ?? ''
      if (aId < bId) return -1
      if (aId > bId) return 1
      return 0
    })

    let filtered = sorted
    if (checkpointUpdatedAt && checkpointUpdatedAt.getTime() > 0) {
      const checkTime = checkpointUpdatedAt.getTime()
      filtered = sorted.filter((task) => {
        const taskTime = task.updatedAt.getTime()
        if (taskTime > checkTime) return true
        if (taskTime === checkTime && checkpointId && task.id) {
          return task.id > checkpointId
        }
        return false
      })
    } else if (checkpointId) {
      const startIndex = sorted.findIndex((task) => task.id === checkpointId)
      if (startIndex >= 0) {
        filtered = sorted.slice(startIndex + 1)
      }
    }

    return filtered.slice(0, batchSize)
  }

  public saveTask(task: TaskDTO): void {
    this.ensureLoaded()
    const existingIndex = this.tasks.findIndex((item) => item.id === task.id)
    const now = new Date()

    const defaultStatus = this.metadata.taskStatuses[0] ?? {
      id: '1',
      name: 'Novo',
    }

    const dto: TaskDTO = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: defaultStatus,
      createdAt: task.createdAt ?? now,
      updatedAt: now,
    }

    if (existingIndex >= 0) {
      this.tasks[existingIndex] = {
        ...this.tasks[existingIndex],
        ...dto,
      }
    } else {
      this.tasks.push(dto)
    }

    this.persist()
  }

  public deleteTask(id: string): boolean {
    this.ensureLoaded()
    const initialLength = this.tasks.length
    this.tasks = this.tasks.filter((task) => task.id !== id)
    const wasRemoved = this.tasks.length < initialLength
    if (wasRemoved) {
      this.persist()
    }
    return wasRemoved
  }

  // --- METADATA & MEMBERS ---

  public getMetadata(): MetadataDTO {
    this.ensureLoaded()
    return this.metadata
  }

  public getMembers(): MemberDTO[] {
    this.ensureLoaded()
    return [...this.members]
  }

  // --- SIMULAÇÃO DE TESTES / CAOS REMOTO ---

  public deleteTimeEntriesFromToday(): number {
    this.ensureLoaded()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const initialCount = this.timeEntries.length
    this.timeEntries = this.timeEntries.filter((entry) => {
      const entryDate = entry.startDate ?? entry.createdAt
      return entryDate < today
    })
    const deletedCount = initialCount - this.timeEntries.length
    if (deletedCount > 0) {
      this.persist()
    }
    return deletedCount
  }

  public deleteTimeEntriesFromYesterday(): number {
    this.ensureLoaded()
    const yesterdayStart = new Date()
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    yesterdayStart.setHours(0, 0, 0, 0)

    const yesterdayEnd = new Date()
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
    yesterdayEnd.setHours(23, 59, 59, 999)

    const initialCount = this.timeEntries.length
    this.timeEntries = this.timeEntries.filter((entry) => {
      const entryDate = entry.startDate ?? entry.createdAt
      return entryDate < yesterdayStart || entryDate > yesterdayEnd
    })
    const deletedCount = initialCount - this.timeEntries.length
    if (deletedCount > 0) {
      this.persist()
    }
    return deletedCount
  }

  public deleteRandomRecentTimeEntry(): string | null {
    this.ensureLoaded()
    if (this.timeEntries.length === 0) return null
    const sorted = [...this.timeEntries].sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate).getTime() : 0
      const dateB = b.endDate ? new Date(b.endDate).getTime() : 0
      return dateB - dateA
    })
    const recent = sorted.find((entry) => Boolean(entry.endDate))
    if (!recent || !recent.id) return null
    const targetId = recent.id
    this.timeEntries = this.timeEntries.filter((entry) => entry.id !== targetId)
    this.persist()
    return targetId
  }

  public touchRecentTimeEntryConflict(): TimeEntryDTO | null {
    this.ensureLoaded()
    if (this.timeEntries.length === 0) return null
    const sorted = [...this.timeEntries].sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate).getTime() : 0
      const dateB = b.endDate ? new Date(b.endDate).getTime() : 0
      return dateB - dateA
    })
    const recent = sorted.find((entry) => Boolean(entry.endDate))
    if (!recent) return null

    const now = new Date()
    recent.updatedAt = now
    const newTimeSpent = Number((recent.timeSpent + 0.5).toFixed(2))
    recent.timeSpent = newTimeSpent
    if (recent.startDate) {
      const startTime = new Date(recent.startDate).getTime()
      recent.endDate = new Date(
        startTime + Math.round(newTimeSpent * 3600 * 1000),
      )
    }
    const cleanComments = recent.comments ? recent.comments : ''
    recent.comments =
      `[Alteração Remota Conflitante em ${now.toLocaleTimeString()}] ${cleanComments}`.trim()
    this.persist()
    return recent
  }

  public injectTimeEntry(
    daysOffset: number = 0,
    hours: number = 1.5,
  ): TimeEntryDTO {
    this.ensureLoaded()
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysOffset)
    targetDate.setHours(10, 0, 0, 0)

    const endDate = new Date(targetDate)
    endDate.setHours(10 + Math.floor(hours), Math.round((hours % 1) * 60), 0, 0)

    const now = new Date()
    const randomSuffix = Math.random().toString(36).substring(2, 6)
    const newId = `te-sim-${Date.now()}-${randomSuffix}`

    const task = this.tasks[0] ?? { id: 'SIM-1' }
    const activity = this.metadata.activities[0] ?? {
      id: 'act-coding',
      name: 'Coding',
    }

    const newEntry: TimeEntryDTO = {
      id: newId,
      task: { id: task.id },
      activity: { id: activity.id, name: activity.name },
      user: {
        id: String(FAKE_MEMBER.id),
        name: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
      },
      timeSpent: hours,
      startDate: targetDate,
      endDate: endDate,
      comments: `[Simulação Remota] Apontamento criado via Timerbar (${daysOffset === 0 ? 'Hoje' : daysOffset === -1 ? 'Ontem' : `${daysOffset}d`})`,
      createdAt: targetDate,
      updatedAt: now,
    }

    this.timeEntries.push(newEntry)
    this.persist()
    return newEntry
  }

  public resetToSeed(): void {
    this.failNextTimeEntryList = false
    this.partialNextTimeEntryList = false
    this.timeEntryPartialLists = 0
    this.timeEntryListFailures = 0
    this.timeEntryDeleteAttempts = 0
    this.timeEntryPullAttempts = 0
    this.timeEntryFindByIdAttempts = 0
    this.timeEntryFindByCorrelationAttempts = 0
    this.timeEntryCreateAttempts = 0
    this.timeEntryCreatesInFlight = 0
    this.releasePausedTimeEntryCreateRequest()
    this.pauseNextTimeEntryCreate = false
    this.simulateTimeEntryCreateResponseLoss = false
    this.timeEntries = FAKE_TIME_ENTRIES.map((e) => ({
      id: e.id,
      task: { id: e.task.id },
      activity: { id: e.activity.id, name: e.activity.name },
      user: { id: e.user.id, name: e.user.name },
      timeSpent: e.timeSpent,
      startDate: e.startDate ? new Date(e.startDate) : undefined,
      endDate: e.endDate ? new Date(e.endDate) : undefined,
      comments: e.comments,
      createdAt: new Date(e.createdAt),
      updatedAt: new Date(e.updatedAt),
    }))
    this.tasks = FAKE_TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      url: t.url,
      projectName: t.projectName,
      status: { ...t.status },
      priority: { ...t.priority },
      assignedTo: t.assignedTo ? { ...t.assignedTo } : undefined,
      author: t.author ? { ...t.author } : undefined,
      tracker: { ...t.tracker },
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
      startDate: t.startDate ? new Date(t.startDate) : undefined,
      dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
      doneRatio: t.doneRatio,
    }))
    this.metadata = FAKE_METADATA
    this.members = [{ ...FAKE_MEMBER }]
    this.isLoaded = true
    if (!this.isInMemory) this.persist()
  }
}
