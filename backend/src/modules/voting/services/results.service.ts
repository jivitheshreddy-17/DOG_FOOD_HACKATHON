import {
  EventRepository,
  ProjectRepository,
  TeamRepository,
  CommunityVoteRepository,
} from '../../../core/repositories';
import { VotingWindowService } from './voting-window.service';
import { NotFoundError, ForbiddenError } from '../../../core/errors';
import { AuthenticatedUser, PROJECT_STATUS } from '@hackathon/contracts';

export interface ResultsServiceDependencies {
  eventRepository: EventRepository;
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
  communityVoteRepository: CommunityVoteRepository;
  votingWindowService: VotingWindowService;
}

export interface GetResultsParams {
  eventId: string;
  user?: AuthenticatedUser;
}

export interface ProjectResultDto {
  projectId: string;
  title: string;
  totalVotes: number;
  trackId: string;
}

export interface EventResultsResponseDto {
  eventId: string;
  isResultsPublished: boolean;
  results: ProjectResultDto[];
}

export class ResultsService {
  constructor(private readonly dependencies: ResultsServiceDependencies) {}

  async getEventResults(params: GetResultsParams): Promise<EventResultsResponseDto> {
    const { eventId, user } = params;

    // 1. Resolve event
    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // 2. Check requester authorization (organizer or admin)
    const isOrganizer = !!user && (user.role === 'ORGANIZER' || user.role === 'ADMIN');

    // 3. Check voting window activity
    const windowCheck = this.dependencies.votingWindowService.checkVotingWindow(event);
    const isVotingActive = windowCheck.open;

    // 4. Enforce strict Results Privacy Policy
    if (isVotingActive && !isOrganizer) {
      throw new ForbiddenError('Community voting results are hidden while voting is active');
    }

    if (!event.isResultsPublished && !isOrganizer) {
      throw new ForbiddenError('Community voting results have not been published by event organizers yet');
    }

    // 5. Gather vote totals for all submitted projects in this event
    const allProjects = await this.dependencies.projectRepository.findAll();
    const eventProjects = [];

    for (const p of allProjects) {
      if (p.status !== PROJECT_STATUS.SUBMITTED) continue;
      const team = await this.dependencies.teamRepository.findById(p.teamId);
      if (team && team.eventId === eventId) {
        eventProjects.push(p);
      }
    }

    let voteTotalsMap = new Map<string, number>();

    if (typeof this.dependencies.communityVoteRepository.getEventVoteTotals === 'function') {
      const totals = await this.dependencies.communityVoteRepository.getEventVoteTotals(eventId);
      for (const t of totals) {
        voteTotalsMap.set(t.projectId, t.totalVotes);
      }
    } else {
      for (const p of eventProjects) {
        const count = await this.dependencies.communityVoteRepository.countByProject(eventId, p.id);
        voteTotalsMap.set(p.id, count);
      }
    }

    const results: ProjectResultDto[] = eventProjects.map((p) => ({
      projectId: p.id,
      title: p.title,
      totalVotes: voteTotalsMap.get(p.id) ?? 0,
      trackId: p.trackId,
    }));

    // Sort by total votes descending
    results.sort((a, b) => b.totalVotes - a.totalVotes);

    return {
      eventId: event.id,
      isResultsPublished: event.isResultsPublished ?? false,
      results,
    };
  }
}
