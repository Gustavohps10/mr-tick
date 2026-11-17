import type { AnalyticsDatasetRow } from '@mr-tick/application'

import type { AnalyticsTooltipField, WidgetId } from './analytics-types'

export interface TooltipFieldOption {
  id: AnalyticsTooltipField
  label: string
  description: string
}

export function humanizeColumnLabel(raw: string): string {
  const cleaned = raw.trim()
  if (cleaned === '') return ''

  return cleaned
    .split(/[_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getSupportedTooltipFields(
  visual: WidgetId,
  hasSecondaryMetric: boolean,
  hasStack: boolean,
): TooltipFieldOption[] {
  const options: TooltipFieldOption[] = [
    {
      id: 'category',
      label: 'Categoria / Rótulo',
      description: 'Nome do grupo ou item destacado no eixo',
    },
  ]

  const isStackedVisual =
    hasStack ||
    visual === 'bar_stacked' ||
    visual === 'bar_horizontal_stacked' ||
    visual === 'area_stacked'

  if (isStackedVisual) {
    options.push({
      id: 'series',
      label: 'Séries empilhadas',
      description: 'Valor individual de cada série no grupo',
    })
  }

  if (!isStackedVisual) {
    options.push({
      id: 'primary',
      label: 'Métrica principal',
      description: 'Valor da métrica primária configurada',
    })

    if (hasSecondaryMetric && visual !== 'pie_donut') {
      options.push({
        id: 'secondary',
        label: '2ª Métrica',
        description: 'Valor da métrica secundária de comparação',
      })
    }
  }

  options.push({
    id: 'percentage',
    label: 'Percentual (%)',
    description: 'Participação percentual sobre o total do grupo ou gráfico',
  })

  if (isStackedVisual || (hasSecondaryMetric && visual !== 'pie_donut')) {
    options.push({
      id: 'total',
      label: 'Total acumulado',
      description: 'Soma das séries exibidas no ponto/barra',
    })
  }

  return options
}

export function resolveDefaultTooltipFields(
  visual: WidgetId,
  hasSecondaryMetric: boolean,
  hasStack: boolean,
): AnalyticsTooltipField[] {
  const supported = getSupportedTooltipFields(
    visual,
    hasSecondaryMetric,
    hasStack,
  )

  return supported
    .filter((item) => item.id !== 'percentage')
    .map((item) => item.id)
}

export function formatMetricValue(
  value: number,
  isPercentage: boolean,
): string {
  if (!Number.isFinite(value)) return '0'

  if (isPercentage) {
    return `${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`
  }

  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
  })
}

export function transformRowsToPercentage(
  rows: AnalyticsDatasetRow[],
  series: string[],
  stacked: boolean,
): AnalyticsDatasetRow[] {
  if (rows.length === 0 || series.length === 0) return rows

  if (stacked || series.length > 1) {
    return rows.map((row) => {
      let rowSum = 0
      for (const key of series) {
        const val = row[key]
        if (typeof val === 'number' && Number.isFinite(val)) {
          rowSum += Math.abs(val)
        }
      }

      const nextRow: AnalyticsDatasetRow = { ...row }
      for (const key of series) {
        const val = row[key]
        if (typeof val === 'number' && Number.isFinite(val)) {
          let pct = 0
          if (rowSum > 0) pct = Number(((val / rowSum) * 100).toFixed(2))
          nextRow[key] = pct
        }
      }
      return nextRow
    })
  }

  const [singleKey] = series
  if (singleKey === undefined) return rows

  let grandTotal = 0
  for (const row of rows) {
    const val = row[singleKey]
    if (typeof val === 'number' && Number.isFinite(val)) {
      grandTotal += Math.abs(val)
    }
  }

  return rows.map((row) => {
    const val = row[singleKey]
    if (typeof val !== 'number' || !Number.isFinite(val)) return row

    let pct = 0
    if (grandTotal > 0) pct = Number(((val / grandTotal) * 100).toFixed(2))

    return {
      ...row,
      [singleKey]: pct,
    }
  })
}
