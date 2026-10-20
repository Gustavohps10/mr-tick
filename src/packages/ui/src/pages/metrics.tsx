import { useQuery } from '@tanstack/react-query'
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isValid,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  AlarmClockOff,
  AlertTriangle,
  ArrowUpDown,
  BarChartHorizontal,
  Brain,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  Clock,
  Clock4,
  Database,
  Flame,
  Grid,
  MessageSquareWarning,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { DateRange } from 'react-day-picker'
import { useNavigate } from 'react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PieChart as RechartsPieChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { MangoQuerySelector, RxDatabase } from 'rxdb'

import { DatePickerWithRange } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { AppCollections } from '@/stores/syncStore'
import { useSyncStore } from '@/stores/syncStore'

// #region Helper Functions and Constants

const chartSettings = {
  hoursGoal: 8.5,
  acceptablePercentage: 0.85,
  minHours: 7.2,
}

const WEEK_DAYS_CONFIG = [
  { id: 'Seg', label: 'Seg' },
  { id: 'Ter', label: 'Ter' },
  { id: 'Qua', label: 'Qua' },
  { id: 'Qui', label: 'Qui' },
  { id: 'Sex', label: 'Sex' },
  { id: 'Sáb', label: 'Sáb' },
  { id: 'Dom', label: 'Dom' },
]

const formatHours = (hours: number): string => {
  if (isNaN(hours) || hours < 0.01) return '00:00'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

const formatHoursMinutes = (hours: number): string => {
  if (isNaN(hours) || hours < 0.01) return '00h 00m'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`
}

const parseUTCDate = (dateString: string | undefined): Date => {
  if (!dateString) return new Date(NaN)
  const date = new Date(dateString)
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  )
}

const getEntriesForRange = async (
  db: RxDatabase<AppCollections>,
  from: Date,
  to: Date,
  dataSourceIds?: string[],
): Promise<SyncTimeEntryRxDBDTO[]> => {
  if (!db?.timeEntries) return []

  const selector: MangoQuerySelector<SyncTimeEntryRxDBDTO> = {
    startDate: {
      $gte: from.toISOString(),
      $lte: to.toISOString(),
    },
  }

  if (dataSourceIds && dataSourceIds.length > 0) {
    selector.dataSourceId = { $in: dataSourceIds }
  }

  console.log(
    '[MetricsLog] getEntriesForRange selector:',
    JSON.stringify(selector),
  )

  const result = await db.timeEntries.find({ selector }).exec()

  console.log(
    `[MetricsLog] getEntriesForRange — Found ${result.length} entries`,
  )

  return result as unknown as SyncTimeEntryRxDBDTO[]
}

// #endregion

// #region Skeletons

function SummaryCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <CardContent className="flex items-center justify-between p-0">
        <div className="flex flex-col justify-between gap-2">
          <Skeleton className="h-5 w-24" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-16 w-16 rounded-full" />
      </CardContent>
    </Card>
  )
}

function PeriodCardSkeleton() {
  return (
    <Card className="h-full p-5">
      <CardContent className="flex w-full items-center justify-between p-0">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCardSkeleton({
  className = 'h-[400px]',
}: {
  className?: string
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${className}`} />
      </CardContent>
    </Card>
  )
}

function PieChartSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="flex justify-center">
        <Skeleton className="h-[300px] w-[300px] rounded-full" />
      </CardContent>
    </Card>
  )
}

function QualityCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
      </CardHeader>
      <CardContent className="grid gap-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-1/4" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-1/4" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}

function HeatmapSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-[60px]" />
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-10 flex-1" />
            ))}
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 w-[60px]" />
              {Array.from({ length: 12 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-10 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// #endregion

// #region Types for derived data

interface EffortIntelligenceData {
  deepWorkHours: number
  deepWorkPercent: number
  contextSwitches: number
  focusScore: number
  consistencyData: { day: number; value: number }[]
}

interface FocusAnalysisDataPoint {
  date: string
  deepWork: number
  fragmented: number
}

interface SessionDistributionDataPoint {
  range: string
  count: number
}

interface TaskPerformanceRow {
  name: string
  totalHours: number
  sessions: number
  avgSession: string
  deepWorkPercent: number
}

interface InsightItem {
  icon: React.ElementType
  text: string
  type: 'positive' | 'warning' | 'neutral'
}

// #endregion

// #region Additional Dashboard Sections (real data from RxDB)

const effortIntelligenceChartConfig: ChartConfig = {
  value: { label: 'Horas', color: 'var(--chart-2)' },
}

function EffortIntelligenceSection({ data }: { data: EffortIntelligenceData }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4" />
            <span>Deep Work</span>
          </div>
          <div className="text-foreground text-2xl font-bold">
            {formatHoursMinutes(data.deepWorkHours)}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            {data.deepWorkPercent.toFixed(0)}% do tempo total
          </div>
          <div className="bg-muted mt-3 h-1.5 w-full rounded-full">
            <div
              className="bg-chart-1 h-full rounded-full"
              style={{ width: `${Math.min(data.deepWorkPercent, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4" />
            <span>Troca de Contexto</span>
          </div>
          <div className="text-foreground text-2xl font-bold">
            {data.contextSwitches}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            trocas no período
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                <span>Focus Score</span>
              </div>
              <div className="text-foreground text-2xl font-bold">
                {data.focusScore}
              </div>
              <div className="text-muted-foreground mt-1 text-xs">de 100</div>
            </div>
            <div className="border-border/60 flex h-16 w-16 items-center justify-center rounded-full border">
              <span className="text-chart-2 text-sm font-semibold">
                {data.focusScore}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4" />
            <span>Consistência</span>
          </div>
          {data.consistencyData.length > 0 ? (
            <ChartContainer
              config={effortIntelligenceChartConfig}
              className="h-12 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.consistencyData}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex h-12 items-center">
              <span className="text-muted-foreground text-xs">Sem dados</span>
            </div>
          )}
          <div className="text-muted-foreground mt-2 text-xs">
            Estabilidade diária{' '}
            <span
              className={
                data.focusScore >= 70 ? 'text-emerald-400' : 'text-amber-400'
              }
            >
              {data.focusScore >= 70 ? 'alta' : 'moderada'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const focusChartConfig: ChartConfig = {
  deepWork: { label: 'Deep Work', color: 'var(--chart-1)' },
  fragmented: { label: 'Fragmentado', color: 'var(--chart-4)' },
}

function FocusAnalysisSection({ data }: { data: FocusAnalysisDataPoint[] }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Análise de Foco</CardTitle>
        <CardDescription>
          Deep Work vs. Trabalho Fragmentado por dia
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={focusChartConfig} className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickMargin={8}
                tickFormatter={(value: number) => `${value}h`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => `Data: ${value}`}
                  />
                }
              />
              <Bar
                dataKey="deepWork"
                stackId="a"
                fill="var(--chart-1)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="fragmented"
                stackId="a"
                fill="var(--chart-4)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <div className="bg-chart-1 h-3 w-3 rounded-sm" />
            <span className="text-muted-foreground">Deep Work</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="bg-chart-4 h-3 w-3 rounded-sm" />
            <span className="text-muted-foreground">Fragmentado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const sessionChartConfig: ChartConfig = {
  count: { label: 'Sessões', color: 'var(--chart-2)' },
}

function SessionDistributionSection({
  data,
}: {
  data: SessionDistributionDataPoint[]
}) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Distribuição de Sessões</CardTitle>
        <CardDescription>Duração das sessões de trabalho</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={sessionChartConfig}
          className="h-[200px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="range"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickMargin={8}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => `Duração: ${value}`}
                  />
                }
              />
              <Bar
                dataKey="count"
                fill="var(--chart-2)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          {data.map((item, index) => (
            <div key={index}>
              <div className="text-foreground text-lg font-semibold">
                {item.count}
              </div>
              <div className="text-muted-foreground text-xs">{item.range}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function TaskPerformanceSection({ data }: { data: TaskPerformanceRow[] }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Performance por Tarefa</CardTitle>
        <CardDescription>
          Análise detalhada das principais tarefas do período
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">
                <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2">
                  Nome da Tarefa
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-muted-foreground text-right">
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Horas
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-muted-foreground text-right">
                Sessões
              </TableHead>
              <TableHead className="text-muted-foreground text-right">
                Média/Sessão
              </TableHead>
              <TableHead className="text-muted-foreground text-right">
                Deep Work %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-6 text-center"
                >
                  Sem dados no período
                </TableCell>
              </TableRow>
            ) : (
              data.map((task, index) => (
                <TableRow key={index} className="border-border/50">
                  <TableCell className="font-medium">{task.name}</TableCell>
                  <TableCell className="text-right">
                    {task.totalHours.toFixed(1)}h
                  </TableCell>
                  <TableCell className="text-right">{task.sessions}</TableCell>
                  <TableCell className="text-right">
                    {task.avgSession}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="bg-muted h-2 w-16 rounded-full">
                        <div
                          className="bg-chart-1 h-full rounded-full"
                          style={{ width: `${task.deepWorkPercent}%` }}
                        />
                      </div>
                      <span className="text-sm">{task.deepWorkPercent}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function AutomatedInsightsSection({ insights }: { insights: InsightItem[] }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="text-chart-3 h-5 w-5" />
          Insights Automatizados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem insights disponíveis para o período.
          </p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, index) => {
              const Icon = insight.icon
              return (
                <div
                  key={index}
                  className="border-border/50 bg-secondary/30 flex items-start gap-3 rounded-lg border p-3"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 ${
                      insight.type === 'positive'
                        ? 'text-emerald-400'
                        : insight.type === 'warning'
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                    }`}
                  />
                  <p className="text-foreground text-sm">{insight.text}</p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// #endregion

// #region Data Fetching

async function fetchSummaryData(
  db: RxDatabase<AppCollections>,
  dataSourceIds?: string[],
): Promise<{ today: number; week: number; month: number }> {
  if (!db?.timeEntries) return { today: 0, week: 0, month: 0 }

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const todayStr = format(now, 'yyyy-MM-dd')

  const selector: MangoQuerySelector<SyncTimeEntryRxDBDTO> = {
    startDate: { $gte: monthStart.toISOString() },
  }

  if (dataSourceIds && dataSourceIds.length > 0) {
    selector.dataSourceId = { $in: dataSourceIds }
  }

  console.log(
    '[MetricsLog] fetchSummaryData selector:',
    JSON.stringify(selector),
  )

  const entries = await db.timeEntries.find({ selector }).exec()

  console.log(`[MetricsLog] fetchSummaryData — Found ${entries.length} entries`)

  const result = (entries as unknown as SyncTimeEntryRxDBDTO[]).reduce(
    (acc, entry) => {
      if (!entry.startDate) return acc
      const entryDate = parseUTCDate(entry.startDate)
      const hours = Number(entry.timeSpent ?? 0)

      if (format(entryDate, 'yyyy-MM-dd') === todayStr) acc.today += hours
      if (entryDate >= weekStart && entryDate <= weekEnd) acc.week += hours
      acc.month += hours
      return acc
    },
    { today: 0, week: 0, month: 0 },
  )

  console.log('[MetricsLog] fetchSummaryData — result:', result)

  return result
}

async function fetchPeriodSummaryData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{
  totalHours: number
  overtimeHours: number
  workedDays: number
  possibleWorkDays: number
  totalEntries: number
}> {
  if (!db?.timeEntries)
    return {
      totalHours: 0,
      overtimeHours: 0,
      workedDays: 0,
      possibleWorkDays: 0,
      totalEntries: 0,
    }

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchPeriodSummaryData — processing entries:',
    entries.length,
  )

  const dailyHours: Record<string, number> = {}
  let totalOvertime = 0

  for (const entry of entries) {
    if (!entry.startDate) continue
    const startDate = parseUTCDate(entry.startDate)
    const totalHours = Number(entry.timeSpent ?? 0)
    if (isNaN(startDate.getTime()) || totalHours <= 0) continue

    const dateKey = format(startDate, 'yyyy-MM-dd')
    dailyHours[dateKey] = (dailyHours[dateKey] || 0) + totalHours
  }

  const allDaysInRange = eachDayOfInterval({ start: from, end: to })
  const workedDays = new Set<string>()
  let totalHours = 0

  allDaysInRange.forEach((day) => {
    const dateKey = format(day, 'yyyy-MM-dd')
    const hours = dailyHours[dateKey] || 0
    totalHours += hours

    if (hours > 0) workedDays.add(dateKey)
    if (hours > chartSettings.hoursGoal)
      totalOvertime += hours - chartSettings.hoursGoal
  })

  const weekdaysInRange = allDaysInRange.filter(
    (d) => d.getDay() > 0 && d.getDay() < 6,
  ).length

  const result = {
    totalHours,
    overtimeHours: totalOvertime,
    workedDays: workedDays.size,
    possibleWorkDays: weekdaysInRange,
    totalEntries: entries.length,
  }

  console.log('[MetricsLog] fetchPeriodSummaryData — result:', result)

  return result
}

async function fetchTimelineData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{
  timelineData: { date: string; day: string; dailyHours: number }[]
  overtimeData: {
    daysWithOvertime: number
    chartData: {
      date: string
      day: string
      dailyHours: number
      overtimeHours: number
    }[]
  }
}> {
  const empty = {
    timelineData: [],
    overtimeData: { daysWithOvertime: 0, chartData: [] },
  }

  if (!db?.timeEntries) return empty

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchTimelineData — Found',
    entries.length,
    'entries',
  )

  const dailyHours: Record<string, number> = {}

  for (const entry of entries) {
    if (!entry.startDate) continue
    const startDate = parseUTCDate(entry.startDate)
    const totalHours = Number(entry.timeSpent ?? 0)
    if (isNaN(startDate.getTime()) || totalHours <= 0) continue

    const dateKey = format(startDate, 'yyyy-MM-dd')
    dailyHours[dateKey] = (dailyHours[dateKey] || 0) + totalHours
  }

  const timelineData = eachDayOfInterval({ start: from, end: to }).map(
    (day) => ({
      date: format(day, 'yyyy-MM-dd'),
      day: format(day, 'EEE', { locale: ptBR }),
      dailyHours: dailyHours[format(day, 'yyyy-MM-dd')] || 0,
    }),
  )

  const overtime = timelineData.reduce(
    (acc, data) => {
      const overtimeHours =
        data.dailyHours > chartSettings.hoursGoal
          ? data.dailyHours - chartSettings.hoursGoal
          : 0
      if (overtimeHours > 0) acc.daysWithOvertime++
      acc.chartData.push({ ...data, overtimeHours })
      return acc
    },
    {
      daysWithOvertime: 0,
      chartData: [] as {
        date: string
        day: string
        dailyHours: number
        overtimeHours: number
      }[],
    },
  )

  const result = { timelineData, overtimeData: overtime }
  console.log('[MetricsLog] fetchTimelineData — result summary:', {
    days: timelineData.length,
    daysWithOvertime: overtime.daysWithOvertime,
  })

  return result
}

async function fetchAvgHoursData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{ day: string; averageHours: number }[]> {
  if (!db?.timeEntries) return []

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchAvgHoursData — Found',
    entries.length,
    'entries',
  )

  const dailyHours: Record<string, number> = {}
  const hoursByDayOfWeek: Record<number, number[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  }

  for (const entry of entries) {
    if (!entry.startDate) continue
    const startDate = parseUTCDate(entry.startDate)
    const totalHours = Number(entry.timeSpent ?? 0)
    if (isNaN(startDate.getTime()) || totalHours <= 0) continue
    const dateKey = format(startDate, 'yyyy-MM-dd')
    dailyHours[dateKey] = (dailyHours[dateKey] || 0) + totalHours
  }

  eachDayOfInterval({ start: from, end: to }).forEach((day) => {
    const dayOfWeek = day.getDay()
    const dateKey = format(day, 'yyyy-MM-dd')
    hoursByDayOfWeek[dayOfWeek].push(dailyHours[dateKey] || 0)
  })

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const avgData = weekDays.map((day, index) => {
    const hoursArray = hoursByDayOfWeek[index]
    const totalHours = hoursArray.reduce((sum, h) => sum + h, 0)
    return {
      day,
      averageHours: hoursArray.length > 0 ? totalHours / hoursArray.length : 0,
    }
  })

  const result = [...avgData.slice(1), avgData[0]]
  console.log('[MetricsLog] fetchAvgHoursData — result:', result)

  return result
}

async function fetchHeatmapData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<Record<string, Record<string, number>>> {
  if (!db?.timeEntries) return {}

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchHeatmapData — Found',
    entries.length,
    'entries',
  )

  const heatmapData: Record<string, Record<string, number>> = {}

  for (const entry of entries) {
    if (!entry.startDate || !entry.endDate) continue
    const startDate = parseUTCDate(entry.startDate)
    const totalHours = Number(entry.timeSpent ?? 0)
    if (isNaN(startDate.getTime()) || totalHours <= 0) continue

    const dayOfWeekKey = format(startDate, 'EEEE', {
      locale: enUS,
    }).toLowerCase()
    if (!heatmapData[dayOfWeekKey]) heatmapData[dayOfWeekKey] = {}

    let remainingMinutes = totalHours * 60
    let cursorDate = new Date(startDate)
    while (remainingMinutes > 0.1) {
      const cursorHour = cursorDate.getHours()
      const hourKey = String(cursorHour).padStart(2, '0')
      const nextHourDate = new Date(cursorDate)
      nextHourDate.setHours(cursorHour + 1, 0, 0, 0)
      const minutesToEndOfHour =
        (nextHourDate.getTime() - cursorDate.getTime()) / (1000 * 60)
      const minutesInSlot = Math.min(remainingMinutes, minutesToEndOfHour)
      if (minutesInSlot > 0) {
        heatmapData[dayOfWeekKey][hourKey] =
          (heatmapData[dayOfWeekKey][hourKey] || 0) + minutesInSlot / 60
      }
      remainingMinutes -= minutesInSlot
      cursorDate = nextHourDate
    }
  }

  console.log(
    '[MetricsLog] fetchHeatmapData — days with data:',
    Object.keys(heatmapData),
  )

  return heatmapData
}

async function fetchActivityData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{ activity: string; hours: number; fill: string }[]> {
  if (!db?.timeEntries) return []

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchActivityData — Found',
    entries.length,
    'entries',
  )

  const activityHours: Record<string, number> = {}

  for (const entry of entries) {
    if (!entry.startDate) continue
    const totalHours = Number(entry.timeSpent ?? 0)
    if (totalHours <= 0) continue

    const activityName = entry.activity?.name || 'Não categorizado'
    activityHours[activityName] =
      (activityHours[activityName] || 0) + totalHours
  }

  const activityColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
  ]

  const result = Object.entries(activityHours)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, hours], i) => ({
      activity: name,
      hours,
      fill: activityColors[i % activityColors.length],
    }))

  console.log('[MetricsLog] fetchActivityData — result:', result)

  return result
}

