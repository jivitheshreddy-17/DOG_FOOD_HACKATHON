import { FastifyInstance } from 'fastify';
import { healthRoute } from './health.route';
import { identityRoutes } from '../modules/identity';
import { teamsRoutes } from '../modules/teams';
import { projectsRoutes } from '../modules/projects';
import { judgingRoutes } from '../modules/judging';
import { exportRoutes } from '../modules/export';
import { normalizationRoutes } from '../modules/normalization/normalization.routes';
import { votingRoutes } from '../modules/voting';

/**
 * Global route registration plugin.
 * Assembles standalone routes and modular domain route plugins.
 */
export async function registerRoutes(app: FastifyInstance) {
  // Domain module routes
  await app.register(identityRoutes);
  await app.register(teamsRoutes);
  await app.register(projectsRoutes);
  await app.register(judgingRoutes);
  await app.register(normalizationRoutes);
  await app.register(exportRoutes);
  await app.register(votingRoutes);
}

export * from './health.route';
