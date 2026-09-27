import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  submitScoreRequestSchema,
  SubmitScoreRequest,
  PERMISSIONS,
  createRubricRequestSchema,
  CreateRubricRequest,
  assignJudgeRequestSchema,
  AssignJudgeRequest
} from '@hackathon/contracts';
import { requireAuth, requirePermission } from '../../core/authorization';
import { validateRequest } from '../../core/validation';
import { successResponse } from '../../core/responses';

const assignmentParamsSchema = z.object({ assignmentId: z.string().min(1) });
const rubricParamsSchema = z.object({ rubricId: z.string().min(1) });

export async function judgingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/judge/assignments/:assignmentId/scores
   *
   * Submit or draft-save a judge's criterion scores for one assignment.
   *
   * Guards:
   *  - requireAuth()               → 401 if no session
   *  - requirePermission(JUDGE_EVALUATE) → 403 if not a JUDGE/ORGANIZER/ADMIN
   *  - validateRequest(body)       → 422 on Zod failures
   *  - JudgingService              → 403 on ownership mismatch, 409 on immutability/OCC
   */
  app.post<{ Params: { assignmentId: string }; Body: SubmitScoreRequest }>(
    '/api/judge/assignments/:assignmentId/scores',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.JUDGE_EVALUATE),
        validateRequest({
          params: assignmentParamsSchema,
          body: submitScoreRequestSchema,
        }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.submitScore(
        request.params.assignmentId,
        request.auth!.id,
        request.body
      );

      const statusCode = request.body.status === 'SUBMITTED' ? 200 : 202;
      return reply.status(statusCode).send(successResponse(result));
    }
  );

  /**
   * GET /api/judge/assignments
   *
   * Retrieve list of assignments for the current judge or organizer.
   */
  app.get<{ Querystring: { eventId?: string } }>(
    '/api/judge/assignments',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.JUDGE_VIEW),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.listAssignments(
        request.auth!,
        request.query.eventId
      );
      return reply.status(200).send(successResponse(result));
    }
  );

  /**
   * GET /api/judge/assignments/:assignmentId/scores

   *
   * Retrieve current score for an assignment.
   * Returns 404 if no score has been saved yet.
   */
  app.get<{ Params: { assignmentId: string } }>(
    '/api/judge/assignments/:assignmentId/scores',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.JUDGE_VIEW),
        validateRequest({ params: assignmentParamsSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.getScore(
        request.params.assignmentId,
        request.auth!
      );

      if (!result) {
        return reply.status(404).send(successResponse(null));
      }

      return reply.status(200).send(successResponse(result));
    }
  );

  /**
   * GET /api/judge/progress
   *
   * Retrieve judging progress statistics.
   */
  app.get<{ Querystring: { eventId?: string } }>(
    '/api/judge/progress',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.JUDGE_VIEW),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.getProgress(
        request.auth!,
        request.query.eventId
      );
      return reply.status(200).send(successResponse(result));
    }
  );

  // ── Organizer Routes (2D-6) ──────────────────────────────────────────────────

  /**
   * POST /api/judge/rubrics
   */
  app.post<{ Body: CreateRubricRequest }>(
    '/api/judge/rubrics',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ body: createRubricRequestSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.createRubric(
        request.body.eventId,
        request.auth!,
        request.body
      );
      return reply.status(201).send(successResponse(result));
    }
  );

  /**
   * GET /api/judge/rubrics/:rubricId
   */
  app.get<{ Params: { rubricId: string } }>(
    '/api/judge/rubrics/:rubricId',
    {
      preHandler: [
        requireAuth(),
        // Both JUDGE and ORGANIZER may need to view the rubric, so JUDGE_VIEW or EVENT_MANAGE
        // But for simplicity, we allow any authenticated user to fetch a rubric if they know the ID (or we use JUDGE_VIEW)
        requirePermission(PERMISSIONS.JUDGE_VIEW),
        validateRequest({ params: rubricParamsSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.getRubric(
        request.params.rubricId,
        request.auth!
      );
      return reply.status(200).send(successResponse(result));
    }
  );

  /**
   * PUT /api/judge/rubrics/:rubricId
   */
  app.put<{ Params: { rubricId: string }; Body: CreateRubricRequest }>(
    '/api/judge/rubrics/:rubricId',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ params: rubricParamsSchema, body: createRubricRequestSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.updateRubric(
        request.params.rubricId,
        request.auth!,
        request.body
      );
      return reply.status(200).send(successResponse(result));
    }
  );

  /**
   * POST /api/judge/assignments
   */
  app.post<{ Body: AssignJudgeRequest }>(
    '/api/judge/assignments',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        validateRequest({ body: assignJudgeRequestSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.createAssignment(
        request.auth!,
        request.body
      );
      return reply.status(201).send(successResponse(result));
    }
  );

  /**
   * GET /api/judge/assignments/:assignmentId
   */
  app.get<{ Params: { assignmentId: string } }>(
    '/api/judge/assignments/:assignmentId',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.JUDGE_VIEW),
        validateRequest({ params: assignmentParamsSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.judgingService.getAssignment(
        request.params.assignmentId,
        request.auth!
      );
      return reply.status(200).send(successResponse(result));
    }
  );
}
