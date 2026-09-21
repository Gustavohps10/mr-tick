'use client'

import React from 'react'

import { useDataSourceConnections } from '@/contexts/DataSourceConnectionsContext'
import { cn } from '@/lib/utils'

export interface DataSourceLogoProps {
  connectionInstanceId?: string
  dataSourceId?: string
  className?: string
  fallback?: React.ReactNode
}

export function DataSourceLogo({
  connectionInstanceId,
  dataSourceId,
  className,
  fallback = null,
}: DataSourceLogoProps) {
  const { connections } = useDataSourceConnections()

  const matchedConnection = connections.find((conn) => {
    if (connectionInstanceId && conn.connectionId === connectionInstanceId) {
      return true
    }
    if (dataSourceId && conn.dataSourceId === dataSourceId) {
      return true
    }
    return false
  })

  const logoUrl = matchedConnection?.addon?.logo
  const name =
    matchedConnection?.addon?.name ??
    matchedConnection?.dataSourceId ??
    'Fonte de dados'

  if (!logoUrl) {
    return <>{fallback}</>
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      title={name}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
