import type { AnalyticsDatasetRow } from '@mr-tick/application'

export const SHADCN_PALETTE = [
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#6366F1',
  '#F43F5E',
]

const ACTIVITY_COLORS: Record<string, string> = {
  Desenvolvimento: '#3B82F6',
  'Code Review': '#8B5CF6',
  Bugfix: '#EF4444',
  'Testes / QA': '#10B981',
  Documentação: '#F59E0B',
}

const FALLBACK_ACTIVITY_PALETTE = [
  '#3B82F6',
  '#8B5CF6',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
]

export function getActivityColor(activity: string, index: number): string {
  const mapped = ACTIVITY_COLORS[activity]
  if (mapped) return mapped
  const colorIdx = index % FALLBACK_ACTIVITY_PALETTE.length
  const paletteColor = FALLBACK_ACTIVITY_PALETTE[colorIdx]
  if (paletteColor) return paletteColor
  return '#3B82F6'
}

export function getPaletteColor(index: number): string {
  const colorIdx = index % SHADCN_PALETTE.length
  const color = SHADCN_PALETTE[colorIdx]
  if (color) return color
  return '#3B82F6'
}

export function readStringCell(
  row: AnalyticsDatasetRow,
  key: string,
  fallbackValue = '',
): string {
  const val = row[key]
  if (typeof val === 'string' && val.length > 0) return val
  if (typeof val === 'number') return String(val)
  return fallbackValue
}

export function readNumberCell(row: AnalyticsDatasetRow, key: string): number {
  const val = row[key]
  if (typeof val === 'number' && !Number.isNaN(val)) return val

  if (typeof val === 'string') {
    const parsed = Number.parseFloat(val.replace(',', '.'))
    if (!Number.isNaN(parsed)) return parsed
  }

  return 0
}

export function readBooleanCell(
  row: AnalyticsDatasetRow,
  key: string,
): boolean {
  const val = row[key]
  if (typeof val === 'boolean') return val
  if (val === 'true' || val === '1') return true
  return false
}

export function isRowDateWithinBounds(
  rowDate: string,
  startDate: string,
  endDate: string,
): boolean {
  if (!rowDate) return true
  if (startDate && rowDate < startDate) return false
  if (endDate && rowDate > endDate) return false
  return true
}
