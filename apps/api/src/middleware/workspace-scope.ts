import type { FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '@codeorbit/domain';

export function requireWorkspace(request: FastifyRequest): string {
  const workspaceId = request.principal?.workspaceId;
  if (!workspaceId) throw new UnauthorizedError();
  return workspaceId;
}

export function requireWorkspaceRole(request: FastifyRequest, role: string): string {
  const workspaceId = requireWorkspace(request);
  if (!request.principal?.roles.includes(role)) throw new ForbiddenError();
  return workspaceId;
}
