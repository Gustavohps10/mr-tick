import type {
  AnalyticsColumnSchema,
  AnalyticsDatasetRow,
} from '@mr-tick/application'

export interface EtlTablePayload {
  columns: AnalyticsColumnSchema[]
  rows: AnalyticsDatasetRow[]
  rawCsvSample?: string
}

export function readCellAsString(
  row: AnalyticsDatasetRow,
  key: string,
  emptyText: string,
): string {
  const value = row[key]
  if (value === null || value === undefined) return emptyText
  return String(value)
}
