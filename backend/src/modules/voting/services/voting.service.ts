import {
  EventRepository,
  ProjectRepository,
  TeamRepository,
  CommunityVoteRepository,
  AuditEventRepository,
  TransactionManager,
  CommunityVoteDTO,
} from '../../../core/repositories';
import { VotingWindowService } from './voting-window.service';
import {
  NotFoundError,
  ValidationError,
  InvalidVotingModeError,
  DuplicateVoteError,
  VoteLimitExceededError,
} from '../../../core/errors';
import { VotingModeDto, PROJECT_STATUS } from '../../../contracts';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimitExceededError } from './otp.service';

export interface VotingServiceDependencies {
  eventRepository: EventRepository;
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
  communityVoteRepository: CommunityVoteRepository;
  auditEventRepository?: AuditEventRepository;
  transactionManager: TransactionManager;
  votingWindowService: VotingWindowService;
  rateLimiter?: RateLimiterService;
}

export interface SubmitVoteParams {
  eventId: string;
  projectId: string;
  voterIdentity: string;
  voterType: VotingModeDto;
  userId?: string | null;
}

export class VotingService {
  constructor(private readonly dependencies: VotingServiceDependencies) {}

  async submitVote(params: SubmitVoteParams): Promise<CommunityVoteDTO> {
    const { eventId, projectId, voterIdentity, voterType, userId } = params;

    // 1. Resolve event
    const event = await this.dependencies.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Rate limit check
    if (this.dependencies.rateLimiter) {
      const rlKey = `vote_submit:${eventId}:${voterIdentity}`;
      if (!(await this.dependencies.rateLimiter.checkLimit(rlKey, 5, 60 * 1000))) {
        throw new RateLimitExceededError();
      }
    }

    // 2. Validate voting window & mode
    this.dependencies.votingWindowService.assertVotingWindowOpen(event);

    // 3. Verify access mode alignment
    const expectedMode = event.votingMode ?? 'AUTHENTICATED';
    if (expectedMode === 'DISABLED') {
      throw new InvalidVotingModeError(`Community voting is disabled for event '${eventId}'`);
    }
    if (voterType !== expectedMode) {
      throw new InvalidVotingModeError(
        `Voting mode '${voterType}' does not match event configuration '${expectedMode}'`
      );
    }

    // 4. Resolve project
    const project = await this.dependencies.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.status !== PROJECT_STATUS.SUBMITTED) {
      throw new ValidationError('Project is not submitted and cannot receive votes');
    }

    // 5. Verify project belongs to the event (prevent IDOR)
    const team = await this.dependencies.teamRepository.findById(project.teamId);
    if (!team || team.eventId !== eventId) {
      throw new NotFoundError('Project does not belong to the requested event');
    }

    // 6. Execute atomic vote creation inside TransactionManager with concurrency protection
    try {
      return await this.dependencies.transactionManager.run(async (repos) => {
        const voteRepo = repos.communityVoteRepository ?? this.dependencies.communityVoteRepository;
        const auditRepo = repos.auditEventRepository ?? this.dependencies.auditEventRepository;

        let unlock: (() => void) | void = undefined;
        if (typeof voteRepo.lockVoterForEvent === 'function') {
          unlock = await voteRepo.lockVoterForEvent(eventId, voterIdentity);
        }

        try {
          // Check duplicate vote
          const existingVote = await voteRepo.findByUnique(eventId, voterIdentity, projectId);
          if (existingVote) {
            throw new DuplicateVoteError();
          }

          // Check maxVotesPerVoter limit
          const currentVoteCount = await voteRepo.countByVoter(eventId, voterIdentity);
          const maxLimit = event.maxVotesPerVoter ?? 1;
          if (currentVoteCount >= maxLimit) {
            throw new VoteLimitExceededError(
              `Voter has reached maximum allowed limit of ${maxLimit} distinct project votes`
            );
          }

          // Create vote
          const vote = await voteRepo.create({
            eventId,
            projectId,
            voterIdentity,
            voterType,
            userId: userId ?? null,
            points: 1,
          });

          // Audit log
          if (auditRepo) {
            await auditRepo.create({
              eventId,
              action: 'VOTE_SUBMITTED',
              severity: 'INFO',
              actor: voterIdentity,
              details: { projectId, voterType, userId },
            });
          }

          return vote;
        } finally {
          if (typeof unlock === 'function') {
            unlock();
          }
        }
      });
    } catch (err: any) {
      // Catch Prisma P2002 unique constraint failure fallback
      if (err.code === 'P2002' || (err.message && err.message.includes('Unique constraint'))) {
        throw new DuplicateVoteError();
      }
      throw err;
    }
  }
}
