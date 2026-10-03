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

export type CreateRepositoryRequest = z.infer<typeof createRepositoryRequestSchema>;
export type StartAnalysisRequest = z.infer<typeof startAnalysisRequestSchema>;

export type { components, operations, paths } from './openapi.js';
