import type { FastifyInstance, FastifyRequest } from 'fastify';

const requestCounts = new Map<string, number>();
const requestDurations = new Map<string, number[]>();
const starts = new WeakMap<FastifyRequest, number>();
const durationBuckets = [10, 50, 100, 250, 500, 1_000, 2_000];

export async function registerApiMetrics(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request) => {
    starts.set(request, performance.now());
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const key = `${route}|${reply.statusCode}`;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    const duration = Math.max(0, performance.now() - (starts.get(request) ?? performance.now()));
    const values = requestDurations.get(route) ?? [];
    values.push(duration);
    requestDurations.set(route, values);
  });
  app.get('/metrics', async (_request, reply) => {
    const lines = [
      '# HELP codeorbit_api_http_requests_total API HTTP requests by route and status.',
      '# TYPE codeorbit_api_http_requests_total counter',
    ];
    for (const [key, count] of requestCounts) {
      const [route, status] = key.split('|');
      lines.push(`codeorbit_api_http_requests_total{route="${route}",status="${status}"} ${count}`);
    }
    lines.push(
      '# HELP codeorbit_api_request_duration_milliseconds API request duration.',
      '# TYPE codeorbit_api_request_duration_milliseconds histogram',
    );
    for (const [route, values] of requestDurations) {
      for (const bound of durationBuckets) {
        lines.push(
          `codeorbit_api_request_duration_milliseconds_bucket{route="${route}",le="${bound}"} ${values.filter((value) => value <= bound).length}`,
        );
      }
      lines.push(
        `codeorbit_api_request_duration_milliseconds_bucket{route="${route}",le="+Inf"} ${values.length}`,
      );
      lines.push(
        `codeorbit_api_request_duration_milliseconds_count{route="${route}"} ${values.length}`,
      );
      lines.push(
        `codeorbit_api_request_duration_milliseconds_sum{route="${route}"} ${values.reduce((sum, value) => sum + value, 0)}`,
      );
    }
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(`${lines.join('\n')}\n`);
  });
}
