import { z } from 'zod'

const filterValue = z.union([
  z.string(),
  z.array(z.string()),
  z.number().finite(),
  z.boolean(),
  z.object({ from: z.string().optional(), to: z.string().optional() }).strict(),
])

const batchSize = z.number().int().min(1).optional()
const cursor = z.string().min(1).optional()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)

/** IPC payloads are untrusted even though renderer callers have TypeScript contracts. */
export const analyticsDatasetQuerySchema = z
  .object({
    datasetId: z.string().min(1),
    projectId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    filters: z.record(z.string(), filterValue).optional(),
    execution: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('snapshot'), cursor, batchSize }).strict(),
        z
          .object({
            kind: z.literal('changes'),
            checkpoint: z.string().min(1),
            cursor,
            batchSize,
          })
          .strict(),
        z
          .object({
            kind: z.literal('aggregate'),
            groupBy: z.array(z.string()),
            measures: z.array(
              z
                .object({
                  name: z.string(),
                  operator: z.enum([
                    'count',
                    'sum',
                    'average',
                    'minimum',
                    'maximum',
                  ]),
                  column: z.string().optional(),
                })
                .strict(),
            ),
            cursor,
          })
          .strict(),
      ])
      .optional(),
  })
  .strict()

export const analyticsRefreshPolicySchema = z
  .object({
    mode: z.enum(['auto', 'fast', 'full']).optional(),
    rollingWindowDays: z.number().int().min(1).max(3650).optional(),
    fullReconcileIntervalMinutes: z
      .number()
      .finite()
      .min(0)
      .max(43200)
      .optional(),
  })
  .strict()

export const analyticsHydrateSchema = z
  .object({
    workspaceId: z.string().min(1),
  })
  .strict()

export const analyticsSaveWorkspaceStateSchema = z
  .object({
    workspaceId: z.string().min(1),
    pollingIntervalMinutes: z.number().int().min(0).max(1440),
    spacesJson: z.string().max(1_000_000).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .strict()

export const analyticsResetStorageSchema = z
  .object({
    workspaceId: z.string().min(1),
  })
  .strict()
