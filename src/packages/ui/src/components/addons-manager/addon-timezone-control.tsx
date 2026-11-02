import type {
  AddonSettingsSelectField,
  AddonSettingsTimezoneField,
} from '@mr-tick/application'
import { useMemo } from 'react'

import {
  AddonDynamicSelectControl,
  type AddonDynamicSelectControlProps,
} from './addon-dynamic-select-control'

type AddonTimezoneControlProps = Omit<
  AddonDynamicSelectControlProps,
  'field'
> & {
  field: AddonSettingsTimezoneField
}

function timezoneLabel(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    timeZoneName: 'long',
  }).formatToParts(new Date())
  const name = parts.find((part) => part.type === 'timeZoneName')
  const location = timeZone.replace(/_/g, ' ').replace(/\//g, ' / ')
  if (name === undefined) return location
  return `${location} — ${name.value}`
}

export function AddonTimezoneControl({
  field,
  ...props
}: AddonTimezoneControlProps) {
  const selectField = useMemo((): AddonSettingsSelectField => {
    const zones = new Set(Intl.supportedValuesOf('timeZone'))
    zones.add('UTC')
    zones.add(Intl.DateTimeFormat().resolvedOptions().timeZone)

    return {
      ...field,
      type: 'select',
      source: {
        kind: 'static',
        options: Array.from(zones, (value) => ({
          value,
          label: timezoneLabel(value),
        })),
      },
    }
  }, [field])

  return <AddonDynamicSelectControl {...props} field={selectField} />
}
