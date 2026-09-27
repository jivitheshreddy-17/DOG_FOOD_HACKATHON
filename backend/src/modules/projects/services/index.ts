import {
  AuthenticatedUser,
  CreateProjectRequest,
  UpdateProjectRequest,
} from '@hackathon/contracts';
import { ProjectRecord } from '../../../core/repositories';

/**
 * Service contract defining business operations for Project Management.
 * To be implemented in Phase 5 Part 2.
 */
export interface ProjectServiceContract {
  createProject(
    user: AuthenticatedUser,
    request: CreateProjectRequest
  ): Promise<ProjectRecord>;
  getProjectById(
    user: AuthenticatedUser,
    id: string
  ): Promise<ProjectRecord>;
  listProjects(): Promise<ProjectRecord[]>;
  getProjectByTeamId(
    user: AuthenticatedUser,
    teamId: string
  ): Promise<ProjectRecord | null>;
  updateProject(
    user: AuthenticatedUser,
    id: string,
    request: UpdateProjectRequest
  ): Promise<ProjectRecord>;
}

export const PROJECTS_SERVICES_LOCATION = 'projects/services';
