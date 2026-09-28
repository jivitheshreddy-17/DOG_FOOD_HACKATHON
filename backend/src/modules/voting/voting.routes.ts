import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  updateVotingConfigRequestSchema,
  UpdateVotingConfigRequest,
  submitVoteRequestSchema,
  SubmitVoteRequest,
  otpRequestSchema,
  OtpRequest,
  otpVerifySchema,
  OtpVerifyRequest,
  createCommentRequestSchema,
  CreateCommentRequest,
  getGalleryQuerySchema,
  GetGalleryQuery,
  paginationQuerySchema,
  PaginationQuery,
  PERMISSIONS,
  auditQuerySchema,
  AuditQuery,
} from '../../contracts';
import { requireAuth, requirePermission, requireEventOwnership } from '../../core/authorization';
import { validateRequest } from '../../core/validation';
import { successResponse } from '../../core/responses';
import { InvalidVotingModeError, UnauthorizedError, ValidationError } from '../../core/errors';

const eventParamsSchema = z.object({ eventId: z.string().min(1) });

export async function votingRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/voting/events/:eventId/config
  app.get<{ Params: { eventId: string } }>(
    '/api/voting/events/:eventId/config',
    {
      preHandler: validateRequest({ params: eventParamsSchema }),
    },
    async (request, reply) => {
      const config = await app.dependencies.votingConfigService.getVotingConfig(request.params.eventId);
      return reply.status(200).send(successResponse(config));
    }
  );

  // PUT /api/voting/events/:eventId/config
  app.put<{ Params: { eventId: string }; Body: UpdateVotingConfigRequest }>(
    '/api/voting/events/:eventId/config',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        requireEventOwnership((req) => (req.params as any).eventId, app.dependencies.repositories.eventRepository!),
        validateRequest({ params: eventParamsSchema, body: updateVotingConfigRequestSchema }),
      ],
    },
    async (request, reply) => {
      const config = await app.dependencies.votingConfigService.updateVotingConfig(
        request.params.eventId,
        request.body
      );
      return reply.status(200).send(successResponse(config));
    }
  );

  // GET /api/voting/events/:eventId/ballot
  app.get<{ Params: { eventId: string } }>(
    '/api/voting/events/:eventId/ballot',
    {
      preHandler: validateRequest({ params: eventParamsSchema }),
    },
    async (request, reply) => {
      const ballot = await app.dependencies.ballotService.generateBallot(request.params.eventId);
      return reply.status(200).send(successResponse(ballot));
    }
  );

  // POST /api/voting/events/:eventId/otp/request
  app.post<{ Params: { eventId: string }; Body: OtpRequest }>(
    '/api/voting/events/:eventId/otp/request',
    {
      preHandler: validateRequest({ params: eventParamsSchema, body: otpRequestSchema }),
    },
    async (request, reply) => {
      const result = await app.dependencies.otpService.requestOtp(request.params.eventId, request.body.email);
      return reply.status(200).send(successResponse(result));
    }
  );

  // POST /api/voting/events/:eventId/otp/verify
  app.post<{ Params: { eventId: string }; Body: OtpVerifyRequest }>(
    '/api/voting/events/:eventId/otp/verify',
    {
      preHandler: validateRequest({ params: eventParamsSchema, body: otpVerifySchema }),
    },
    async (request, reply) => {
      const result = await app.dependencies.otpService.verifyOtp(
        request.params.eventId,
        request.body.email,
        request.body.otp
      );
      return reply.status(200).send(successResponse(result));
    }
  );

  // POST /api/voting/events/:eventId/votes
  app.post<{ Params: { eventId: string }; Body: SubmitVoteRequest }>(
    '/api/voting/events/:eventId/votes',
    {
      preHandler: validateRequest({ params: eventParamsSchema, body: submitVoteRequestSchema }),
    },
    async (request: FastifyRequest<{ Params: { eventId: string }; Body: SubmitVoteRequest }>, reply: FastifyReply) => {
      const { eventId } = request.params;
      const { projectId, verificationToken } = request.body;

      // Resolve event configuration
      const config = await app.dependencies.votingConfigService.getVotingConfig(eventId);
      const votingMode = config.votingMode;

      let voterIdentity: string;
      let userId: string | null = null;

      // Mode-specific trusted voter identity resolution
      if (votingMode === 'DISABLED') {
        throw new InvalidVotingModeError(`Community voting is disabled for event '${eventId}'`);
      } else if (votingMode === 'AUTHENTICATED') {
        if (!request.auth || !request.auth.id) {
          throw new UnauthorizedError('Authentication required for AUTHENTICATED voting mode');
        }
        voterIdentity = app.dependencies.voterIdentityService.deriveAuthenticatedIdentity(request.auth);
        userId = request.auth.id;
      } else if (votingMode === 'EMAIL_GATED') {
        if (!verificationToken) {
          throw new ValidationError('Verification token is required for EMAIL_GATED voting mode');
        }
        if (!app.dependencies.otpService) {
           throw new Error('EMAIL_GATED mode is not fully implemented in this phase');
        }
        const verifiedEmail = await app.dependencies.otpService.validateAndConsumeVerificationToken(
          eventId,
          verificationToken
        );
        voterIdentity = app.dependencies.voterIdentityService.deriveEmailIdentity(verifiedEmail);
        if (request.auth) userId = request.auth.id;
      } else if (votingMode === 'OPEN_LINK') {
        const ip = request.ip ?? '127.0.0.1';
        const ua = request.headers['user-agent'] ?? 'unknown-ua';
        voterIdentity = app.dependencies.voterIdentityService.deriveOpenLinkIdentity(ip, ua as string);
        if (request.auth) userId = request.auth.id;
      } else {
        throw new InvalidVotingModeError('Unsupported voting mode');
      }

      const vote = await app.dependencies.votingService.submitVote({
        eventId,
        projectId,
        voterIdentity,
        voterType: votingMode,
        userId,
      });

      return reply.status(201).send(
        successResponse({
          id: vote.id,
          eventId: vote.eventId,
          projectId: vote.projectId,
          voterType: vote.voterType,
          points: vote.points ?? 1,
          createdAt: vote.createdAt ? vote.createdAt.toISOString() : new Date().toISOString(),
        })
      );
    }
  );

  // GET /api/voting/events/:eventId/projects
  app.get<{ Params: { eventId: string }; Querystring: GetGalleryQuery }>(
    '/api/voting/events/:eventId/projects',
    {
      preHandler: validateRequest({ params: eventParamsSchema, query: getGalleryQuerySchema }),
    },
    async (request: FastifyRequest<{ Params: { eventId: string }; Querystring: GetGalleryQuery }>, reply) => {
      const result = await app.dependencies.galleryService.getGallery({
        eventId: request.params.eventId,
        ...request.query,
      });
      return reply.status(200).send(successResponse(result));
    }
  );

  // GET /api/voting/events/:eventId/results
  app.get<{ Params: { eventId: string } }>(
    '/api/voting/events/:eventId/results',
    {
      preHandler: validateRequest({ params: eventParamsSchema }),
    },
    async (request: FastifyRequest<{ Params: { eventId: string } }>, reply) => {
      const result = await app.dependencies.resultsService.getEventResults({
        eventId: request.params.eventId,
        user: request.auth ?? undefined,
      });
      return reply.status(200).send(successResponse(result));
    }
  );

  const projectParamsSchema = z.object({ projectId: z.string().min(1) });

  // GET /api/voting/events/:eventId/audit
  app.get<{ Params: { eventId: string }; Querystring: AuditQuery }>(
    '/api/voting/events/:eventId/audit',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.EVENT_MANAGE),
        requireEventOwnership((req) => (req.params as any).eventId, app.dependencies.repositories.eventRepository!),
        validateRequest({ params: eventParamsSchema, query: auditQuerySchema }),
      ],
    },
    async (request: FastifyRequest<{ Params: { eventId: string }; Querystring: AuditQuery }>, reply) => {
      const { eventId } = request.params;
      
      if (!app.dependencies.auditQueryService) {
        throw new Error('Audit query service is not available');
      }

      if (!request.auth) {
        throw new UnauthorizedError('Authentication required');
      }

      const result = await app.dependencies.auditQueryService.getAuditTrail({
        eventId,
        caller: request.auth,
        ...request.query,
      });
      return reply.status(200).send(successResponse(result));
    }
  );

  // GET /api/voting/projects/:projectId
  app.get<{ Params: { projectId: string } }>(
    '/api/voting/projects/:projectId',
    {
      preHandler: validateRequest({ params: projectParamsSchema }),
    },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      const result = await app.dependencies.galleryService.getProjectDetail(request.params.projectId);
      return reply.status(200).send(successResponse(result));
    }
  );

  // POST /api/voting/projects/:projectId/comments
  app.post<{ Params: { projectId: string }; Body: CreateCommentRequest }>(
    '/api/voting/projects/:projectId/comments',
    {
      preHandler: validateRequest({ 
        params: projectParamsSchema,
        body: createCommentRequestSchema 
      }),
    },
    async (request: FastifyRequest<{ Params: { projectId: string }; Body: CreateCommentRequest }>, reply) => {
      const { projectId } = request.params;
      const { content, authorName } = request.body;
      const authorId = request.auth?.id ?? null;
      let finalAuthorName = authorName;
      // We assume user name doesn't exist on auth directly, or if it does we can cast or fetch.
      // Usually request.auth is just { id, role, ... }. Let's not use request.auth.name.
      
      const voterIdentity = authorId && request.auth
         ? app.dependencies.voterIdentityService.deriveAuthenticatedIdentity(request.auth) 
         : undefined;

      const result = await app.dependencies.commentService.createComment({
        projectId,
        content,
        authorId,
        authorName: finalAuthorName,
        voterIdentity,
      });
      return reply.status(201).send(successResponse(result));
    }
  );

  // GET /api/voting/projects/:projectId/comments
  app.get<{ Params: { projectId: string }; Querystring: PaginationQuery }>(
    '/api/voting/projects/:projectId/comments',
    {
      preHandler: validateRequest({ 
        params: projectParamsSchema,
        query: paginationQuerySchema 
      }),
    },
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: PaginationQuery }>, reply) => {
      const { projectId } = request.params;
      const { page, pageSize } = request.query;
      const result = await app.dependencies.commentService.getCommentsForProject(projectId, undefined, page, pageSize);
      return reply.status(200).send(successResponse(result));
    }
  );
}
