import { closePool } from '@codeorbit/persistence';
import { GitHubSourceProvider } from '@codeorbit/github-provider';
import { AnalysisPipeline } from './pipeline.js';
import { runNextJob } from './runner.js';
import { refreshStuckLeaseGauge, startWorkerMetricsServer } from './observability/metrics.js';
import { getPool } from '@codeorbit/persistence';

const POLL_INTERVAL_MS = 1_000;
let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function runWorker(): Promise<void> {
  const executor = new AnalysisPipeline(new GitHubSourceProvider());
  const metricsServer = await startWorkerMetricsServer(
    Number(process.env.WORKER_METRICS_PORT ?? 9101),
  );
  const leaseRefresh = setInterval(() => {
    void refreshStuckLeaseGauge(getPool()).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Worker lease metrics refresh failed.',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    });
  }, 15_000);
  leaseRefresh.unref();
  while (!stopping) {
    try {
      const claimed = await runNextJob(executor);
      if (!claimed) await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Analysis worker execution failed.',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      await sleep(POLL_INTERVAL_MS);
    }
  }
  clearInterval(leaseRefresh);
  await new Promise<void>((resolve, reject) => {
    metricsServer.close((error) => (error ? reject(error) : resolve()));
  });
  await closePool();
}

void runWorker().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Analysis worker could not start.',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
