import Fastify, { LogController } from 'fastify';
import { DomainError } from '@codeorbit/domain';
import { registerHealthRoutes } from './routes/health.js';
import { registerRepositoryRoutes } from './routes/repositories.js';
import { registerAnalysisRunRoutes } from './routes/analysis-runs.js';
import { registerAnalysisSummaryRoutes } from './routes/analysis-summary.js';
import {
  registerGitHubInstallationRoutes,
  type GitHubInstallationProvider,
} from './routes/github-installation.js';
import { RepositoryService } from './services/repository-service.js';
import { GitHubSourceProvider } from '@codeorbit/github-provider';
import type { SourceProvider } from '@codeorbit/source-provider-contracts';
import type {
  RepositoryServicePort,
  RepositorySourceProvider,
} from './services/repository-service.js';
import { AnalysisRunService } from './services/analysis-run-service.js';
import type { AnalysisRunServicePort } from './services/analysis-run-service.js';
import { AnalysisSummaryService } from './services/analysis-summary-service.js';
import type { FastifyRequest } from 'fastify';
import { registerApiMetrics } from './observability/metrics.js';

type AppGitHubProvider = RepositorySourceProvider &
  GitHubInstallationProvider &
  Pick<SourceProvider, 'resolveRevision'>;

interface AppOptions {
  readonly repositoryService?: RepositoryServicePort;
  readonly analysisRunService?: AnalysisRunServicePort;
  readonly analysisSummaryService?: Pick<AnalysisSummaryService, 'get'>;
  readonly githubProvider?: AppGitHubProvider;
  readonly authenticateRequest?: (request: FastifyRequest) => Promise<void>;
}

export function createApp(options: AppOptions = {}) {
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          '**.authorization',
          '**.token',
          '**.accessToken',
          '**.installationToken',
          '**.secret',
          '**.clientSecret',
          '**.privateKey',
          '**.private_key',
          '**.excerpt',
          '**.sourceContent',
        ],
        censor: '[REDACTED]',
      },
    },
    bodyLimit: 1_048_576,
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({ error: error.code, details: error.message });
    }
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply.code(400).send({ error: 'invalid_request', details: 'The request is invalid.' });
    }
    app.log.error(
      {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: error instanceof Error ? error.name : undefined,
      },
      'Unhandled request failure',
    );
    return reply
      .code(500)
      .send({ error: 'internal_error', details: 'The request could not be completed.' });
  });
  void registerApiMetrics(app);
  const provider = options.githubProvider ?? new GitHubSourceProvider();
  void registerHealthRoutes(app);
  void registerGitHubInstallationRoutes(app, provider, options.authenticateRequest);
  void registerRepositoryRoutes(
    app,
    options.repositoryService ?? new RepositoryService(provider),
    options.authenticateRequest,
  );
  void registerAnalysisRunRoutes(
    app,
    options.analysisRunService ?? new AnalysisRunService(provider),
    options.authenticateRequest,
  );
  void registerAnalysisSummaryRoutes(
    app,
    options.analysisSummaryService ?? new AnalysisSummaryService(),
    options.authenticateRequest,
  );
  return app;
}
