import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VotingConfigService } from '../../modules/voting/services/voting-config.service';
import { VotingWindowService } from '../../modules/voting/services/voting-window.service';
import { BallotService } from '../../modules/voting/services/ballot.service';
import { VotingService } from '../../modules/voting/services/voting.service';
import { EventRepository, EventRecord, ProjectRepository, ProjectRecord, TeamRepository, TeamRecord, CommunityVoteRepository, CommunityVoteDTO, TransactionManager } from '../../core/repositories';
import { InvalidVotingModeError, VotingNotOpenError, VotingClosedError, NotFoundError, ValidationError, DuplicateVoteError, VoteLimitExceededError } from '../../core/errors';
import { PROJECT_STATUS } from '../../contracts';

// -- Mocks --
class TestClock {
  public currentTime: Date;
  constructor(initialTime: Date) { this.currentTime = initialTime; }
  now(): Date { return new Date(this.currentTime); }
}

class MockEventRepository implements EventRepository {
  public events = new Map<string, EventRecord>();
  async findById(id: string): Promise<EventRecord | null> {
    const evt = this.events.get(id);
    return evt ? { ...evt } : null;
  }
  async updateVotingConfig(id: string, config: Partial<EventRecord>): Promise<EventRecord> {
    const evt = this.events.get(id);
    if (!evt) throw new NotFoundError('Event not found');
    const updated = { ...evt, ...config };
    this.events.set(id, updated);
    return { ...updated };
  }
}

class MockProjectRepository implements ProjectRepository {
  public projects = new Map<string, ProjectRecord>();
  async findById(id: string): Promise<ProjectRecord | null> {
    const p = this.projects.get(id);
    return p ? { ...p } : null;
  }
  async findByTeamId(teamId: string): Promise<ProjectRecord | null> {
    for (const p of this.projects.values()) {
      if (p.teamId === teamId) return { ...p };
    }
    return null;
  }
  async findAll(): Promise<ProjectRecord[]> {
    return Array.from(this.projects.values()).map(p => ({ ...p }));
  }
  async create(data: any): Promise<ProjectRecord> { throw new Error('Not implemented'); }
  async update(id: string, data: any): Promise<ProjectRecord> { throw new Error('Not implemented'); }
}

class MockTeamRepository implements TeamRepository {
  public teams = new Map<string, TeamRecord>();
  async findById(id: string): Promise<TeamRecord | null> {
    const t = this.teams.get(id);
    return t ? { ...t } : null;
  }
  async findByInviteToken(token: string): Promise<TeamRecord | null> { return null; }
  async findByInviteTokenHash(tokenHash: string): Promise<TeamRecord | null> { return null; }
  async create(data: any): Promise<TeamRecord> { throw new Error('Not implemented'); }
  async update(id: string, data: any): Promise<TeamRecord> { throw new Error('Not implemented'); }
}

class MockCommunityVoteRepository implements CommunityVoteRepository {
  public votes: CommunityVoteDTO[] = [];
  private activeLocks = new Map<string, Promise<void>>();

  async lockVoterForEvent(eventId: string, voterIdentity: string): Promise<() => void> {
    const key = `${eventId}:${voterIdentity}`;
    let releaseLock: () => void = () => {};
    const newLock = new Promise<void>((resolve) => { releaseLock = resolve; });
    const previousLock = this.activeLocks.get(key);
    this.activeLocks.set(key, newLock);
    if (previousLock) await previousLock;
    return () => { releaseLock(); };
  }

  async create(input: any): Promise<CommunityVoteDTO> {
    const v: CommunityVoteDTO = {
      id: `vote_${this.votes.length + 1}`,
      eventId: input.eventId,
      projectId: input.projectId,
      voterIdentity: input.voterIdentity,
      voterType: input.voterType,
      userId: input.userId ?? null,
      points: input.points ?? 1,
      createdAt: new Date(),
    };
    this.votes.push(v);
    return v;
  }
  async findByUnique(eventId: string, voterIdentity: string, projectId: string): Promise<CommunityVoteDTO | null> {
    return this.votes.find(v => v.eventId === eventId && v.voterIdentity === voterIdentity && v.projectId === projectId) ?? null;
  }
  async countByVoter(eventId: string, voterIdentity: string): Promise<number> {
    return this.votes.filter(v => v.eventId === eventId && v.voterIdentity === voterIdentity).length;
  }
  async countByProject(eventId: string, projectId: string): Promise<number> {
    return this.votes.filter(v => v.eventId === eventId && v.projectId === projectId).length;
  }
  async listByEvent(eventId: string): Promise<CommunityVoteDTO[]> {
    return this.votes.filter(v => v.eventId === eventId);
  }
}

class MockTransactionManager implements TransactionManager {
  constructor(private readonly repos: any) {}
  async run<T>(operation: (repositories: any) => Promise<T>): Promise<T> {
    return operation(this.repos);
  }
}

