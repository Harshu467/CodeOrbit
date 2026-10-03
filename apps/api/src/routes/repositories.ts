import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BadRequestError, UnauthorizedError } from '@codeorbit/domain';
import type { CreateRepositoryRequest } from '@codeorbit/api-contracts';
import { createRepositoryRequestSchema } from '@codeorbit/api-contracts';
import { authenticate } from '../middleware/authenticate.js';
import { requireWorkspace } from '../middleware/workspace-scope.js';
import type { RepositoryServicePort } from '../services/repository-service.js';

type AuthenticateHook = (request: FastifyRequest) => Promise<void>;

export async function registerRepositoryRoutes(
  app: FastifyInstance,
  repositoryService: RepositoryServicePort,
  authenticateRequest: AuthenticateHook = authenticate,
): Promise<void> {
  app.post<{ Body: CreateRepositoryRequest }>(
    '/api/v1/repositories',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const parsed = createRepositoryRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError();
      const principal = request.principal;
      if (!principal) throw new UnauthorizedError();
      const resource = await repositoryService.connect(
        requireWorkspace(request),
        principal.userId,
        parsed.data.source.uri,
        parsed.data.displayName,
      );
      return reply.code(201).send(resource);
    },
  );

  app.get(
    '/api/v1/repositories',
    { preHandler: authenticateRequest },
    async (request) => ({
      items: await repositoryService.list(requireWorkspace(request)),
    }),
  );

  app.get<{ Params: { repositoryId: string } }>(
    '/api/v1/repositories/:repositoryId',
    { preHandler: authenticateRequest },
    async (request) =>
      repositoryService.get(requireWorkspace(request), request.params.repositoryId),
  );
}
