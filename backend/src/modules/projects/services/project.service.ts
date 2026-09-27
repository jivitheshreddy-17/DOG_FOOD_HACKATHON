import {
  AuthenticatedUser,
  CreateProjectRequest,
  PERMISSIONS,
  PROJECT_STATUS,
  UpdateProjectRequest,
} from '@hackathon/contracts';
import {
  ProjectRecord,
  ProjectRepository,
  TeamRepository,
  TrackRepository,
  TransactionManager,
} from '../../../core/repositories';
import { ResourceAuthorizer } from '../../../core/authorization';
import {
  AlreadyHasProjectError,
  AlreadySubmittedError,
  ConflictError,
  NotFoundError,
  SubmissionDeadlinePassedError,
} from '../../../core/errors';
import { Clock } from '../../../core/clock';

export interface ProjectServiceDependencies {
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
  trackRepository?: TrackRepository;
  transactionManager: TransactionManager;
  resourceAuthorizer: ResourceAuthorizer<ProjectRecord>;
  eventRepository?: import('../../../core/repositories').EventRepository;
  clock: Clock;
}

export class ProjectService {
  constructor(private readonly dependencies: ProjectServiceDependencies) {}

  async createProject(
    user: AuthenticatedUser,
    request: CreateProjectRequest
  ): Promise<ProjectRecord> {
    const { teamRepository, trackRepository } = this.dependencies;
    const team = await teamRepository.findById(request.team_id);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    await this.authorizeTeamMembership(user, team.id);

    const track = await this.findTrack(trackRepository, request.track_id);
    this.assertTrackEvent(track.eventId, team.eventId);

    return this.dependencies.transactionManager.run(async (repos) => {
      const existing = await repos.projectRepository.findByTeamId(team.id);
      if (existing) {
        throw new AlreadyHasProjectError('ALREADY_HAS_PROJECT');
      }

      return repos.projectRepository.create({
        teamId: team.id,
        trackId: track.id,
        title: request.title,
        description: request.description,
        repositoryUrl: request.repository_url ?? null,
        demoUrl: request.demo_url ?? null,
        status: PROJECT_STATUS.DRAFT,
        submittedAt: null,
      });
    });
  }

  async getProject(
    user: AuthenticatedUser,
    projectId: string
  ): Promise<ProjectRecord> {
    const project = await this.findProject(projectId);
    await this.dependencies.resourceAuthorizer.authorize(
      user,
      project,
      'PROJECT_VIEW'
    );
    return project;
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return this.dependencies.projectRepository.findAll();
  }

  async updateProject(
    user: AuthenticatedUser,
    projectId: string,
    request: UpdateProjectRequest
  ): Promise<ProjectRecord> {
    const project = await this.findProject(projectId);
    await this.dependencies.resourceAuthorizer.authorize(
      user,
      project,
      'PROJECT_UPDATE'
    );

    const update: Record<string, unknown> = {};
    if (request.track_id !== undefined) {
      if (request.track_id !== project.trackId) {
        const team = await this.dependencies.teamRepository.findById(
          project.teamId
        );
        if (!team) {
          throw new NotFoundError('Team not found');
        }
        const track = await this.findTrack(
          this.dependencies.trackRepository,
          request.track_id
        );
        this.assertTrackEvent(track.eventId, team.eventId);
        update.trackId = track.id;
      }
    }
    if (request.title !== undefined) update.title = request.title;
    if (request.description !== undefined) update.description = request.description;
    if (request.repository_url !== undefined) {
      update.repositoryUrl = request.repository_url;
    }
    if (request.demo_url !== undefined) update.demoUrl = request.demo_url;

    if (Object.keys(update).length === 0) {
      throw new ConflictError('No project changes were provided');
    }
    return this.dependencies.projectRepository.update(project.id, update);
  }

  async submitProject(
    user: AuthenticatedUser,
    projectId: string
  ): Promise<ProjectRecord> {
    const project = await this.findProject(projectId);
    await this.dependencies.resourceAuthorizer.authorize(
      user,
      project,
      PERMISSIONS.PROJECT_SUBMIT
    );

    if (project.status !== PROJECT_STATUS.DRAFT) {
      throw new AlreadySubmittedError();
    }

    const team = await this.dependencies.teamRepository.findById(project.teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    if (!this.dependencies.eventRepository) {
      throw new ConflictError('Submission deadline is not configured');
    }
    const event = await this.dependencies.eventRepository.findById(team.eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }
    if (!event.submissionDeadline) {
      throw new ConflictError('Submission deadline is not configured');
    }
    const deadline = event.submissionDeadline.getTime();
    if (!Number.isFinite(deadline)) {
      throw new ConflictError('Submission deadline is invalid');
    }

    const submittedAt = this.dependencies.clock.now();
    if (submittedAt.getTime() > deadline) {
      throw new SubmissionDeadlinePassedError();
    }

    return this.dependencies.transactionManager.run(async (repos) => {
      const current = await repos.projectRepository.findById(project.id);
      if (!current) {
        throw new NotFoundError('Project not found');
      }
      if (current.status !== PROJECT_STATUS.DRAFT) {
        throw new AlreadySubmittedError();
      }
      return repos.projectRepository.update(project.id, {
        status: PROJECT_STATUS.SUBMITTED,
        submittedAt,
      });
    });
  }

  private async findProject(id: string): Promise<ProjectRecord> {
    const project = await this.dependencies.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    return project;
  }

  private async authorizeTeamMembership(
    user: AuthenticatedUser,
    teamId: string
  ): Promise<void> {
    const project = {
      id: '',
      teamId,
      trackId: '',
      title: '',
      description: '',
      status: PROJECT_STATUS.DRAFT,
      submittedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    await this.dependencies.resourceAuthorizer.authorize(
      user,
      project,
      'PROJECT_CREATE'
    );
  }

  private async findTrack(
    repository: TrackRepository | undefined,
    id: string
  ) {
    if (!repository) {
      throw new NotFoundError('Track not found');
    }
    const track = await repository.findById(id);
    if (!track) {
      throw new NotFoundError('Track not found');
    }
    return track;
  }

  private assertTrackEvent(trackEventId: string | undefined, teamEventId: string) {
    if (trackEventId !== teamEventId) {
      throw new ConflictError('Track does not belong to the team event');
    }
  }
}
