import type { FastifyInstance } from 'fastify';
import { getPool } from '@codeorbit/persistence';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await getPool().query('SELECT 1');
      return { status: 'ready' };
    } catch {
      app.log.error({ event: 'database_readiness_failed' }, 'Readiness check failed');
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
}
