import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Config } from './core/config';
import { Clock } from './core/clock';
import { errorHandler, ERROR_CODES } from './core/errors';
import { AppDependencies, resolveDependencies } from './core/application';
import { authenticateRequest } from './core/security';
import { registerRoutes } from './routes';
import './core/types/request-context';

export interface AppOptions {
  config?: Config;
  clock?: Clock;
  dependencies?: Partial<AppDependencies>;
  serverOptions?: FastifyServerOptions;
}

/**
 * Application composition root and factory.
 * Configures Fastify instance, registers plugins, request context, routes, and error handlers.
 * Does NOT start listening on a network port.
 */
export function createApp(options: AppOptions = {}): FastifyInstance {
  const dependencies = resolveDependencies(
    {
      clock: options.clock ?? options.dependencies?.clock,
      repositories: options.dependencies?.repositories,
      transactionManager: options.dependencies?.transactionManager,
      passwordHasher: options.dependencies?.passwordHasher,
      sessionService: options.dependencies?.sessionService,
      authenticationService: options.dependencies?.authenticationService,
      teamService: options.dependencies?.teamService,
      teamResourceAuthorizer: options.dependencies?.teamResourceAuthorizer,
      projectService: options.dependencies?.projectService,
      projectResourceAuthorizer: options.dependencies?.projectResourceAuthorizer,
      judgingService: options.dependencies?.judgingService,
      normalizationService: options.dependencies?.normalizationService,
    },
    options.config
  );

  const app = fastify({
    logger: options.serverOptions?.logger ?? false,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return randomUUID();
    },
    ...options.serverOptions,
  });

  // Attach composition dependencies
  app.decorate('dependencies', dependencies);
  if (options.config) {
    app.decorate('config', options.config);
  }

  // Request context foundation: initialize request.auth and request.authError
  app.decorateRequest('auth', undefined);
  app.decorateRequest('authError', undefined);

  // Authentication hook: extracts session credential, resolves identity, populates request.auth
  app.addHook('onRequest', async (req) => {
    await authenticateRequest(req, dependencies.sessionService);
  });

  // Register global error handler
  app.setErrorHandler(errorHandler);

  // Register standard 404 Not Found handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route ${request.method}:${request.url} not found`,
      },
    });
  });

  // Register all routes (health and modular domain routes)
  app.register(registerRoutes);

  return app;
}