async function fetchQualityData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{
  punctualityData: { name: string; value: number; fill: string }[]
  quality: { forgottenDays: number; noCommentPercent: number }
}> {
  const empty = {
    punctualityData: [],
    quality: { forgottenDays: 0, noCommentPercent: 0 },
  }
  if (!db?.timeEntries) return empty

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchQualityData — Found',
    entries.length,
    'entries',
  )

  let noCommentCount = 0
  let punctualCount = 0
  let delayedCount = 0
  const dailyHours: Record<string, number> = {}

  for (const entry of entries) {
    if (!entry.startDate) continue
    const startDate = parseUTCDate(entry.startDate)
    const totalHours = Number(entry.timeSpent ?? 0)
    const dateKey = format(startDate, 'yyyy-MM-dd')

    if (totalHours > 0) {
      dailyHours[dateKey] = (dailyHours[dateKey] || 0) + totalHours
    }

    if (!entry.comments?.trim()) noCommentCount++

    const createdAtDate = parseUTCDate(entry.createdAt)
    if (!isNaN(createdAtDate.getTime())) {
      format(createdAtDate, 'yyyy-MM-dd') === dateKey
        ? punctualCount++
        : delayedCount++
    }
  }

  const totalPunctuality = punctualCount + delayedCount
  const punctualityData =
    totalPunctuality > 0
      ? [
          { name: 'Pontuais', value: punctualCount, fill: 'var(--chart-2)' },
          { name: 'Atrasados', value: delayedCount, fill: 'var(--chart-5)' },
        ]
      : []

  const weekdaysInRange = eachDayOfInterval({ start: from, end: to }).filter(
    (d) => d.getDay() > 0 && d.getDay() < 6,
  )
  const workedWeekdaysCount = weekdaysInRange.filter(
    (d) => (dailyHours[format(d, 'yyyy-MM-dd')] || 0) > 0,
  ).length
  const quality = {
    forgottenDays: weekdaysInRange.length - workedWeekdaysCount,
    noCommentPercent:
      entries.length > 0 ? (noCommentCount / entries.length) * 100 : 0,
  }

  const result = { punctualityData, quality }
  console.log('[MetricsLog] fetchQualityData — result:', result)

  return result
}

