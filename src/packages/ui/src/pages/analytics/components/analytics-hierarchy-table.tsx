import type {
  AnalyticsDatasetCellValue,
  AnalyticsDatasetRow,
  AnalyticsQueryResult,
} from '@mr-tick/application'
import { Fragment, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Branch {
  key: string
  path: AnalyticsDatasetCellValue[]
  row?: AnalyticsDatasetRow
  children: Branch[]
}

/** Builds only the visual hierarchy. Every subtotal comes from native GROUP BY ROLLUP. */

export function AnalyticsHierarchyTable({
  data,
  hierarchy,
}: {
  data: AnalyticsQueryResult
  hierarchy: string[]
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const root: Branch = { key: '[]', path: [], children: [] }
  const branches = new Map<string, Branch>([[root.key, root]])
  const metrics = data.columns.filter(
    (column) =>
      column.type === 'number' &&
      column.name !== data.groupingColumn &&
      !hierarchy.includes(column.name),
  )

  for (const row of data.rows) {
    const markerName = data.groupingColumn
    if (markerName === undefined) continue
    const marker = row[markerName]
    if (typeof marker !== 'number') continue
    const rolled = marker.toString(2).split('1').length - 1
    const depth = hierarchy.length - rolled
    let parent = root
    const path: AnalyticsDatasetCellValue[] = []

    for (const column of hierarchy.slice(0, depth)) {
      const value = row[column]
      if (value === undefined) continue
      path.push(value)
      const key = JSON.stringify(path)
      let branch = branches.get(key)

      if (branch === undefined) {
        branch = { key, path: [...path], children: [] }
        branches.set(key, branch)
        parent.children.push(branch)
      }

      parent = branch
    }

    parent.row = row
  }

  const renderBranch = (branch: Branch) => {
    const label = branch.path.find(
      (value, index) => index === branch.path.length - 1,
    )
    const nested = branch.children.length > 0
    let title = 'Total'
    if (branch.path.length > 0) title = String(label)
    return (
      <Fragment key={branch.key}>
        <TableRow>
          <TableCell style={{ paddingLeft: 12 + branch.path.length * 16 }}>
            {nested && (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={!collapsed.has(branch.key)}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous)

                    if (next.has(branch.key)) {
                      next.delete(branch.key)
                      return next
                    }

                    next.add(branch.key)
                    return next
                  })
                }
              >
                {collapsed.has(branch.key) ? '+' : '−'}
              </Button>
            )}
            {title}
          </TableCell>
          {metrics.map((column) => (
            <TableCell key={column.name}>
              {branch.row === undefined ? '—' : String(branch.row[column.name])}
            </TableCell>
          ))}
        </TableRow>
        {!collapsed.has(branch.key) && branch.children.map(renderBranch)}
      </Fragment>
    )
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{hierarchy.join(' › ')}</TableHead>
            {metrics.map((column) => (
              <TableHead key={column.name}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {root.row !== undefined && renderBranch(root)}
          {root.row === undefined && root.children.map(renderBranch)}
        </TableBody>
      </Table>
    </div>
  )
}
