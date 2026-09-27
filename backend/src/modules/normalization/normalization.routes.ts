import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../../core/authorization';
import { validateRequest } from '../../core/validation';
import { successResponse } from '../../core/responses';
import { PERMISSIONS } from '@hackathon/contracts';

const triggerNormalizationSchema = z.object({
  eventId: z.string().min(1),
  parameters: z.any().optional(),
});

const eventParamsSchema = z.object({
  eventId: z.string().min(1),
});

const runParamsSchema = z.object({
  runId: z.string().min(1),
});

export async function normalizationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { eventId: string; parameters?: any } }>(
    '/api/normalization/runs',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ body: triggerNormalizationSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.normalizationService.triggerNormalization(
        request.body.eventId,
        request.auth!,
        request.body.parameters
      );
      return reply.status(201).send(successResponse(result));
    }
  );

  app.get<{ Params: { eventId: string } }>(
    '/api/normalization/events/:eventId/runs',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ params: eventParamsSchema }),
      ],
    },
    async (request, reply) => {
      const runs = await app.dependencies.normalizationService.listRuns(
        request.params.eventId,
        request.auth!
      );
      return reply.status(200).send(successResponse(runs));
    }
  );

  app.get<{ Params: { runId: string } }>(
    '/api/normalization/runs/:runId/results',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ params: runParamsSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.normalizationService.getRunResults(
        request.params.runId,
        request.auth!
      );
      return reply.status(200).send(successResponse(result));
    }
  );
}