// Derived query: computes effort intelligence, focus analysis, session distribution,
// task performance and automated insights from raw entries in the period.
async function fetchEnhancedAnalyticsData(
  db: RxDatabase<AppCollections>,
  dateRange: { from: Date; to: Date },
  dataSourceIds?: string[],
): Promise<{
  effort: EffortIntelligenceData
  focusAnalysis: FocusAnalysisDataPoint[]
  sessionDistribution: SessionDistributionDataPoint[]
  taskPerformance: TaskPerformanceRow[]
  insights: InsightItem[]
}> {
  const emptyResult = {
    effort: {
      deepWorkHours: 0,
      deepWorkPercent: 0,
      contextSwitches: 0,
      focusScore: 0,
      consistencyData: [],
    },
    focusAnalysis: [],
    sessionDistribution: [
      { range: '0-15min', count: 0 },
      { range: '15-30min', count: 0 },
      { range: '30-60min', count: 0 },
      { range: '1-2h', count: 0 },
      { range: '2h+', count: 0 },
    ],
    taskPerformance: [],
    insights: [],
  }

  if (!db?.timeEntries) return emptyResult

  const { from, to } = dateRange
  const entries = await getEntriesForRange(db, from, to, dataSourceIds)

  console.log(
    '[MetricsLog] fetchEnhancedAnalyticsData — Found',
    entries.length,
    'entries',
  )

  if (entries.length === 0) return emptyResult

  // Session distribution buckets
  const sessionBuckets = {
    '0-15min': 0,
    '15-30min': 0,
    '30-60min': 0,
    '1-2h': 0,
    '2h+': 0,
  }

  // Task aggregation: task id -> aggregated data
  const taskMap: Record<
    string,
    {
      name: string
      totalHours: number
      sessions: number
      deepWorkSessions: number
    }
  > = {}

  // Daily deep work vs fragmented (sessions >= 1h = deep work)
  const dailyDeep: Record<string, number> = {}
  const dailyFrag: Record<string, number> = {}

  let totalHours = 0
  let deepWorkHours = 0
  let contextSwitches = 0
  let prevTaskId = ''

  // Daily hours for consistency sparkline
  const dailyHoursMap: Record<string, number> = {}

  for (const entry of entries) {
    const hours = Number(entry.timeSpent ?? 0)
    if (hours <= 0) continue

    totalHours += hours

    const taskId = entry.task?.id ?? 'unknown'
    const taskName =
      (entry as SyncTimeEntryRxDBDTO & { taskData?: { title?: string } })
        .taskData?.title ?? `Tarefa ${taskId}`

    if (!taskMap[taskId]) {
      taskMap[taskId] = {
        name: taskName,
        totalHours: 0,
        sessions: 0,
        deepWorkSessions: 0,
      }
    }
    taskMap[taskId].totalHours += hours
    taskMap[taskId].sessions += 1

    // Deep work: sessions >= 1h
    if (hours >= 1) {
      deepWorkHours += hours
      taskMap[taskId].deepWorkSessions += 1
    }

    // Context switch: task changed from previous entry
    if (prevTaskId && prevTaskId !== taskId) contextSwitches++
    prevTaskId = taskId

    // Session duration buckets
    const minutes = hours * 60
    if (minutes < 15) sessionBuckets['0-15min']++
    else if (minutes < 30) sessionBuckets['15-30min']++
    else if (minutes < 60) sessionBuckets['30-60min']++
    else if (minutes < 120) sessionBuckets['1-2h']++
    else sessionBuckets['2h+']++

    // Daily breakdown
    if (entry.startDate) {
      const startDate = parseUTCDate(entry.startDate)
      if (!isNaN(startDate.getTime())) {
        const dateKey = format(startDate, 'dd/MM')
        dailyHoursMap[dateKey] = (dailyHoursMap[dateKey] || 0) + hours
        if (hours >= 1) {
          dailyDeep[dateKey] = (dailyDeep[dateKey] || 0) + hours
        } else {
          dailyFrag[dateKey] = (dailyFrag[dateKey] || 0) + hours
        }
      }
    }
  }

  const deepWorkPercent =
    totalHours > 0 ? (deepWorkHours / totalHours) * 100 : 0

  // Focus score: weighted average of deepWorkPercent and low contextSwitches
  const switchPenalty = Math.min(contextSwitches * 0.5, 30)
  const focusScore = Math.round(
    Math.max(0, Math.min(100, deepWorkPercent - switchPenalty)),
  )

  // Consistency sparkline: last 10 days with data
  const consistencyData = Object.entries(dailyHoursMap)
    .slice(-10)
    .map(([, value], index) => ({ day: index + 1, value }))

  // Focus analysis: sorted dates
  const focusAnalysis: FocusAnalysisDataPoint[] = Object.keys({
    ...dailyDeep,
    ...dailyFrag,
  })
    .sort()
    .map((date) => ({
      date,
      deepWork: Number((dailyDeep[date] || 0).toFixed(2)),
      fragmented: Number((dailyFrag[date] || 0).toFixed(2)),
    }))

  // Session distribution
  const sessionDistribution: SessionDistributionDataPoint[] = [
    { range: '0-15min', count: sessionBuckets['0-15min'] },
    { range: '15-30min', count: sessionBuckets['15-30min'] },
    { range: '30-60min', count: sessionBuckets['30-60min'] },
    { range: '1-2h', count: sessionBuckets['1-2h'] },
    { range: '2h+', count: sessionBuckets['2h+'] },
  ]

  // Task performance: top 5 by total hours
  const taskPerformance: TaskPerformanceRow[] = Object.values(taskMap)
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 5)
    .map((t) => {
      const avgSessionHours = t.sessions > 0 ? t.totalHours / t.sessions : 0
      const avgH = Math.floor(avgSessionHours)
      const avgM = Math.round((avgSessionHours - avgH) * 60)
      const avgSession =
        avgH > 0 ? `${avgH}h ${avgM.toString().padStart(2, '0')}m` : `${avgM}m`
      const dwPercent =
        t.sessions > 0 ? Math.round((t.deepWorkSessions / t.sessions) * 100) : 0
      return {
        name: t.name,
        totalHours: t.totalHours,
        sessions: t.sessions,
        avgSession,
        deepWorkPercent: dwPercent,
      }
    })

  // Automated insights
  const insights: InsightItem[] = []

  if (deepWorkPercent >= 40) {
    insights.push({
      icon: TrendingUp,
      text: `Você teve ${deepWorkPercent.toFixed(0)}% de deep work no período.`,
      type: 'positive',
    })
  }

  if (contextSwitches > 20) {
    insights.push({
      icon: AlertTriangle,
      text: `Houve ${contextSwitches} trocas de contexto — considere agrupar tarefas similares.`,
      type: 'warning',
    })
  }

  if (sessionBuckets['1-2h'] > 0) {
    insights.push({
      icon: Sparkles,
      text: `Sessões de 1-2h representam seu padrão de maior foco.`,
      type: 'neutral',
    })
  }

  if (focusScore >= 70) {
    insights.push({
      icon: Zap,
      text: `Focus Score de ${focusScore}/100 — excelente consistência!`,
      type: 'positive',
    })
  }

  const result = {
    effort: {
      deepWorkHours,
      deepWorkPercent,
      contextSwitches,
      focusScore,
      consistencyData,
    },
    focusAnalysis,
    sessionDistribution,
    taskPerformance,
    insights,
  }

  console.log('[MetricsLog] fetchEnhancedAnalyticsData — result summary:', {
    deepWorkHours,
    deepWorkPercent: deepWorkPercent.toFixed(1),
    contextSwitches,
    focusScore,
    focusAnalysisDays: focusAnalysis.length,
    taskPerformanceCount: taskPerformance.length,
    insightsCount: insights.length,
  })

  return result
}

// #endregion

