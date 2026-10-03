import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError, ProviderError, UnauthorizedError } from '@codeorbit/domain';
import { getPool } from '@codeorbit/persistence';
import type { ProviderRepository } from '@codeorbit/source-provider-contracts';
import { authenticate } from '../middleware/authenticate.js';
import { requireWorkspace } from '../middleware/workspace-scope.js';

interface InstallationState {
  readonly userId: string;
  readonly workspaceId: string;
  readonly expiresAt: number;
  readonly nonce: string;
}

type AuthenticateHook = (request: FastifyRequest) => Promise<void>;

export interface GitHubInstallationProvider {
  listAuthorizedRepositories(connectionId: string): Promise<readonly ProviderRepository[]>;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`codeorbit-github-installation:${payload}`).digest('base64url');
}

function createState(userId: string, workspaceId: string, secret: string): string {
  const state: InstallationState = {
    userId,
    workspaceId,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

function verifyState(value: string, secret: string): InstallationState {
  const [payload, suppliedSignature, extra] = value.split('.');
  if (!payload || !suppliedSignature || extra) throw new UnauthorizedError();
  const expected = Buffer.from(signature(payload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new UnauthorizedError();
  }
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString()) as InstallationState;
    if (
      typeof state.userId !== 'string' ||
      typeof state.workspaceId !== 'string' ||
      typeof state.expiresAt !== 'number' ||
      typeof state.nonce !== 'string' ||
      state.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedError();
    }
    return state;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError();
  }
}

function callbackUri(status: string): string {
  const baseUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
  const target = new URL('/repositories/connect', baseUrl);
  target.searchParams.set('status', status);
  return target.toString();
}

export async function registerGitHubInstallationRoutes(
  app: FastifyInstance,
  provider: GitHubInstallationProvider,
  authenticateRequest: AuthenticateHook = authenticate,
): Promise<void> {
  app.get(
    '/api/v1/integrations/github/install',
    { preHandler: authenticateRequest },
    async (request, reply) => {
      const slug = process.env.GITHUB_APP_SLUG;
      const secret = process.env.SESSION_SECRET;
      const principal = request.principal;
      if (!slug || !secret || !principal) {
        throw new ProviderError('provider_not_configured', 'GitHub installation is unavailable.', 503);
      }
      const destination = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
      destination.searchParams.set(
        'state',
        createState(principal.userId, requireWorkspace(request), secret),
      );
      return reply.redirect(destination.toString(), 302);
    },
  );

  app.get<{ Querystring: { installation_id?: string; setup_action?: string; state?: string } }>(
    '/api/v1/integrations/github/installations/callback',
    async (request, reply) => {
      const { installation_id: installationId, setup_action: setupAction, state: encodedState } =
        request.query;
      const secret = process.env.SESSION_SECRET;
      if (
        !secret ||
        !installationId ||
        !/^\d+$/.test(installationId) ||
        !encodedState ||
        (setupAction && !['install', 'update'].includes(setupAction))
      ) {
        throw new UnauthorizedError();
      }
      const state = verifyState(encodedState, secret);
      const membership = await getPool().query(
        'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [state.workspaceId, state.userId],
      );
      if (!membership.rowCount) throw new ForbiddenError();
      await provider.listAuthorizedRepositories(installationId);
      await getPool().query(
        `INSERT INTO source_connections
           (id, workspace_id, provider_key, external_connection_id)
         VALUES ($1, $2, 'github', $3)
         ON CONFLICT (workspace_id, provider_key, external_connection_id)
         DO UPDATE SET status = 'active', authorized_at = now(), revoked_at = NULL`,
        [randomUUID(), state.workspaceId, installationId],
      );
      return reply.redirect(callbackUri('connected'), 303);
    },
  );

  app.get(
    '/api/v1/integrations/github/repositories',
    { preHandler: authenticateRequest },
    async (request) => {
      const connection = await getPool().query<{ external_connection_id: string }>(
        `SELECT external_connection_id FROM source_connections
        WHERE workspace_id = $1 AND provider_key = 'github' AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [requireWorkspace(request)],
      );
      const connectionId = connection.rows[0]?.external_connection_id;
      if (!connectionId) throw new ForbiddenError();
      return { items: await provider.listAuthorizedRepositories(connectionId) };
    },
  );
}
