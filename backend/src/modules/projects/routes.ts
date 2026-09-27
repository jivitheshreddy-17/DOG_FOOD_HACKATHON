import { FastifyInstance } from 'fastify';
import {
  CreateProjectRequest,
  UpdateProjectRequest,
  createProjectSchema,
  projectParamsSchema,
  updateProjectSchema,
  PERMISSIONS,
  submitProjectSchema,
} from '@hackathon/contracts';
import { requireAuth, requirePermission } from '../../core/authorization';
import { validateRequest } from '../../core/validation';
import { successResponse } from '../../core/responses';
import { toProjectResponseDto } from '../../core/types/mappers';

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateProjectRequest }>(
    '/api/projects',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.PROJECT_CREATE),
        validateRequest({ body: createProjectSchema }),
      ],
    },
    async (request, reply) => {
      const project = await app.dependencies.projectService.createProject(
        request.auth!,
        request.body
      );
      return reply.status(201).send(successResponse(toProjectResponseDto(project)));
    }
  );

  app.get(
    '/api/projects',
    async (request) => {
      const projects = await app.dependencies.projectService.listProjects();
      return successResponse(projects.map((p: any) => toProjectResponseDto(p)));
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/projects/:id',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.PROJECT_VIEW),
        validateRequest({ params: projectParamsSchema }),
      ],
    },
    async (request) => {
      const project = await app.dependencies.projectService.getProject(
        request.auth!,
        request.params.id
      );
      return successResponse(toProjectResponseDto(project));
    }
  );

  app.put<{ Params: { id: string }; Body: UpdateProjectRequest }>(
    '/api/projects/:id',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.PROJECT_UPDATE),
        validateRequest({ params: projectParamsSchema, body: updateProjectSchema }),
      ],
    },
    async (request) => {
      const project = await app.dependencies.projectService.updateProject(
        request.auth!,
        request.params.id,
        request.body
      );
      return successResponse(toProjectResponseDto(project));
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/projects/:id/submit',
    {
      preHandler: [
        requireAuth(),
        requirePermission(PERMISSIONS.PROJECT_SUBMIT),
        validateRequest({
          params: projectParamsSchema,
          body: submitProjectSchema,
        }),
      ],
    },
    async (request) => {
      const project = await app.dependencies.projectService.submitProject(
        request.auth!,
        request.params.id
      );
      return successResponse(toProjectResponseDto(project));
    }
  );
}
