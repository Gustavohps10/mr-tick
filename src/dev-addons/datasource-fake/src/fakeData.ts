import type {
  MemberDTO,
  MetadataDTO,
  MetadataItem,
  TaskDTO,
  TimeEntryDTO,
} from '@mr-tick/sdk'

const FAKE_USER_ID = '1'

/** Cores variadas para metadados (diferentes do Redmine) */
const palette = {
  slate: {
    badge: '#64748B',
    background: '#F1F5F9',
    text: '#334155',
    border: '#94A3B8',
  },
  emerald: {
    badge: '#059669',
    background: '#D1FAE5',
    text: '#047857',
    border: '#34D399',
  },
  amber: {
    badge: '#D97706',
    background: '#FEF3C7',
    text: '#B45309',
    border: '#FBBF24',
  },
  rose: {
    badge: '#E11D48',
    background: '#FFE4E6',
    text: '#BE123C',
    border: '#FB7185',
  },
  violet: {
    badge: '#7C3AED',
    background: '#EDE9FE',
    text: '#5B21B6',
    border: '#A78BFA',
  },
  sky: {
    badge: '#0284C7',
    background: '#E0F2FE',
    text: '#0369A1',
    border: '#38BDF8',
  },
  orange: {
    badge: '#EA580C',
    background: '#FFEDD5',
    text: '#C2410C',
    border: '#FB923C',
  },
  teal: {
    badge: '#0D9488',
    background: '#CCFBF1',
    text: '#0F766E',
    border: '#2DD4BF',
  },
} as const

export const FAKE_MEMBER: MemberDTO = {
  id: 1,
  login: 'dev.fake',
  firstname: 'Alex',
  lastname: 'Silva',
  admin: false,
  createdOn: new Date().toISOString(),
  lastLoginOn: new Date().toISOString(),
  customFields: [],
}

// --- Metadados estilo diferente do Redmine (JIRA/outros) ---
const TASK_STATUSES: MetadataItem[] = [
  { id: 'backlog', name: 'Backlog', icon: 'Inbox', colors: palette.slate },
  { id: 'progress', name: 'In Progress', icon: 'Play', colors: palette.sky },
  { id: 'review', name: 'In Review', icon: 'Eye', colors: palette.amber },
  { id: 'done', name: 'Done', icon: 'CheckCircle', colors: palette.emerald },
  { id: 'blocked', name: 'Blocked', icon: 'Ban', colors: palette.rose },
]

const TASK_PRIORITIES: MetadataItem[] = [
  {
    id: 'critical',
    name: 'Critical',
    icon: 'AlertTriangle',
    colors: palette.rose,
  },
  { id: 'high', name: 'High', icon: 'ArrowUpCircle', colors: palette.orange },
  { id: 'medium', name: 'Medium', icon: 'MinusCircle', colors: palette.amber },
  { id: 'low', name: 'Low', icon: 'ArrowDownCircle', colors: palette.slate },
  { id: 'deferred', name: 'Deferred', icon: 'Clock', colors: palette.slate },
]

const ACTIVITIES: MetadataItem[] = [
  { id: 'act-coding', name: 'Coding', icon: 'Terminal', colors: palette.sky },
  {
    id: 'act-review',
    name: 'Code Review',
    icon: 'GitMerge',
    colors: palette.violet,
  },
  { id: 'act-qa', name: 'QA', icon: 'FlaskConical', colors: palette.teal },
  { id: 'act-meeting', name: 'Meeting', icon: 'Users', colors: palette.amber },
  {
    id: 'act-docs',
    name: 'Documentation',
    icon: 'FileText',
    colors: palette.slate,
  },
  { id: 'act-design', name: 'Design', icon: 'Palette', colors: palette.orange },
]

const TRACKERS: MetadataItem[] = [
  { id: 'story', name: 'Story', icon: 'BookOpen', colors: palette.emerald },
  { id: 'bug', name: 'Bug', icon: 'Bug', colors: palette.rose },
  { id: 'spike', name: 'Spike', icon: 'Zap', colors: palette.amber },
  { id: 'task', name: 'Task', icon: 'CheckSquare', colors: palette.sky },
]

const PARTICIPANT_ROLES: MetadataItem[] = [
  { id: 'dev', name: 'Developer', icon: 'UserCog', colors: palette.sky },
  { id: 'reviewer', name: 'Reviewer', icon: 'Eye', colors: palette.violet },
  { id: 'qa', name: 'QA', icon: 'TestTube', colors: palette.teal },
]

const ESTIMATION_TYPES: MetadataItem[] = [
  { id: 'points', name: 'Story Points', icon: 'Hash', colors: palette.emerald },
  { id: 'hours', name: 'Hours', icon: 'Clock', colors: palette.slate },
]

export const FAKE_METADATA: MetadataDTO = {
  taskStatuses: TASK_STATUSES,
  taskPriorities: TASK_PRIORITIES,
  activities: ACTIVITIES,
  trackStatuses: TRACKERS,
  participantRoles: PARTICIPANT_ROLES,
  estimationTypes: ESTIMATION_TYPES,
}

// --- IDs estilo JIRA (projeto-key número) ---
const PROJECT_KEYS = ['DEV', 'BACK', 'API', 'INFRA', 'DOC', 'MOB'] as const
const TASK_TITLES = [
  'Implementar login com SSO',
  'Corrigir timeout na exportação',
  'Adicionar filtros no relatório',
  'Refatorar módulo de pagamentos',
  'Ajustar responsividade do dashboard',
  'Investigar lentidão no carregamento',
  'Documentar API de webhooks',
  'Configurar pipeline de deploy',
  'Migrar tabela de usuários',
  'Criar testes E2E do fluxo principal',
  'Atualizar dependências de segurança',
  'Melhorar mensagens de erro',
  'Integrar com serviço de notificações',
  'Otimizar query de listagem',
  'Revisar acessibilidade do formulário',
]