export function Metrics() {
  const db = useSyncStore((state) => state?.db)
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const [date, setDate] = useState<DateRange | undefined>(() => {
    const today = new Date()
    return { from: startOfMonth(today), to: endOfMonth(today) }
  })

  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({
    Seg: true,
    Ter: true,
    Qua: true,
    Qui: true,
    Sex: true,
    Sáb: false,
    Dom: false,
  })

  const dateRange = useMemo(
    () => ({
      from: date?.from ?? startOfToday(),
      to: endOfDay(date?.to ?? date?.from ?? startOfToday()),
    }),
    [date],
  )

  const availableDataSources = useMemo(() => {
    const connections =
      (
        workspace as {
          connections?: {
            id: string
            name?: string
            provider?: string
            dataSourceId?: string
          }[]
        }
      )?.connections || []
    return Array.isArray(connections)
      ? connections.map((c) => ({
          id: c.dataSourceId ?? c.id,
          label: c.name || c.provider || c.id,
        }))
      : []
  }, [workspace])

  const [selectedSources, setSelectedSources] = useState<string[]>(['all'])

  const effectiveSourceIds = useMemo(() => {
    if (
      selectedSources.includes('all') ||
      selectedSources.length === 0 ||
      availableDataSources.length === 0
    ) {
      return availableDataSources.map((s) => s.id)
    }
    return selectedSources
  }, [selectedSources, availableDataSources])

  const queryKeyBase = [
    workspace?.id,
    dateRange.from,
    dateRange.to,
    (effectiveSourceIds || []).join(','),
  ]
  const queryOptions = {
    enabled: !!db && !!workspace?.id && !!date?.from,
  }

  // #region Queries

  const summaryQuery = useQuery({
    queryKey: [
      'metricsSummary',
      workspace?.id,
      (effectiveSourceIds || []).join(','),
    ],
    queryFn: () =>
      db
        ? fetchSummaryData(db as RxDatabase<AppCollections>, effectiveSourceIds)
        : Promise.resolve({ today: 0, week: 0, month: 0 }),
    enabled: !!db && !!workspace?.id,
  })

  const periodSummaryQuery = useQuery({
    queryKey: ['metricsPeriodSummary', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchPeriodSummaryData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve({
            totalHours: 0,
            overtimeHours: 0,
            workedDays: 0,
            possibleWorkDays: 0,
            totalEntries: 0,
          }),
    ...queryOptions,
  })

  const timelineQuery = useQuery({
    queryKey: ['metricsTimeline', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchTimelineData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve({
            timelineData: [],
            overtimeData: { daysWithOvertime: 0, chartData: [] },
          }),
    ...queryOptions,
  })

  const avgHoursQuery = useQuery({
    queryKey: ['metricsAvgHours', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchAvgHoursData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve([]),
    ...queryOptions,
  })

  const heatmapQuery = useQuery({
    queryKey: ['metricsHeatmap', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchHeatmapData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve({}),
    ...queryOptions,
  })

  const activityQuery = useQuery({
    queryKey: ['metricsActivity', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchActivityData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve([]),
    ...queryOptions,
  })

  const qualityQuery = useQuery({
    queryKey: ['metricsQuality', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchQualityData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve({
            punctualityData: [],
            quality: { forgottenDays: 0, noCommentPercent: 0 },
          }),
    ...queryOptions,
  })

  const enhancedAnalyticsQuery = useQuery({
    queryKey: ['metricsEnhancedAnalytics', ...queryKeyBase],
    queryFn: () =>
      db
        ? fetchEnhancedAnalyticsData(
            db as RxDatabase<AppCollections>,
            dateRange,
            effectiveSourceIds,
          )
        : Promise.resolve({
            effort: {
              deepWorkHours: 0,
              deepWorkPercent: 0,
              contextSwitches: 0,
              focusScore: 0,
              consistencyData: [],
            },
            focusAnalysis: [],
            sessionDistribution: [
              { range: '0-15min', count: 0 },
              { range: '15-30min', count: 0 },
              { range: '30-60min', count: 0 },
              { range: '1-2h', count: 0 },
              { range: '2h+', count: 0 },
            ],
            taskPerformance: [],
            insights: [],
          }),
    ...queryOptions,
  })

  // #endregion

  // #region Memos and Derived State

  const acceptableHours =
    chartSettings.hoursGoal * chartSettings.acceptablePercentage

  const { yAxisMax, yAxisTicks } = useMemo(() => {
    const maxHours = Math.max(
      ...(timelineQuery.data?.timelineData.map((d) => d.dailyHours) || [0]),
      0,
    )
    const newYAxisMax = Math.max(chartSettings.hoursGoal, maxHours)
    const ticks = new Set<number>()
    for (let i = 0; i <= Math.ceil(newYAxisMax); i += 2) ticks.add(i)
    ticks.add(chartSettings.hoursGoal)
    ticks.add(acceptableHours)
    return {
      yAxisMax: newYAxisMax,
      yAxisTicks: Array.from(ticks).sort((a, b) => a - b),
    }
  }, [timelineQuery.data?.timelineData, acceptableHours])

  const _activityChartConfig = useMemo(
    () =>
      (activityQuery.data || []).reduce<ChartConfig>(
        (acc, { activity, fill }) => {
          acc[activity] = { label: activity, color: fill }
          return acc
        },
        {},
      ),
    [activityQuery.data],
  )

  const avgHoursAnalysis = useMemo(() => {
    const visibleDaysData = (avgHoursQuery.data || []).filter(
      (data) => selectedDays[data.day],
    )
    if (visibleDaysData.length === 0)
      return { chartData: [], overallAverage: 0 }
    const totalAverageHours = visibleDaysData.reduce(
      (sum, day) => sum + day.averageHours,
      0,
    )
    return {
      chartData: visibleDaysData,
      overallAverage: totalAverageHours / visibleDaysData.length,
    }
  }, [avgHoursQuery.data, selectedDays])

  const maxHeatmapHours = useMemo(() => {
    if (!heatmapQuery.data) return 1
    const allHourValues = Object.values(heatmapQuery.data).flatMap((day) =>
      Object.values(day as Record<string, number>),
    )
    return allHourValues.length > 0 ? Math.max(...allHourValues) : 1
  }, [heatmapQuery.data])

  // Chart config for summary progress rings — NOTE: these PieCharts do NOT use
  // ChartTooltip so they do NOT need a ChartContainer wrapper.
  const summaryCards = useMemo(() => {
    const data = summaryQuery.data ?? { today: 0, week: 0, month: 0 }
    const metas = {
      today: { meta: chartSettings.hoursGoal, min: chartSettings.minHours },
      week: {
        meta: chartSettings.hoursGoal * 5,
        min: chartSettings.minHours * 5,
      },
      month: {
        meta: chartSettings.hoursGoal * 21,
        min: chartSettings.minHours * 21,
      },
    }
    return [
      {
        label: 'Hoje',
        horas: data.today,
        meta: metas.today.meta,
        min: metas.today.min,
        porcentagem:
          metas.today.meta > 0 ? (data.today / metas.today.meta) * 100 : 0,
        Icon: Clock,
        cor: 'var(--chart-1)',
      },
      {
        label: 'Semana',
        horas: data.week,
        meta: metas.week.meta,
        min: metas.week.min,
        porcentagem:
          metas.week.meta > 0 ? (data.week / metas.week.meta) * 100 : 0,
        Icon: Calendar,
        cor: 'var(--chart-2)',
      },
      {
        label: 'Mês',
        horas: data.month,
        meta: metas.month.meta,
        min: metas.month.min,
        porcentagem:
          metas.month.meta > 0 ? (data.month / metas.month.meta) * 100 : 0,
        Icon: TrendingUp,
        cor: 'var(--chart-3)',
      },
    ]
  }, [summaryQuery.data])

  const periodCards = useMemo(() => {
    const data = periodSummaryQuery.data ?? {
      totalHours: 0,
      overtimeHours: 0,
      workedDays: 0,
      possibleWorkDays: 0,
      totalEntries: 0,
    }
    return [
      {
        title: 'Total de Horas',
        value: formatHours(data.totalHours),
        delta: `${formatHoursMinutes(data.totalHours)} no período`,
        Icon: Timer,
      },
      {
        title: 'Horas Extras',
        value: `+${formatHours(data.overtimeHours)}`,
        delta: 'acima da meta',
        Icon: Flame,
      },
      {
        title: 'Dias Trabalhados',
        value: `${data.workedDays} dias`,
        delta: `de ${data.possibleWorkDays} dias úteis`,
        Icon: Briefcase,
      },
      {
        title: 'Apontamentos',
        value: data.totalEntries,
        delta: `Total de registros no período`,
        Icon: CheckSquare,
      },
    ]
  }, [periodSummaryQuery.data])

  // #endregion

  // #region Handlers and Render Functions

  const handleDayToggle = (dayLabel: string) => {
    setSelectedDays((prev) => ({ ...prev, [dayLabel]: !prev[dayLabel] }))
  }

  const getHeatmapStyle = (hours: number | undefined): React.CSSProperties => {
    if (!hours || hours <= 0.01) return { backgroundColor: 'transparent' }
    const ratio = Math.min(hours / maxHeatmapHours, 1)
    return {
      backgroundColor: 'var(--chart-2)',
      opacity: Math.min(0.15 + Math.sqrt(ratio) * 0.85, 1),
    }
  }

  const heatmapDayMapping = [
    { key: 'monday', display: 'Seg' },
    { key: 'tuesday', display: 'Ter' },
    { key: 'wednesday', display: 'Qua' },
    { key: 'thursday', display: 'Qui' },
    { key: 'friday', display: 'Sex' },
    { key: 'saturday', display: 'Sáb' },
    { key: 'sunday', display: 'Dom' },
  ]

  // #endregion

  // Chart configs
  const punctualityChartConfig: ChartConfig = {
    Pontuais: { label: 'Pontuais', color: 'var(--chart-2)' },
    Atrasados: { label: 'Atrasados', color: 'var(--chart-5)' },
  }

  const avgHoursChartConfig: ChartConfig = {
    averageHours: { label: 'Média de Horas ', color: 'var(--primary)' },
  }

  const overtimeChartConfig: ChartConfig = {
    overtimeHours: { label: 'Horas Extras', color: 'var(--chart-5)' },
  }

  return (
    <>
      {availableDataSources.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-border/60 bg-background/50 hover:bg-accent h-8 rounded-md px-2.5 text-xs font-medium shadow-2xs"
              >
                <Database className="mr-1.5 size-3.5 opacity-70" />
                {(() => {
                  if (
                    selectedSources.includes('all') ||
                    selectedSources.length === 0
                  ) {
                    return 'Todas as Fontes'
                  }
                  if (selectedSources.length === 1) {
                    const source = availableDataSources.find(
                      (s) => s.id === selectedSources[0],
                    )
                    return source?.label || '1 fonte'
                  }
                  return `${selectedSources.length} fontes`
                })()}
                <ChevronDown className="ml-1.5 size-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1.5" align="end">
              <div className="space-y-0.5 text-xs">
                <div
                  className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 transition-colors"
                  onClick={() => setSelectedSources(['all'])}
                >
                  <Checkbox
                    checked={selectedSources.includes('all')}
                    className="size-3.5"
                  />
                  <span>Todas as Fontes</span>
                </div>
                {availableDataSources.map((source) => (
                  <div
                    key={source.id}
                    className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 transition-colors"
                    onClick={() =>
                      setSelectedSources((prev) => {
                        if (prev.includes('all')) return [source.id]
                        return prev.includes(source.id)
                          ? prev.filter((id) => id !== source.id)
                          : [...prev, source.id]
                      })
                    }
                  >
                    <Checkbox
                      checked={
                        selectedSources.includes('all') ||
                        selectedSources.includes(source.id)
                      }
                      className="size-3.5"
                    />
                    <span>{source.label}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* --- 1. SEÇÃO "STATUS ATUAL" --- */}
        <div>
          <h2 className="font-sans text-lg font-bold tracking-tight">
            Status Atual
          </h2>
          <p className="text-muted-foreground text-sm">
            Resumo do seu desempenho recente.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {summaryQuery.isLoading
              ? [1, 2, 3].map((i) => <SummaryCardSkeleton key={i} />)
              : summaryCards.map((item, i) => (
                  <Card
                    key={i}
                    className="h-full p-5 transition-all hover:shadow-md"
                  >
                    <CardContent className="flex items-center justify-between p-0">
                      <div className="flex flex-col justify-between">
                        <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                          <item.Icon className="text-muted-foreground h-4 w-4" />
                          Horas ({item.label})
                        </h3>
                        <div className="mt-3">
                          <span className="text-foreground text-2xl font-bold">
                            {formatHoursMinutes(item.horas)}
                          </span>
                          <p className="text-muted-foreground text-xs">
                            Meta: {item.meta.toFixed(1)}h (mín.{' '}
                            {item.min.toFixed(1)}h)
                          </p>
                        </div>
                      </div>

                      {/*
                       * CRITICAL FIX: These progress ring PieCharts use plain Recharts PieChart
                       * WITHOUT ChartTooltip — therefore they do NOT need a <ChartContainer>.
                       * ChartContainer is only required when using Shadcn's <ChartTooltip> inside.
                       */}
                      <div className="relative flex h-16 w-16 items-center justify-center">
                        <PieChart width={64} height={64}>
                          <Pie
                            data={[
                              { name: 'Progresso', value: item.porcentagem },
                              {
                                name: 'Restante',
                                value: Math.max(0, 100 - item.porcentagem),
                              },
                            ]}
                            dataKey="value"
                            innerRadius={22}
                            outerRadius={28}
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                          >
                            <Cell fill={item.cor} />
                            <Cell fill="var(--muted)" />
                          </Pie>
                        </PieChart>

                        <span
                          className="absolute text-xs font-semibold"
                          style={{ color: item.cor }}
                        >
                          {item.porcentagem.toFixed(0)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </div>

        {/* --- 2. SEÇÃO "BENTO GRID" --- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
          {/* --- LINHA 1: CABEÇALHO E SELETOR DE DATA --- */}
          <div className="lg:col-span-6">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Análise de Período
                </h2>
                <p className="text-muted-foreground text-sm">
                  Métricas que refletem seu esforço e constância.
                </p>
              </div>
              <DatePickerWithRange
                date={date}
                setDate={setDate}
                className="ml-auto"
              />
            </div>
          </div>

          {/* --- LINHA 2: CARDS DE PERÍODO --- */}
          {periodSummaryQuery.isLoading
            ? [
                { span: 'lg:col-span-2' },
                { span: 'lg:col-span-1' },
                { span: 'lg:col-span-1' },
                { span: 'lg:col-span-2' },
              ].map((item, i) => (
                <div key={i} className={item.span}>
                  <PeriodCardSkeleton />
                </div>
              ))
            : periodCards.map((card, i) => (
                <div
                  key={i}
                  className={
                    i === 0 || i === 3 ? 'lg:col-span-2' : 'lg:col-span-1'
                  }
                >
                  <Card className="flex h-full items-center justify-between p-5 transition-all hover:shadow-md">
                    <CardContent className="flex w-full items-center justify-between p-0">
                      <div>
                        <h3 className="text-foreground/90 flex items-center gap-2 text-sm font-semibold tracking-tight">
                          <card.Icon className="text-muted-foreground h-4 w-4" />
                          {card.title}
                        </h3>
                        <div className="mt-3">
                          <span className="text-2xl leading-none font-bold">
                            {card.value}
                          </span>
                          <p className="text-muted-foreground mt-1 text-xs tracking-tight">
                            {card.delta}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}

          {/* --- INTELIGÊNCIA DE ESFORÇO --- */}
          <div className="lg:col-span-6">
            <div className="mt-2 space-y-2">
              <h2 className="text-lg font-bold tracking-tight">
                Inteligência de Esforço
              </h2>
              <p className="text-muted-foreground text-sm">
                Insights sobre foco e qualidade do trabalho.
              </p>
              {enhancedAnalyticsQuery.isLoading ? (
                <div className="grid gap-4 md:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="p-5">
                      <Skeleton className="h-16 w-full" />
                    </Card>
                  ))}
                </div>
              ) : (
                <EffortIntelligenceSection
                  data={
                    enhancedAnalyticsQuery.data?.effort ?? {
                      deepWorkHours: 0,
                      deepWorkPercent: 0,
                      contextSwitches: 0,
                      focusScore: 0,
                      consistencyData: [],
                    }
                  }
                />
              )}
            </div>
          </div>

          {/* --- LINHA 3: TIMELINE (4) + DISTRIBUIÇÃO (2) --- */}
          <div className="lg:col-span-4">
            {timelineQuery.isLoading ? (
              <ChartCardSkeleton className="h-[250px]" />
            ) : (
              timelineQuery.data && (
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Timeline de Horas</CardTitle>
                    <CardDescription>
                      Horas apontadas no período de
                      {date?.from ? ` ${format(date.from, 'dd/MM/yy')}` : ''} a
                      {date?.to ? ` ${format(date.to, 'dd/MM/yy')}` : ''}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pl-2">
                    <ChartContainer
                      config={{
                        dailyHours: { label: 'Horas', color: 'var(--primary)' },
                      }}
                      className="h-[250px] w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        {(() => {
                          const today = startOfToday()
                          const adjustedData =
                            timelineQuery.data.timelineData.map((item) => {
                              const itemDate = parseISO(item.date)
                              if (isAfter(itemDate, today))
                                return { ...item, dailyHours: null }
                              return item
                            })

                          return (
                            <LineChart
                              data={adjustedData}
                              style={{ cursor: 'pointer' }}
                              onClick={(data) => {
                                if (
                                  data?.activePayload &&
                                  data.activePayload.length > 0
                                ) {
                                  const clickedDate = (
                                    data.activePayload[0].payload as {
                                      date: string
                                    }
                                  ).date
                                  navigate(
                                    `/workspaces/${workspace?.id}/time-entries?from=${clickedDate}&to=${clickedDate}`,
                                  )
                                }
                              }}
                              margin={{
                                top: 5,
                                right: 20,
                                left: 0,
                                bottom: 20,
                              }}
                              className="cursor-pointer"
                            >
                              <CartesianGrid vertical={false} />
                              <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                height={50}
                                interval="preserveStartEnd"
                                tickFormatter={(value: string) => {
                                  const d = parseISO(value)
                                  return isValid(d) ? format(d, 'dd/MM') : value
                                }}
                              />
                              <YAxis
                                tickFormatter={(value: number) =>
                                  `${value.toFixed(1)}h`
                                }
                                width={40}
                                domain={[0, yAxisMax]}
                                ticks={yAxisTicks}
                              />
                              <ChartTooltip
                                cursor={false}
                                content={
                                  <ChartTooltipContent
                                    indicator="dot"
                                    formatter={(value) => {
                                      const hours = Number(value)
                                      return `${hours.toFixed(1)}h (${formatHours(hours)})`
                                    }}
                                    labelFormatter={(label) => {
                                      const d = parseISO(label)
                                      return isValid(d)
                                        ? format(d, 'EEEE, dd/MM', {
                                            locale: ptBR,
                                          })
                                        : label
                                    }}
                                  />
                                }
                              />
                              <ReferenceLine
                                y={chartSettings.hoursGoal}
                                label={{
                                  value: `Meta ${chartSettings.hoursGoal}h`,
                                  position: 'insideTopRight',
                                  fill: 'orange',
                                  fontSize: 12,
                                }}
                                stroke="orange"
                                strokeDasharray="3 3"
                              />
                              <ReferenceLine
                                y={acceptableHours}
                                label={{
                                  value: `Aceitável ${acceptableHours.toFixed(1)}h`,
                                  position: 'insideTopRight',
                                  fill: 'var(--muted-foreground)',
                                  fontSize: 12,
                                  dy: 20,
                                }}
                                stroke="var(--muted-foreground)"
                                strokeDasharray="4 4"
                              />
                              <Line
                                type="monotone"
                                dataKey="dailyHours"
                                stroke="var(--color-dailyHours)"
                                strokeWidth={2}
                                dot={{
                                  r: 4,
                                  strokeWidth: 2,
                                  fill: 'var(--primary)',
                                  stroke: 'var(--background)',
                                }}
                                connectNulls={false}
                              />
                            </LineChart>
                          )
                        })()}
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          <div className="lg:col-span-2">
            {activityQuery.isLoading ? (
              <PieChartSkeleton />
            ) : (
              activityQuery.data && (
                <Card className="flex h-full flex-col">
                  <CardHeader className="items-center pb-0">
                    <CardTitle>Distribuição por Atividade</CardTitle>
                    <CardDescription>
                      <div className="flex items-center gap-2 leading-none font-medium">
                        Top 5 atividades com mais horas no período
                      </div>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-1 items-center justify-center overflow-visible p-6">
                    <div className="flex h-[300px] w-full items-center justify-center overflow-visible">
                      {/*
                       * CRITICAL FIX: The PieChart here uses a custom tooltip rendered inline
                       * (not ChartTooltipContent from Shadcn), so it does NOT need ChartContainer.
                       * Only Shadcn's <ChartTooltip> / <ChartTooltipContent> require the context.
                       */}
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart
                          margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
                        >
                          <ChartTooltip
                            cursor={false}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null

                              const item = payload[0]?.payload as {
                                activity: string
                                hours: number
                                fill: string
                              }

                              const value = Number(payload[0]?.value ?? 0)
                              const total = (activityQuery.data ?? []).reduce(
                                (sum, p) => sum + (p.hours ?? 0),
                                0,
                              )
                              const percent = total
                                ? ((value / total) * 100).toFixed(1)
                                : '0.0'

                              return (
                                <div className="bg-popover rounded-md p-2 text-sm shadow-md">
                                  <div className="flex items-center gap-2 font-medium">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: item.fill }}
                                    />
                                    {item.activity}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {value.toFixed(1)}h ({percent}%)
                                  </div>
                                </div>
                              )
                            }}
                          />

                          <Pie
                            data={activityQuery.data}
                            dataKey="hours"
                            nameKey="activity"
                            innerRadius="40%"
                            outerRadius="80%"
                            stroke="none"
                            labelLine={false}
                            label={({
                              cx,
                              cy,
                              midAngle,
                              outerRadius,
                              index,
                            }) => {
                              const entry = (activityQuery.data ?? [])[index]
                              if (!entry) return null
                              const RADIAN = Math.PI / 180
                              const radius = (outerRadius as number) + 10
                              const x =
                                (cx as number) +
                                radius * Math.cos(-midAngle * RADIAN)
                              const y =
                                (cy as number) +
                                radius * Math.sin(-midAngle * RADIAN)

                              const value = entry.hours
                              const total = (activityQuery.data ?? []).reduce(
                                (sum, p) => sum + (p.hours ?? 0),
                                0,
                              )
                              const percent = total
                                ? ((value / total) * 100).toFixed(1)
                                : '0.0'

                              return (
                                <text
                                  x={x}
                                  y={y}
                                  textAnchor={
                                    x > (cx as number) ? 'start' : 'end'
                                  }
                                  dominantBaseline="central"
                                  fontSize={12}
                                  fill="var(--foreground)"
                                >
                                  <tspan style={{ fill: entry.fill }}>● </tspan>
                                  {entry.activity} {value.toFixed(1)}h (
                                  {percent}%)
                                </text>
                              )
                            }}
                          >
                            {(activityQuery.data ?? []).map((entry, index) => (
                              <Cell
                                key={index}
                                fill={entry.fill}
                                stroke={entry.fill}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          <div className="lg:col-span-3">
            {avgHoursQuery.isLoading ? (
              <ChartCardSkeleton className="h-[430px]" />
            ) : (
              avgHoursQuery.data && (
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BarChartHorizontal className="h-5 w-5" />
                      <CardTitle>Média de Horas por Dia da Semana</CardTitle>
                    </div>
                    <CardDescription>
                      Qual dia da semana você é mais produtivo?
                    </CardDescription>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
                      {WEEK_DAYS_CONFIG.map(({ id, label }) => (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`day-${id}`}
                            checked={selectedDays[label]}
                            onCheckedChange={() => handleDayToggle(label)}
                          />
                          <Label
                            htmlFor={`day-${id}`}
                            className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 text-center">
                      <p className="text-muted-foreground text-sm">
                        Média geral (dias selecionados)
                      </p>
                      <p className="text-2xl font-bold">
                        {formatHours(avgHoursAnalysis.overallAverage)}
                      </p>
                    </div>
                    <ChartContainer
                      config={avgHoursChartConfig}
                      className="h-[300px] w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={avgHoursAnalysis.chartData}
                          margin={{ left: -20 }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="day"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tickFormatter={(value: number) => `${value}h`}
                          />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent />}
                          />
                          <Bar
                            dataKey="averageHours"
                            fill="var(--color-averageHours)"
                            radius={4}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          <div className="lg:col-span-3">
            {timelineQuery.isLoading ? (
              <ChartCardSkeleton className="h-[430px]" />
            ) : (
              timelineQuery.data && (
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlarmClockOff className="h-5 w-5" />
                      <CardTitle>Análise de Horas Extras</CardTitle>
                    </div>
                    <CardDescription>
                      Você teve
                      <span className="text-primary font-bold">
                        {' '}
                        {timelineQuery.data.overtimeData.daysWithOvertime}{' '}
                      </span>
                      dia(s) com horas extras no período.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={overtimeChartConfig}
                      className="h-[300px] w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={timelineQuery.data.overtimeData.chartData}
                          margin={{ left: -20, right: 10 }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="day"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tickFormatter={(value: number) =>
                              `${value.toFixed(1)}h`
                            }
                          />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                formatter={(value) =>
                                  formatHours(Number(value))
                                }
                              />
                            }
                          />
                          <Line
                            type="stepAfter"
                            dataKey="overtimeHours"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          {/* LINHA 5: Análise de Foco + Distribuição de Sessões / Insights */}
          <div className="lg:col-span-3">
            {enhancedAnalyticsQuery.isLoading ? (
              <ChartCardSkeleton className="h-[240px]" />
            ) : (
              <FocusAnalysisSection
                data={enhancedAnalyticsQuery.data?.focusAnalysis ?? []}
              />
            )}
          </div>
          <div className="space-y-4 lg:col-span-3">
            {enhancedAnalyticsQuery.isLoading ? (
              <>
                <ChartCardSkeleton className="h-[200px]" />
                <Card className="p-5">
                  <Skeleton className="h-24 w-full" />
                </Card>
              </>
            ) : (
              <>
                <SessionDistributionSection
                  data={
                    enhancedAnalyticsQuery.data?.sessionDistribution ?? [
                      { range: '0-15min', count: 0 },
                      { range: '15-30min', count: 0 },
                      { range: '30-60min', count: 0 },
                      { range: '1-2h', count: 0 },
                      { range: '2h+', count: 0 },
                    ]
                  }
                />
                <AutomatedInsightsSection
                  insights={enhancedAnalyticsQuery.data?.insights ?? []}
                />
              </>
            )}
          </div>

          {/* --- LINHA 6: PERFORMANCE POR TAREFA --- */}
          <div className="lg:col-span-6">
            {enhancedAnalyticsQuery.isLoading ? (
              <ChartCardSkeleton className="h-[200px]" />
            ) : (
              <TaskPerformanceSection
                data={enhancedAnalyticsQuery.data?.taskPerformance ?? []}
              />
            )}
          </div>

          {/* --- LINHA FINAL: HEATMAP (4) + QUALIDADE (2) --- */}
          <div className="lg:col-span-4">
            {heatmapQuery.isLoading ? (
              <HeatmapSkeleton />
            ) : (
              heatmapQuery.data && (
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Grid className="h-5 w-5" />
                      <CardTitle>Mapa de Calor de Produtividade</CardTitle>
                    </div>
                    <CardDescription>
                      Seus horários de pico de trabalho no período selecionado.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Dia</TableHead>
                          {Array.from({ length: 24 }, (_, i) => i).map(
                            (hour) => (
                              <TableHead
                                key={hour}
                                className="p-1 text-center text-xs"
                              >
                                {`${String(hour).padStart(2, '0')}h`}
                              </TableHead>
                            ),
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {heatmapDayMapping.map(({ key, display }) => (
                          <TableRow key={key}>
                            <TableCell className="font-medium">
                              {display}
                            </TableCell>
                            {Array.from({ length: 24 }, (_, i) => {
                              const hourStr = String(i).padStart(2, '0')
                              const hoursValue = (
                                heatmapQuery.data as Record<
                                  string,
                                  Record<string, number>
                                >
                              )[key]?.[hourStr]
                              return (
                                <TableCell
                                  key={`${key}-${i}`}
                                  className="p-0 text-center"
                                >
                                  <div
                                    className="m-0.5 h-8 rounded-md"
                                    style={getHeatmapStyle(hoursValue)}
                                    title={
                                      hoursValue
                                        ? `${formatHours(hoursValue)} em ${display} às ${hourStr}h`
                                        : 'Nenhuma atividade'
                                    }
                                  />
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          <div className="lg:col-span-2">
            {qualityQuery.isLoading ? (
              <QualityCardSkeleton />
            ) : (
              qualityQuery.data && (
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Qualidade e Hábitos de Apontamento</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <CalendarClock className="h-5 w-5 text-amber-500" />
                        <span className="ml-3 font-medium">
                          Dias Úteis Esquecidos
                        </span>
                      </div>
                      <Badge
                        variant={
                          qualityQuery.data.quality.forgottenDays > 0
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {qualityQuery.data.quality.forgottenDays} dia(s)
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <MessageSquareWarning className="h-5 w-5 text-amber-500" />
                        <span className="ml-3 font-medium">
                          Apontamentos sem Comentários
                        </span>
                      </div>
                      <div className="w-32 text-right">
                        <span className="font-bold">
                          {qualityQuery.data.quality.noCommentPercent.toFixed(
                            0,
                          )}
                          %
                        </span>
                        <Progress
                          value={qualityQuery.data.quality.noCommentPercent}
                          className="mt-1 h-2"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Clock4 className="h-5 w-5 text-amber-500" />
                        <span className="ml-3 font-medium">
                          Pontualidade dos Apontamentos
                        </span>
                      </div>
                      <div className="w-40">
                        {/*
                         * CRITICAL FIX: ChartTooltip from Shadcn is used here inside
                         * RechartsPieChart. This REQUIRES a <ChartContainer> wrapper.
                         * Without it the useChart() hook inside ChartTooltipContent
                         * throws "useChart must be used within a <ChartContainer />".
                         */}
                        <ChartContainer
                          config={punctualityChartConfig}
                          className="h-[100px] w-full"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart accessibilityLayer>
                              <ChartTooltip
                                cursor={false}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const total =
                                      qualityQuery.data.punctualityData.reduce(
                                        (acc, curr) => acc + curr.value,
                                        0,
                                      )
                                    const data = payload[0]
                                    const percentage =
                                      total > 0
                                        ? ((data.payload.value as number) /
                                            total) *
                                          100
                                        : 0
                                    return (
                                      <div className="bg-background min-w-[12rem] rounded-lg border p-2 text-sm shadow-sm">
                                        <div className="flex items-center gap-2 font-medium">
                                          <div
                                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                            style={{
                                              backgroundColor: data.payload
                                                .fill as string,
                                            }}
                                          />
                                          {data.name}
                                        </div>
                                        <div className="text-muted-foreground flex justify-between">
                                          <span>
                                            Contagem:{' '}
                                            {data.payload.value as number}
                                          </span>
                                          <span>{percentage.toFixed(0)}%</span>
                                        </div>
                                      </div>
                                    )
                                  }
                                  return null
                                }}
                              />
                              <Pie
                                data={qualityQuery.data.punctualityData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={30}
                                outerRadius={40}
                                strokeWidth={2}
                              >
                                {qualityQuery.data.punctualityData.map(
                                  (entry) => (
                                    <Cell
                                      key={`cell-${entry.name}`}
                                      fill={entry.fill}
                                    />
                                  ),
                                )}
                              </Pie>
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </div>
      </div>
    </>
  )
}
