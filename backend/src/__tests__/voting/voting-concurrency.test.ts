import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../infrastructure/database/prisma.client';
import { PrismaTransactionManager } from '../../infrastructure/database/prisma.transaction';
import { VotingService } from '../../modules/voting/services/voting.service';
import { VotingWindowService } from '../../modules/voting/services/voting-window.service';
import { PrismaEventRepository } from '../../infrastructure/database/repositories/prisma-event.repository';
import { PrismaProjectRepository } from '../../infrastructure/database/repositories/prisma-project.repository';
import { PrismaTeamRepository } from '../../infrastructure/database/repositories/prisma-team.repository';
import { PrismaCommunityVoteRepository } from '../../infrastructure/database/repositories/prisma-community-vote.repository';
import { AppRepositories } from '../../core/application/dependencies';

describe('Voting Concurrency (maxVotesPerVoter)', () => {
  const eventId = 'test-evt-concurrent';
  const trackId = 'test-track-concurrent';
  const teamId = 'test-team-concurrent';
  const projectId1 = 'test-proj-concurrent-1';
  const projectId2 = 'test-proj-concurrent-2';

  before(async () => {
    // Setup event with maxVotesPerVoter = 1
    await prisma.event.upsert({
      where: { id: eventId },
      update: {},
      create: { 
        id: eventId, 
        name: 'Concurrent Event', 
        submissionsClose: new Date(),
        votingMode: 'AUTHENTICATED',
        votingStartsAt: new Date(Date.now() - 100000),
        votingEndsAt: new Date(Date.now() + 100000),
        maxVotesPerVoter: 1,
      }
    });
    await prisma.track.upsert({
      where: { id: trackId },
      update: {},
      create: { id: trackId, name: 'T3 Track', eventId }
    });
    await prisma.team.upsert({
      where: { id: teamId },
      update: {},
      create: { id: teamId, name: 'T3 Team', eventId }
    });
    await prisma.project.upsert({
      where: { id: projectId1 },
      update: {},
      create: { id: projectId1, title: 'Proj 1', summary: '', repoUrl: '', submittedAt: new Date(), teamId, trackId, status: 'SUBMITTED' }
    });
    await prisma.project.upsert({
      where: { id: projectId2 },
      update: {},
      create: { id: projectId2, title: 'Proj 2', summary: '', repoUrl: '', submittedAt: new Date(), teamId, trackId, status: 'SUBMITTED' }
    });
  });

  after(async () => {
    await prisma.communityVote.deleteMany({ where: { eventId } });
    await prisma.project.deleteMany({ where: { teamId } });
    await prisma.team.delete({ where: { id: teamId } });
    await prisma.track.delete({ where: { id: trackId } });
    await prisma.event.delete({ where: { id: eventId } });
  });

  it('serializes same voter across different projects (maxVotesPerVoter = 1)', async () => {
    const txManager = new PrismaTransactionManager(prisma);
    const eventRepo = new PrismaEventRepository(prisma);
    const projectRepo = new PrismaProjectRepository(prisma);
    const teamRepo = new PrismaTeamRepository(prisma);
    const voteRepo = new PrismaCommunityVoteRepository(prisma);

    const clock = { now: () => new Date() };
    const votingWindowService = new VotingWindowService(clock as any);

    const votingService = new VotingService({
      eventRepository: eventRepo,
      projectRepository: projectRepo,
      teamRepository: teamRepo,
      communityVoteRepository: voteRepo,
      transactionManager: txManager,
      votingWindowService,
    });

    const voterIdentity = 'concurrent_voter_1';

    // Start two votes for the *same* voter but *different* projects concurrently
    const results = await Promise.allSettled([
      votingService.submitVote({
        eventId,
        projectId: projectId1,
        voterIdentity,
        voterType: 'AUTHENTICATED',
      }),
      votingService.submitVote({
        eventId,
        projectId: projectId2,
        voterIdentity,
        voterType: 'AUTHENTICATED',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    if (rejected.length > 0) {
      console.log('Rejections (same voter):', rejected.map(r => (r as any).reason));
    }

    // Only one should succeed
    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);

    const finalCount = await prisma.communityVote.count({
      where: { eventId, voterIdentity }
    });
    assert.strictEqual(finalCount, 1);
  });

  it('allows different voters to vote concurrently without blocking each other', async () => {
    const txManager = new PrismaTransactionManager(prisma);
    const eventRepo = new PrismaEventRepository(prisma);
    const projectRepo = new PrismaProjectRepository(prisma);
    const teamRepo = new PrismaTeamRepository(prisma);
    const voteRepo = new PrismaCommunityVoteRepository(prisma);

    const clock = { now: () => new Date() };
    const votingWindowService = new VotingWindowService(clock as any);

    const votingService = new VotingService({
      eventRepository: eventRepo,
      projectRepository: projectRepo,
      teamRepository: teamRepo,
      communityVoteRepository: voteRepo,
      transactionManager: txManager,
      votingWindowService,
    });

    const voter1 = 'voter_A';
    const voter2 = 'voter_B';

    // Start two votes concurrently for DIFFERENT voters
    const results = await Promise.allSettled([
      votingService.submitVote({
        eventId,
        projectId: projectId1,
        voterIdentity: voter1,
        voterType: 'AUTHENTICATED',
      }),
      votingService.submitVote({
        eventId,
        projectId: projectId1,
        voterIdentity: voter2,
        voterType: 'AUTHENTICATED',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    if (rejected.length > 0) {
      console.log('Rejections (diff voters):', rejected.map(r => (r as any).reason));
    }

    // Both should succeed
    assert.strictEqual(fulfilled.length, 2);
    assert.strictEqual(rejected.length, 0);

    const count1 = await prisma.communityVote.count({ where: { eventId, voterIdentity: voter1 } });
    const count2 = await prisma.communityVote.count({ where: { eventId, voterIdentity: voter2 } });
    assert.strictEqual(count1, 1);
    assert.strictEqual(count2, 1);
  });
});
