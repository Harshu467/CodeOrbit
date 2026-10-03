import { z } from 'zod';

export const createRepositoryRequestSchema = z.object({
  source: z.object({
    provider: z.literal('github'),
    uri: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          url.hostname === 'github.com' &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname.split('/').filter(Boolean).length === 2
        );
      }),
  }),
  displayName: z.string().trim().min(1).max(200).optional(),
});

export const startAnalysisRequestSchema = z
  .object({
    revision: z.string().min(1).optional(),
    createDistinctRun: z.boolean().default(false),
  })
  .default({});
export const analysisSummarySchema = z.object({
  runId: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'partial', 'failed']),
  counts: z.object({
    files: z.number().int().nonnegative(),
    projects: z.number().int().nonnegative(),
    symbols: z.number().int().nonnegative(),
    apis: z.number().int().nonnegative(),
    tests: z.number().int().nonnegative(),
    dependencies: z.number().int().nonnegative(),
    relationships: z.number().int().nonnegative(),
    unresolvedRelationships: z.number().int().nonnegative(),
  }),
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      stage: z.string().optional(),
      path: z.string().optional(),
    }),
  ),
});

export type CreateRepositoryRequest = z.infer<typeof createRepositoryRequestSchema>;
export type StartAnalysisRequest = z.infer<typeof startAnalysisRequestSchema>;
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export type { components, operations, paths } from './openapi.js';
