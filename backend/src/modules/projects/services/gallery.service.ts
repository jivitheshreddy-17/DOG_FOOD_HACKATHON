import { ProjectRepository, TeamRepository, ProjectRecord } from '../../../core/repositories';
import { NotFoundError } from '../../../core/errors';
import { PROJECT_STATUS } from '@hackathon/contracts';

export interface GalleryServiceDependencies {
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
}

export interface GetGalleryParams {
  eventId: string;
  search?: string;
  trackId?: string;
  page?: number;
  pageSize?: number;
}

export interface GalleryProjectDto {
  id: string;
  teamId: string;
  trackId: string;
  title: string;
  description: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  submittedAt?: string | null;
}

export interface PaginatedGalleryResponse {
  data: GalleryProjectDto[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class GalleryService {
  constructor(private readonly dependencies: GalleryServiceDependencies) {}

  async getGallery(params: GetGalleryParams): Promise<PaginatedGalleryResponse> {
    const { eventId, search, trackId, page = 1, pageSize = 20 } = params;

    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

    const allProjects = await this.dependencies.projectRepository.findAll();
    const eligible: ProjectRecord[] = [];

    for (const p of allProjects) {
      if (p.status !== PROJECT_STATUS.SUBMITTED) continue;
      if (trackId && p.trackId !== trackId) continue;

      const team = await this.dependencies.teamRepository.findById(p.teamId);
      if (!team || team.eventId !== eventId) continue;

      if (search && search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(q);
        const descMatch = p.description ? p.description.toLowerCase().includes(q) : false;
        if (!titleMatch && !descMatch) continue;
      }

      eligible.push(p);
    }

    const total = eligible.length;
    const startIdx = (safePage - 1) * safePageSize;
    const paginatedProjects = eligible.slice(startIdx, startIdx + safePageSize);
    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      data: paginatedProjects.map((p) => this.mapToDto(p)),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages,
      },
    };
  }

  async getProjectDetail(projectId: string, eventId?: string): Promise<GalleryProjectDto> {
    const project = await this.dependencies.projectRepository.findById(projectId);
    if (!project || project.status !== PROJECT_STATUS.SUBMITTED) {
      throw new NotFoundError('Project not found');
    }
    
    if (eventId) {
      const team = await this.dependencies.teamRepository.findById(project.teamId);
      if (!team || team.eventId !== eventId) {
         throw new NotFoundError('Project not found');
      }
    }

    return this.mapToDto(project);
  }

  private mapToDto(project: ProjectRecord): GalleryProjectDto {
    return {
      id: project.id,
      teamId: project.teamId,
      trackId: project.trackId,
      title: project.title,
      description: project.description,
      repositoryUrl: project.repositoryUrl ?? null,
      demoUrl: project.demoUrl ?? null,
      submittedAt: project.submittedAt ? project.submittedAt.toISOString() : null,
    };
  }
}
