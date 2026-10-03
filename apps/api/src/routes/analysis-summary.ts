import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@codeorbit/domain';
import { authenticate } from '../middleware/authenticate.js';
import { requireWorkspace } from '../middleware/workspace-scope.js';
import type { AnalysisSummaryService } from '../services/analysis-summary-service.js';

type AuthenticateHook = (request: FastifyRequest) => Promise<void>;

export async function registerAnalysisSummaryRoutes(
  app: FastifyInstance,
  summaryService: Pick<AnalysisSummaryService, 'get'>,
  authenticateRequest: AuthenticateHook = authenticate,
): Promise<void> {
  app.get<{ Params: { runId: string } }>(
    '/api/v1/analysis-runs/:runId/summary',
    { preHandler: authenticateRequest },
    async (request) => {
      if (!request.principal) throw new UnauthorizedError();
      return summaryService.get(requireWorkspace(request), request.params.runId);
    },
  );
}
