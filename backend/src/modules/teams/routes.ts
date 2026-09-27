import { FastifyInstance } from 'fastify';
import {
  createTeamSchema,
  CreateTeamRequest,
  joinTeamSchema,
  JoinTeamRequest,
  createTeamInviteSchema,
  CreateTeamInviteRequest,
  PERMISSIONS,
} from '@hackathon/contracts';
import { validateRequest } from '../../core/validation';
import { requireAuth, requirePermission } from '../../core/authorization';
import { successResponse } from '../../core/responses';
import { toTeamResponseDto } from '../../core/types/mappers';

/**
 * Team Management HTTP route definitions:
 * - POST /api/teams        - Create a team and enroll creator (atomic)
 * - POST /api/teams/invite - Issue a cryptographically secure team invitation token
 * - POST /api/teams/join   - Join an existing team using an invitation token (atomic)
 */
export async function teamsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/teams
  app.post<{ Body: CreateTeamRequest }>(
    '/api/teams',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.TEAM_CREATE),
        validateRequest({ body: createTeamSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.teamService.createTeam(
        request.auth!,
        request.body
      );

      return reply
        .status(201)
        .send(successResponse(toTeamResponseDto(result.team, result.members)));
    }
  );

  // POST /api/teams/invite
  app.post<{ Body: CreateTeamInviteRequest }>(
    '/api/teams/invite',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.TEAM_INVITE),
        validateRequest({ body: createTeamInviteSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.teamService.createInvite(
        request.auth!,
        request.body
      );

      return reply.status(200).send(
        successResponse({
          team_id: result.teamId,
          invite_token: result.inviteToken,
        })
      );
    }
  );

  // POST /api/teams/join
  app.post<{ Body: JoinTeamRequest }>(
    '/api/teams/join',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.TEAM_JOIN),
        validateRequest({ body: joinTeamSchema }),
      ],
    },
    async (request, reply) => {
      const result = await app.dependencies.teamService.joinTeam(
        request.auth!,
        request.body
      );

      return reply
        .status(200)
        .send(successResponse(toTeamResponseDto(result.team, result.members)));
    }
  );
}
