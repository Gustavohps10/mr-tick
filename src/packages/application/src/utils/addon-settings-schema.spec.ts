import { describe, expect, it } from 'vitest'

import type {
  AddonSettingsField,
  AddonSettingsTab,
} from '../contracts/host/IHostBridge'
import {
  flattenSettingsFields,
  hasUnclassifiedPassword,
  isFlatSettingsFieldList,
} from './addon-settings-schema'

describe('addon-settings-schema', () => {
  it('correctly identifies flat settings field lists vs tabbed schema', () => {
    const flatFields: AddonSettingsField[] = [
      { id: 'apiKey', label: 'API Key', type: 'password', scope: 'credential' },
    ]
    expect(isFlatSettingsFieldList(flatFields)).toBe(true)

    const tabbedSchema: AddonSettingsTab[] = [
      {
        id: 'general',
        label: 'General',
        fields: [
          {
            id: 'serverUrl',
            label: 'URL',
            type: 'text',
            scope: 'configuration',
          },
        ],
      },
    ]
    expect(isFlatSettingsFieldList(tabbedSchema)).toBe(false)
  })

  it('flattens fields from tabs and groups', () => {
    const tabbedSchema: AddonSettingsTab[] = [
      {
        id: 'tab1',
        label: 'Tab 1',
        fields: [{ id: 'field1', label: 'Field 1', type: 'text' }],
        groups: [
          {
            id: 'group1',
            label: 'Group 1',
            fields: [
              {
                id: 'field2',
                label: 'Field 2',
                type: 'password',
                scope: 'credential',
              },
            ],
          },
        ],
      },
    ]
    const flattened = flattenSettingsFields(tabbedSchema)
    expect(flattened).toHaveLength(2)
    expect(flattened[0]?.id).toBe('field1')
    expect(flattened[1]?.id).toBe('field2')
  })

  it('detects unclassified passwords', () => {
    const validFields: AddonSettingsField[] = [
      { id: 'token', label: 'Token', type: 'password', scope: 'credential' },
      { id: 'url', label: 'URL', type: 'text' },
    ]
    expect(hasUnclassifiedPassword(validFields)).toBe(false)

    const invalidFields: AddonSettingsField[] = [
      { id: 'secret', label: 'Secret', type: 'password' },
    ]
    expect(hasUnclassifiedPassword(invalidFields)).toBe(true)
  })
})
