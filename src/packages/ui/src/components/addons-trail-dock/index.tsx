import React from 'react'

import { useAddonLoadFailures } from '@/hooks/use-addon-load-failures'

import { AddonsTrailBar } from './AddonsTrailBar'

export function AddonsTrailDock() {
  const { failures, isError, errorMessage } = useAddonLoadFailures()

  return (
    <AddonsTrailBar
      failures={failures}
      isFailureServiceError={isError}
      failureServiceErrorMessage={errorMessage}
    />
  )
}

export * from './addon-settings-dialog-host'
export * from './AddonsDiagnosticsDrawer'
export * from './AddonsTrailBar'
export * from './resolve-trail-status'