/** Determinístico por seed para dados reproduzíveis */
function seeded(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function buildTasks(): TaskDTO[] {
  const tasks: TaskDTO[] = []
  const rng = seeded(42)
  let globalNum = 1
  const now = new Date()
  const TOTAL_TARGET_TASKS = 1000

  for (let i = 1; i <= TOTAL_TARGET_TASKS; i++) {
    const key = pick(PROJECT_KEYS, rng)
    const id = `${key}-${globalNum}`
    const status = pick(TASK_STATUSES, rng)
    const priority = pick(TASK_PRIORITIES, rng)
    const tracker = pick(TRACKERS, rng)
    const daysAgo = Math.floor(rng() * 180)
    const created = new Date(now)
    created.setDate(created.getDate() - daysAgo)
    const updated = new Date(created)
    updated.setDate(updated.getDate() + Math.floor(rng() * 14))

    const isMine = rng() > 0.3
    const assignedTo = isMine
      ? {
          id: String(FAKE_MEMBER.id),
          name: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
        }
      : undefined
    const participants = isMine
      ? [
          {
            id: String(FAKE_MEMBER.id),
            name: `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`,
            role: { id: 'dev', name: 'Developer' },
          },
        ]
      : []

    tasks.push({
      id,
      title: pick(TASK_TITLES, rng) + ` (${id})`,
      description: `Descrição do item ${id} para cenários de teste de carga.`,
      createdAt: created,
      updatedAt: updated,
      status: { id: status.id, name: status.name },
      priority: { id: priority.id, name: priority.name },
      tracker: { id: tracker.id },
      projectName: `Projeto ${key}`,
      assignedTo,
      participants,
    })
    globalNum++
  }

  return tasks.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
}

export const FAKE_TASKS = buildTasks()
const TASK_IDS_FOR_ENTRIES = FAKE_TASKS.map((t) => t.id)
const USER_NAME = `${FAKE_MEMBER.firstname} ${FAKE_MEMBER.lastname}`

const MAX_HOURS_PER_DAY = 10 // realista; um dia nunca pode ter mais de 24h

/** Gera time entries realistas: 90 dias atrás até hoje, só dias úteis, 7h–18h.
 * Garante: por dia, soma de timeSpent <= MAX_HOURS_PER_DAY (e sempre <= 24h). */
function buildTimeEntries(): TimeEntryDTO[] {
  const entries: TimeEntryDTO[] = []
  const rng = seeded(123)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalDays = 90
  let entryId = 1

  for (let d = 0; d < totalDays - 1; d++) {
    const date = new Date(today)
    date.setDate(date.getDate() - (totalDays - 1 - d))
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    const roll = rng()
    let hoursThatDay: number
    if (roll < 0.05) hoursThatDay = 0
    else if (roll < 0.15) hoursThatDay = 2
    else if (roll < 0.3) hoursThatDay = 4
    else if (roll < 0.45) hoursThatDay = 5
    else if (roll < 0.6) hoursThatDay = 6
    else if (roll < 0.85) hoursThatDay = 7
    else hoursThatDay = 8

    // Garantia: nenhum dia passa de MAX_HOURS_PER_DAY (e nunca 24h)
    hoursThatDay = Math.min(hoursThatDay, MAX_HOURS_PER_DAY)
    if (hoursThatDay <= 0) continue

    const startHour = 7 + Math.floor(rng() * 3)
    const startMin = Math.floor(rng() * 60)
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      startHour,
      startMin,
      0,
      0,
    )

    let remaining = hoursThatDay
    let totalAddedThisDay = 0

    while (remaining > 0 && totalAddedThisDay < 24) {
      const chunk = pick([0.5, 1, 1.5, 2, 2.5, 3], rng)
      const spent = Math.min(chunk, remaining, 4, 24 - totalAddedThisDay)
      if (spent <= 0) break
      remaining -= spent
      totalAddedThisDay += spent

      const end = new Date(start.getTime() + spent * 60 * 60 * 1000)
      if (end.getHours() > 18 || end.getHours() < start.getHours()) {
        end.setHours(18, 0, 0, 0)
      }

      const taskId =
        TASK_IDS_FOR_ENTRIES[Math.floor(rng() * TASK_IDS_FOR_ENTRIES.length)]!
      const activity = pick(ACTIVITIES, rng)

      entries.push({
        id: `te-${entryId}`,
        task: { id: taskId },
        activity: { id: activity.id, name: activity.name },
        user: { id: FAKE_USER_ID, name: USER_NAME },
        timeSpent: spent,
        startDate: new Date(start),
        endDate: new Date(end),
        comments: rng() < 0.2 ? `Apontamento ${entryId}` : undefined,
        createdAt: new Date(start),
        updatedAt: new Date(end),
      })
      entryId++

      start.setTime(end.getTime())
      if (start.getHours() >= 18) break
    }
  }

  return entries.sort(
    (a, b) =>
      (a.startDate ?? a.createdAt).getTime() -
      (b.startDate ?? b.createdAt).getTime(),
  )
}

export const FAKE_TIME_ENTRIES = buildTimeEntries()
export const FAKE_TASK_IDS = FAKE_TASKS.map((t) => t.id)
