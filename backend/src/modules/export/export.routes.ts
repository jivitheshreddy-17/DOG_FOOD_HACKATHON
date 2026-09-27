import { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission } from '../../core/authorization';
import { PERMISSIONS } from '@hackathon/contracts';
import { ERROR_CODES, ForbiddenError } from '../../core/errors';
import { prisma } from '../../infrastructure/database/prisma.client';

export async function exportRoutes(app: FastifyInstance) {
  app.get(
    '/api/export.csv',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE), // Only Organizers and Admins have EVENT_MANAGE
      ],
    },
    async (request, reply) => {
      // In Tier 2, if no specific eventId is passed, maybe export all events they are authorized for.
      // Since Organizers currently have global access, export everything completed.
      const scores = await prisma.score.findMany({
        where: { assignment: { status: 'COMPLETED' } },
        include: {
          assignment: { include: { event: true, track: true } },
          judge: true,
          project: true,
          rubric: true,
          criteria: { include: { criterion: true } },
        },
      });

      let csv = 'event,track,assignment,judge,project,criterion,raw_value,rubric,submittedAt\n';

      for (const score of scores) {
        for (const c of score.criteria) {
          csv += `${score.assignment.eventId},${score.assignment.trackId || ''},${score.assignmentId},${score.judgeId},${score.projectId},${c.criterion.name},${c.value},${score.rubric.name},${score.submittedAt ? score.submittedAt.toISOString() : ''}\n`;
        }
      }

      reply.header('Content-Type', 'text/csv');
      return reply.send(csv);
    }
  );

  app.get<{ Params: { runId: string } }>(
    '/api/normalization/runs/:runId/export.csv',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
      ],
    },
    async (request, reply) => {
      const run = await prisma.normalizationRun.findUnique({
        where: { id: request.params.runId },
        include: { results: true },
      });

      if (!run) {
        return reply.status(404).send({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Run not found' } });
      }

      let csv = 'projectId,criterionId,rawScore,rawWeightedScore,normalizedCriterionScore,normalizedWeightedContribution,finalAggregate,diagnosticFlags\n';

      for (const res of run.results) {
        const flags = Array.isArray(res.diagnosticFlags) ? res.diagnosticFlags.join('|') : '';
        csv += `${res.projectId},${res.criterionId || 'AGGREGATE'},${res.rawScore},${res.rawWeightedScore},${res.normalizedCriterionScore},${res.normalizedWeightedContribution},${res.finalAggregate},${flags}\n`;
      }

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="normalized_run_${run.id}.csv"`);
      return reply.send(csv);
    }
  );
}