describe('Voting Domain Phase 2C', () => {
  it('Config Validation, Window, Ballot, and Concurrency Limits', async () => {
    const baseTime = new Date('2026-06-01T12:00:00Z');
    const clock = new TestClock(baseTime);

    const eventRepo = new MockEventRepository();
    const projectRepo = new MockProjectRepository();
    const teamRepo = new MockTeamRepository();
    const voteRepo = new MockCommunityVoteRepository();
    const txManager = new MockTransactionManager({ communityVoteRepository: voteRepo });

    const configService = new VotingConfigService({ eventRepository: eventRepo });
    const votingWindowService = new VotingWindowService(clock as any);
    const ballotService = new BallotService({ eventRepository: eventRepo, projectRepository: projectRepo, teamRepository: teamRepo, votingWindowService });
    const votingService = new VotingService({
      eventRepository: eventRepo,
      projectRepository: projectRepo,
      teamRepository: teamRepo,
      communityVoteRepository: voteRepo,
      transactionManager: txManager,
      votingWindowService,
    });

    const eventId = 'evt_01';
    const startWindow = new Date('2026-06-01T00:00:00Z');
    const endWindow = new Date('2026-06-07T23:59:59Z');

    eventRepo.events.set(eventId, {
      id: eventId,
      name: 'Hackathon 2026',
      votingMode: 'AUTHENTICATED',
      votingStartsAt: startWindow,
      votingEndsAt: endWindow,
      isResultsPublished: false,
      maxVotesPerVoter: 2,
    });

    const team1: TeamRecord = { id: 'team_01', name: 'Alpha', inviteTokenHash: 'tok1', eventId, createdAt: baseTime, updatedAt: baseTime };
    teamRepo.teams.set(team1.id, team1);

    const proj1: ProjectRecord = {
      id: 'proj_alpha', title: 'Alpha AI', teamId: team1.id, trackId: 'trk_ai', status: PROJECT_STATUS.SUBMITTED, description: '', createdAt: baseTime, updatedAt: baseTime
    };
    const proj2: ProjectRecord = {
      id: 'proj_beta', title: 'Beta Cloud', teamId: team1.id, trackId: 'trk_cloud', status: PROJECT_STATUS.SUBMITTED, description: '', createdAt: baseTime, updatedAt: baseTime
    };
    const projDraft: ProjectRecord = {
      id: 'proj_draft', title: 'Draft', teamId: team1.id, trackId: 'trk_ai', status: PROJECT_STATUS.DRAFT, description: '', createdAt: baseTime, updatedAt: baseTime
    };
    projectRepo.projects.set(proj1.id, proj1);
    projectRepo.projects.set(proj2.id, proj2);
    projectRepo.projects.set(projDraft.id, projDraft);

    // Config Check
    const config = await configService.getVotingConfig(eventId);
    assert.strictEqual(config.votingMode, 'AUTHENTICATED');

    // Voting Window Checks
    clock.currentTime = new Date('2026-05-01T00:00:00Z'); // Before start
    assert.rejects(async () => { votingWindowService.assertVotingWindowOpen(eventRepo.events.get(eventId)!); }, VotingNotOpenError);

    clock.currentTime = new Date('2026-07-01T00:00:00Z'); // After end
    assert.rejects(async () => { votingWindowService.assertVotingWindowOpen(eventRepo.events.get(eventId)!); }, VotingClosedError);

    clock.currentTime = new Date('2026-06-02T12:00:00Z'); // Active

    // IDOR Rejections
    const otherTeam: TeamRecord = { id: 'team_other', name: 'Other', inviteTokenHash: 'tok2', eventId: 'other_event', createdAt: baseTime, updatedAt: baseTime };
    teamRepo.teams.set(otherTeam.id, otherTeam);
    const projOther: ProjectRecord = { ...proj1, id: 'proj_other', teamId: otherTeam.id };
    projectRepo.projects.set(projOther.id, projOther);

    await assert.rejects(async () => {
      await votingService.submitVote({ eventId, projectId: projOther.id, voterIdentity: 'usr_789', voterType: 'AUTHENTICATED' });
    }, NotFoundError);

    await assert.rejects(async () => {
      await votingService.submitVote({ eventId, projectId: projDraft.id, voterIdentity: 'usr_789', voterType: 'AUTHENTICATED' });
    }, ValidationError);

    // Successful Vote
    const vote1 = await votingService.submitVote({ eventId, projectId: proj1.id, voterIdentity: 'usr_789', voterType: 'AUTHENTICATED' });
    assert.strictEqual(vote1.projectId, proj1.id);

    // Duplicate Vote rejection
    await assert.rejects(async () => {
      await votingService.submitVote({ eventId, projectId: proj1.id, voterIdentity: 'usr_789', voterType: 'AUTHENTICATED' });
    }, DuplicateVoteError);

    // Concurrency Max Vote Limitation
    const singleVoteEventId = 'evt_single_vote';
    eventRepo.events.set(singleVoteEventId, { ...eventRepo.events.get(eventId)!, id: singleVoteEventId, maxVotesPerVoter: 1 });
    const teamSingle: TeamRecord = { id: 'team_s', name: 'S', inviteTokenHash: 'toks', eventId: singleVoteEventId, createdAt: baseTime, updatedAt: baseTime };
    teamRepo.teams.set(teamSingle.id, teamSingle);
    const projS1: ProjectRecord = { ...proj1, id: 'proj_s1', teamId: teamSingle.id };
    const projS2: ProjectRecord = { ...proj2, id: 'proj_s2', teamId: teamSingle.id };
    projectRepo.projects.set(projS1.id, projS1);
    projectRepo.projects.set(projS2.id, projS2);

    const voterId = 'concurrent_voter';
    const results = await Promise.allSettled([
      votingService.submitVote({ eventId: singleVoteEventId, projectId: projS1.id, voterIdentity: voterId, voterType: 'AUTHENTICATED' }),
      votingService.submitVote({ eventId: singleVoteEventId, projectId: projS2.id, voterIdentity: voterId, voterType: 'AUTHENTICATED' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);

    // Ballot generation
    const ballot = await ballotService.generateBallot(eventId);
    assert.strictEqual(ballot.eventId, eventId);
    assert.strictEqual(ballot.projects.length, 2); // Excludes projOther and projDraft
  });
});
