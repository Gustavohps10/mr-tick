'use client'

import type { ConfiguredFieldMapping } from '@mr-tick/sdk'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

export interface ResolvedEntityMapping {
  icon?: string
  color?: string
  badgeColor?: string
  backgroundColor?: string
  textColor?: string
}

export function getFieldMappingsStorageKey(targetId?: string): string {
  if (!targetId || targetId.trim() === '') return 'metric_mappings_default'
  return `metric_mappings_${targetId.trim()}`
}

export function getStoredFieldMappings(
  targetId?: string,
): Record<string, ConfiguredFieldMapping> {
  if (typeof window === 'undefined') return {}
  const key = getFieldMappingsStorageKey(targetId)
  const raw = window.localStorage.getItem(key)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    return {}
  }
  return {}
}

export function getAllStoredFieldMappings(): Record<
  string,
  ConfiguredFieldMapping
> {
  if (typeof window === 'undefined') return {}
  const merged: Record<string, ConfiguredFieldMapping> = {}
  const storageLength = window.localStorage.length
  for (let index = 0; index < storageLength; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith('metric_mappings_')) continue
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(merged, parsed)
      }
    } catch {
      // Ignora dados corrompidos
    }
  }
  return merged
}

export function saveStoredFieldMappings(
  targetId: string | undefined,
  mappings: Record<string, ConfiguredFieldMapping>,
): void {
  if (typeof window === 'undefined') return
  const key = getFieldMappingsStorageKey(targetId)
  window.localStorage.setItem(key, JSON.stringify(mappings))
  window.dispatchEvent(
    new CustomEvent('metric-mappings-updated', {
      detail: { targetId, mappings },
    }),
  )
}

export function useFieldMappings(targetId?: string): {
  mappings: Record<string, ConfiguredFieldMapping>
  saveMappings: (newMappings: Record<string, ConfiguredFieldMapping>) => void
} {
  const queryClient = useQueryClient()
  const key = getFieldMappingsStorageKey(targetId)

  useEffect(() => {
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['field-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['task-lookup'] })
      queryClient.invalidateQueries({ queryKey: ['time-entries'] })
    }
    window.addEventListener('metric-mappings-updated', handleUpdate)
    return () => {
      window.removeEventListener('metric-mappings-updated', handleUpdate)
    }
  }, [queryClient])

  const { data: rawMappings = {} } = useQuery<
    Record<string, ConfiguredFieldMapping>
  >({
    queryKey: ['field-mappings', key],
    queryFn: () => {
      const direct = getStoredFieldMappings(targetId)
      if (Object.keys(direct).length > 0) return direct
      return getAllStoredFieldMappings()
    },
    initialData: () => {
      const direct = getStoredFieldMappings(targetId)
      if (Object.keys(direct).length > 0) return direct
      return getAllStoredFieldMappings()
    },
    staleTime: 1000 * 60,
  })

  const saveMappings = (
    newMappings: Record<string, ConfiguredFieldMapping>,
  ) => {
    saveStoredFieldMappings(targetId, newMappings)
    queryClient.setQueryData(['field-mappings', key], newMappings)
    queryClient.invalidateQueries({ queryKey: ['field-mappings'] })
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['task-lookup'] })
    queryClient.invalidateQueries({ queryKey: ['sync-metadata'] })
    queryClient.invalidateQueries({ queryKey: ['time-entries'] })
  }

  const mappings = useMemo(() => rawMappings, [rawMappings])

  return { mappings, saveMappings }
}

function createResolvedMapping(
  configured: ConfiguredFieldMapping,
): ResolvedEntityMapping {
  const hasIcon = configured.icon && configured.icon !== 'none'
  const icon = hasIcon ? configured.icon : undefined
  const hasColor = configured.color && configured.color.trim() !== ''
  const color = hasColor ? configured.color : undefined
  if (!icon && !color) return {}

  let cleanColor = color ? color.trim() : ''
  if (cleanColor.startsWith('#') && cleanColor.length === 9) {
    cleanColor = cleanColor.slice(0, 7)
  }

  // Estilização sólida e mais clara (100% opaca, sem transparência/alpha)
  // para evitar que badges empilhados ou sobrepostos exibam o texto de trás
  const background = cleanColor
    ? `color-mix(in srgb, ${cleanColor} 14%, var(--card, #ffffff))`
    : undefined

  return {
    icon,
    color: cleanColor,
    badgeColor: cleanColor,
    backgroundColor: background,
    textColor: cleanColor,
  }
}

export function resolveEntityMapping(
  item:
    | {
        id?: string
        name?: string
        tracker?: { id: string }
      }
    | undefined
    | null,
  category: 'activity' | 'tracker' | 'status' | 'priority' | 'custom',
  mappings: Record<string, ConfiguredFieldMapping> = {},
): ResolvedEntityMapping {
  if (!item) return {}

  let rawId = ''
  if (item.id) rawId = item.id
  if (!rawId && item.tracker?.id) rawId = item.tracker.id

  let cleanId = rawId
  if (cleanId.includes('::')) {
    const parts = cleanId.split('::')
    if (parts[1]) cleanId = parts[1]
  }

  // 1. Direct ID matches
  if (cleanId) {
    const directMatch = mappings[cleanId]
    if (directMatch) return createResolvedMapping(directMatch)

    const categoryUnderMatch = mappings[`${category}_${cleanId}`]
    if (categoryUnderMatch) return createResolvedMapping(categoryUnderMatch)

    const categoryColonMatch = mappings[`${category}:${cleanId}`]
    if (categoryColonMatch) return createResolvedMapping(categoryColonMatch)

    const categoryDashMatch = mappings[`${category}-${cleanId}`]
    if (categoryDashMatch) return createResolvedMapping(categoryDashMatch)
  }

  // 2. Name matches
  const name = item.name ? item.name.trim() : ''
  if (name) {
    const directNameMatch = mappings[name]
    if (directNameMatch) return createResolvedMapping(directNameMatch)

    const lowerName = name.toLowerCase()

    for (const [key, mapping] of Object.entries(mappings)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey === lowerName) return createResolvedMapping(mapping)
      if (lowerKey === `${category}_${lowerName}`)
        return createResolvedMapping(mapping)
      if (lowerKey === `${category}:${lowerName}`)
        return createResolvedMapping(mapping)
      if (lowerKey === `${category}-${lowerName}`)
        return createResolvedMapping(mapping)
    }
  }

  return {}
}
