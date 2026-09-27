import { ProjectStatus } from '@hackathon/contracts';

export interface ProjectRecord {
  id: string;
  teamId: string;
  trackId: string;
  title: string;
  description: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status: ProjectStatus;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectDto {
  id?: string;
  teamId: string;
  trackId: string;
  title: string;
  description: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status?: ProjectStatus;
  submittedAt?: Date | null;
}

export interface UpdateProjectDto {
  trackId?: string;
  title?: string;
  description?: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status?: ProjectStatus;
  submittedAt?: Date | null;
}

export interface ProjectRepository {
  findById(id: string): Promise<ProjectRecord | null>;
  findByTeamId(teamId: string): Promise<ProjectRecord | null>;
  findAll(): Promise<ProjectRecord[]>;
  create(data: CreateProjectDto): Promise<ProjectRecord>;
  update(id: string, data: UpdateProjectDto): Promise<ProjectRecord>;
}
