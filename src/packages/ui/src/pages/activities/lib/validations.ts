import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  type Parser, // Importa o tipo base
} from 'nuqs' // Importado de 'nuqs' (cliente)

import { flagConfig } from '@/config/flag'
import { getFiltersStateParser, getSortingStateParser } from '@/lib/parsers'
import { SyncTaskRxDBDTO } from '@/local-db/schemas/tasks-sync-schema'
// import { z } from 'zod'

/**
 * 1. MUDANÇA: Em vez de chamar 'createSearchParamsCache' ou 'createParser',
 * nós apenas definimos o OBJETO de parsers que será usado
 * pelo 'parseUrl' (no cliente) ou 'parseServerSide' (no servidor).
 */
export const tasksSearchParamsParsers = {
  filterFlag: parseAsStringEnum(
    flagConfig.featureFlags.map((flag) => flag.value),
  ),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<SyncTaskRxDBDTO>().withDefault([
    { id: 'updatedAt', desc: true },
  ]),
  title: parseAsString.withDefault(''),
  status: parseAsArrayOf(parseAsString).withDefault([]),
  priority: parseAsArrayOf(parseAsString).withDefault([]),
  estimatedHours: parseAsArrayOf(parseAsInteger).withDefault([]),
  createdAt: parseAsArrayOf(parseAsString).withDefault([]),

  // advanced filter
  filters: getFiltersStateParser().withDefault([]),
  joinOperator: parseAsStringEnum(['and', 'or']).withDefault('and'),
}

export function getValidFilters(
  filters: ReturnType<(typeof tasksSearchParamsParsers)['filters']['parse']>,
) {
  return filters
}

type Parsers = typeof tasksSearchParamsParsers
type ParsedValues<T> = {
  [K in keyof T]: T[K] extends Parser<infer V> ? V : never
}

export type GetTasksSchema = ParsedValues<Parsers>

// export const createTaskSchema = z.object({
// ...
// })

// export const updateTaskSchema = z.object({
// ...
// })
