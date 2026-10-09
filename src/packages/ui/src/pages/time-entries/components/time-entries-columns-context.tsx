import { createContext, useContext } from 'react'

import type { CreateColumnsOptions } from './time-entries-table-columns'
const TimeEntriesColumnsContext = createContext<CreateColumnsOptions | null>(
  null,
)
export const TimeEntriesColumnsProvider = TimeEntriesColumnsContext.Provider
export function useTimeEntriesColumnsOptions(): CreateColumnsOptions {
  const options = useContext(TimeEntriesColumnsContext)
  if (!options) throw new Error('TIME_ENTRIES_COLUMNS_PROVIDER_MISSING')
  return options
}
