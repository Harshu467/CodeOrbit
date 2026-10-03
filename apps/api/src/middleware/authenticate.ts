import type { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '@codeorbit/domain';
import type { Principal } from '@codeorbit/domain';
import { parseWorkspaceId } from '@codeorbit/domain';
import { getPool } from '@codeorbit/persistence';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const expectedToken = process.env.API_AUTH_TOKEN;
  const userId = process.env.API_AUTH_USER_ID;
  const authorization = request.headers.authorization;
  const workspaceHeader = request.headers['x-workspace-id'];
  if (
    !expectedToken ||
    !userId ||
    !authorization?.startsWith('Bearer ') ||
    typeof workspaceHeader !== 'string'
  ) {
    throw new UnauthorizedError();
  }
  const token = authorization.slice('Bearer '.length);
  if (!equalSecret(token, expectedToken)) throw new UnauthorizedError();
  let workspaceId: ReturnType<typeof parseWorkspaceId>;
  try {
    workspaceId = parseWorkspaceId(workspaceHeader);
  } catch {
    throw new UnauthorizedError();
  }
  const membership = await getPool().query<{ role: string }>(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  const role = membership.rows[0]?.role;
  if (!role) throw new ForbiddenError();
  request.principal = {
    userId,
    workspaceId,
    roles: [role],
  };
}
