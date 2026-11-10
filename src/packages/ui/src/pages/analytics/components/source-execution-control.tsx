import type {
  AnalyticsAggregateMeasure,
  AnalyticsDatasetManifest,
  AnalyticsExecutionRequest,
} from '@mr-tick/application'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function SourceExecutionControl({
  manifest,
  value,
  onChange,
}: {
  manifest: AnalyticsDatasetManifest | undefined
  value: AnalyticsExecutionRequest | undefined
  onChange: (value: AnalyticsExecutionRequest | undefined) => void
}) {
  const [name, setName] = useState('')
  const [column, setColumn] = useState('')
  const [operator, setOperator] =
    useState<AnalyticsAggregateMeasure['operator']>()
  const descriptor = manifest?.extraction.aggregation
  if (
    descriptor === undefined ||
    !manifest?.extraction.modes.includes('aggregate')
  )
    return null
  let mode = 'snapshot'
  if (value?.kind === 'aggregate') mode = 'aggregate'

  return (
    <div className="space-y-3 rounded-md border p-3">
      <Label>Execução da fonte</Label>
      <Select
        value={mode}
        onValueChange={(next) => {
          if (next === 'snapshot') {
            onChange(undefined)
            return
          }

          onChange({ kind: 'aggregate', groupBy: [], measures: [] })
        }}
      >
        <SelectTrigger aria-label="Execução da fonte">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {manifest.extraction.modes.includes('snapshot') && (
            <SelectItem value="snapshot">Carregar registros</SelectItem>
          )}
          <SelectItem value="aggregate">Agregação remota</SelectItem>
        </SelectContent>
      </Select>
      {value?.kind === 'aggregate' && (
        <>
          <p className="text-muted-foreground text-xs">
            Os totais são calculados pela fonte. Localmente, podem ser filtrados
            e projetados.
          </p>
          <div className="flex flex-wrap gap-3">
            {descriptor.groupByColumns.map((group) => (
              <label key={group} className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={value.groupBy.includes(group)}
                  onChange={(event) => {
                    let groupBy = value.groupBy.filter((item) => item !== group)
                    if (event.target.checked) groupBy = [...groupBy, group]
                    onChange({ ...value, groupBy })
                  }}
                />
                {group}
              </label>
            ))}
          </div>
          <Input
            aria-label="Nome da medida remota"
            placeholder="Nome da medida"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Select
            value={operator}
            onValueChange={(next) =>
              setOperator(descriptor.operators.find((item) => item === next))
            }
          >
            <SelectTrigger aria-label="Operador remoto">
              <SelectValue placeholder="Operador" />
            </SelectTrigger>
            <SelectContent>
              {descriptor.operators.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={column} onValueChange={setColumn}>
            <SelectTrigger aria-label="Coluna da medida remota">
              <SelectValue placeholder="Coluna (opcional para count)" />
            </SelectTrigger>
            <SelectContent>
              {manifest.columns.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={
              operator === undefined ||
              name.trim() === '' ||
              value.measures.some((item) => item.name === name) ||
              (operator !== 'count' && column === '')
            }
            onClick={() => {
              if (operator === undefined) return
              const measure: AnalyticsAggregateMeasure = { name, operator }
              if (column !== '') measure.column = column
              onChange({ ...value, measures: [...value.measures, measure] })
              setName('')
            }}
          >
            Adicionar medida
          </Button>
          {value.measures.map((measure) => (
            <div
              key={measure.name}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>
                {measure.name}: {measure.operator}({measure.column})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    measures: value.measures.filter(
                      (item) => item.name !== measure.name,
                    ),
                  })
                }
              >
                Remover
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
