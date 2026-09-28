import { randomInt } from 'node:crypto';
import { ProjectRepository, EventRepository, TeamRepository, ProjectRecord } from '../../../core/repositories';
import { VotingWindowService } from './voting-window.service';
import { NotFoundError } from '../../../core/errors';
import { PROJECT_STATUS } from '../../../contracts';
import { BallotProjectDto, BallotResponseDto } from '../../../contracts';

export interface BallotServiceDependencies {
  eventRepository: EventRepository;
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
  votingWindowService: VotingWindowService;
  randomFn?: (maxExclusive: number) => number;
}

export class BallotService {
  private readonly rng: (maxExclusive: number) => number;

  constructor(private readonly dependencies: BallotServiceDependencies) {
    this.rng = dependencies.randomFn ?? ((maxExclusive: number) => randomInt(0, maxExclusive));
  }

  async generateBallot(eventId: string): Promise<BallotResponseDto> {
    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Verify voting window is open
    this.dependencies.votingWindowService.assertVotingWindowOpen(event);

    const allProjects = await this.dependencies.projectRepository.findAll();
    
    // Filter submitted projects belonging to this event's teams
    const eligibleProjects: ProjectRecord[] = [];
    for (const p of allProjects) {
      if (p.status !== PROJECT_STATUS.SUBMITTED) continue;
      const team = await this.dependencies.teamRepository.findById(p.teamId);
      if (team && team.eventId === eventId) {
        eligibleProjects.push(p);
      }
    }

    // Perform unbiased Fisher-Yates shuffle using cryptographically strong RNG
    const shuffled = this.shuffle([...eligibleProjects]);

    const projectDtos: BallotProjectDto[] = shuffled.map((p: ProjectRecord) => ({
      id: p.id,
      title: p.title,
      summary: p.description ?? '',
      repoUrl: p.repositoryUrl ?? '',
      demoUrl: p.demoUrl ?? null,
      trackId: p.trackId,
    }));

    return {
      eventId: event.id,
      projects: projectDtos,
    };
  }

  /**
   * Unbiased Fisher-Yates shuffle algorithm.
   */
  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.rng(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
