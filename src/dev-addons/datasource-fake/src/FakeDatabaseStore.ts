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
        this.isLoaded = true
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

  public pullTimeEntries(
    checkpointId: string,
    checkpointUpdatedAt: Date | undefined,
    batchSize: number,
  ): TimeEntryDTO[] {
    this.ensureLoaded()
    const sorted = [...this.timeEntries].sort((a, b) => {
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
      filtered = sorted.filter((entry) => {
        const entryTime = entry.updatedAt.getTime()
        if (entryTime > checkTime) return true
        if (entryTime === checkTime && checkpointId && entry.id) {
          return entry.id > checkpointId
        }
        return false
      })
    } else if (checkpointId) {
      const startIndex = sorted.findIndex((entry) => entry.id === checkpointId)
      if (startIndex >= 0) {
        filtered = sorted.slice(startIndex + 1)
      }
    }

    return filtered.slice(0, batchSize)
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
