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
