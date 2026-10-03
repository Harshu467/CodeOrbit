import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BadRequestError, UnauthorizedError } from '@codeorbit/domain';
import type { StartAnalysisRequest } from '@codeorbit/api-contracts';
import { startAnalysisRequestSchema } from '@codeorbit/api-contracts';
import { authenticate } from '../middleware/authenticate.js';
import { requireWorkspace } from '../middleware/workspace-scope.js';
import type { AnalysisRunServicePort } from '../services/analysis-run-service.js';

type AuthenticateHook = (request: FastifyRequest) => Promise<void>;

export async function registerAnalysisRunRoutes(
  app: FastifyInstance,
  analysisRunService: AnalysisRunServicePort,
  authenticateRequest: AuthenticateHook = authenticate,
): Promise<void> {
  app.post<{ Params: { repositoryId: string }; Body: StartAnalysisRequest }>(
    '/api/v1/repositories/:repositoryId/analysis-runs',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const parsed = startAnalysisRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError();
      const principal = request.principal;
      if (!principal) throw new UnauthorizedError();
      const result = await analysisRunService.start(
        requireWorkspace(request),
        principal.userId,
        request.params.repositoryId,
        parsed.data,
        idempotencyKey(request),
      );
      return reply
        .header('Location', `/api/v1/analysis-runs/${result.run.id}`)
        .code(202)
        .send({ ...result.run, reused: result.reused });
    },
  );

  app.get<{ Params: { runId: string } }>(
    '/api/v1/analysis-runs/:runId',
    { preHandler: authenticateRequest },
    async (request) =>
      analysisRunService.get(requireWorkspace(request), request.params.runId),
  );
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
    throw new BadRequestError();
  }
  return value;
}
