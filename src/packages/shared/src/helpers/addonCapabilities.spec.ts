import { describe, expect, it } from 'vitest'

import {
  hasCapability,
  isAddonCapability,
  isAnalytics,
  isDataSource,
  isTheme,
  isWatcher,
} from './addonCapabilities'

describe('canonical addon capabilities', () => {
  it('uses exact capability names and rejects aliases and custom labels', () => {
    expect(isAddonCapability('watcher')).toBe(true)
    expect(isAddonCapability('Watcher')).toBe(false)
    expect(isAddonCapability('auth')).toBe(true)
    expect(isAddonCapability('analytics')).toBe(true)
    expect(isAddonCapability('custom')).toBe(false)
  })
  it('selects declared capabilities independently', () => {
    expect(isAnalytics(['auth', 'analytics'])).toBe(true)
    expect(isDataSource(['auth', 'analytics'])).toBe(false)
    expect(isAnalytics(['dataSource'])).toBe(false)
    expect(isDataSource(['watcher'])).toBe(false)
    expect(isDataSource(['theme', 'dataSource'])).toBe(true)
    expect(isWatcher(['watcher', 'theme'])).toBe(true)
    expect(isTheme(['watcher', 'theme'])).toBe(true)
    expect(hasCapability(['calendar', 'punch'], 'punch')).toBe(true)
  })
  it('treats missing metadata as absence of capabilities', () => {
    expect(isDataSource(undefined)).toBe(false)
    expect(isDataSource(null)).toBe(false)
    expect(isDataSource([])).toBe(false)
  })
})
