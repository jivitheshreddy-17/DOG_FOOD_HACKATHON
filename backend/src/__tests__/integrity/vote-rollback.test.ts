import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { randomUUID } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.client';
import { VotingService } from '../../modules/voting/services/voting.service';
import { VotingWindowService } from '../../modules/voting/services/voting-window.service';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user.repository';
import { PrismaEventRepository } from '../../infrastructure/database/repositories/prisma-event.repository';
import { PrismaProjectRepository } from '../../infrastructure/database/repositories/prisma-project.repository';
import { PrismaTeamRepository } from '../../infrastructure/database/repositories/prisma-team.repository';
import { PrismaCommunityVoteRepository } from '../../infrastructure/database/repositories/prisma-community-vote.repository';
import { PrismaAuditEventRepository } from '../../infrastructure/database/repositories/prisma-audit-event.repository';
import { TransactionManager } from '../../core/repositories';
import { AppRepositories } from '../../core/application/dependencies';
import { PrismaSessionRepository } from '../../infrastructure/database/repositories/prisma-session.repository';
import { PrismaTeamMemberRepository } from '../../infrastructure/database/repositories/prisma-team-member.repository';
import { PrismaTrackRepository } from '../../infrastructure/database/repositories/prisma-track.repository';
import { PrismaRubricRepository } from '../../infrastructure/database/repositories/prisma-rubric.repository';
import { PrismaJudgeAssignmentRepository } from '../../infrastructure/database/repositories/prisma-judge-assignment.repository';
import { PrismaScoreRepository } from '../../infrastructure/database/repositories/prisma-score.repository';
import { PrismaNormalizationRepository } from '../../infrastructure/database/repositories/prisma-normalization.repository';
import { PrismaProjectCommentRepository } from '../../infrastructure/database/repositories/prisma-project-comment.repository';
import { PrismaVerificationTokenRepository } from '../../infrastructure/database/repositories/prisma-verification-token.repository';

class FaultyTransactionManager implements TransactionManager {
  constructor(private readonly prismaClient: any) {}
  async run<T>(operation: (repositories: AppRepositories) => Promise<T>): Promise<T> {
    return this.prismaClient.$transaction(async (tx: any) => {
      const txRepositories: AppRepositories = {
        userRepository: new PrismaUserRepository(tx),
        sessionRepository: new PrismaSessionRepository(tx),
        teamRepository: new PrismaTeamRepository(tx),
        teamMemberRepository: new PrismaTeamMemberRepository(tx),
        projectRepository: new PrismaProjectRepository(tx),
        eventRepository: new PrismaEventRepository(tx),
        trackRepository: new PrismaTrackRepository(tx),
        rubricRepository: new PrismaRubricRepository(tx),
        judgeAssignmentRepository: new PrismaJudgeAssignmentRepository(tx),
        scoreRepository: new PrismaScoreRepository(tx),
        normalizationRepository: new PrismaNormalizationRepository(tx),
        communityVoteRepository: new PrismaCommunityVoteRepository(tx),
        projectCommentRepository: new PrismaProjectCommentRepository(tx),
        verificationTokenRepository: new PrismaVerificationTokenRepository(tx),
        auditEventRepository: {
          create: async () => { throw new Error('Injected audit failure'); },
          findByEventId: async () => [],
        } as any,
      };
      return operation(txRepositories);
    });
  }
}

describe('Integrity - Vote Transaction Rollback', () => {
  let eventId = randomUUID();
  let trackId = randomUUID();
  let teamId = randomUUID();
  let projectId = randomUUID();

  before(async () => {
    await prisma.event.create({ data: { id: eventId, name: 'T1', votingMode: 'AUTHENTICATED', submissionsClose: new Date() }});
    await prisma.track.create({ data: { id: trackId, name: 'T1', eventId }});
    await prisma.team.create({ data: { id: teamId, name: 'T1', eventId, inviteTokenHash: 'T1' }});
    await prisma.project.create({ data: { id: projectId, title: 'P1', summary: 'P1', repoUrl: 'P1', teamId, trackId, status: 'SUBMITTED', submittedAt: new Date() }});
  });

  after(async () => {
    await prisma.project.deleteMany({ where: { id: projectId }});
    await prisma.team.deleteMany({ where: { id: teamId }});
    await prisma.track.deleteMany({ where: { id: trackId }});
    await prisma.event.deleteMany({ where: { id: eventId }});
    await prisma.$disconnect();
  });

  test('Rollback on audit failure', async () => {
    const deps = {
      eventRepository: new PrismaEventRepository(prisma),
      projectRepository: new PrismaProjectRepository(prisma),
      teamRepository: new PrismaTeamRepository(prisma),
      communityVoteRepository: new PrismaCommunityVoteRepository(prisma),
      auditEventRepository: new PrismaAuditEventRepository(prisma),
      transactionManager: new FaultyTransactionManager(prisma),
      votingWindowService: new VotingWindowService({ now: () => new Date() }),
    };
    const svc = new VotingService(deps);

    let failed = false;
    try {
      await svc.submitVote({
        eventId,
        projectId,
        voterIdentity: 'voter1',
        voterType: 'AUTHENTICATED',
      });
    } catch (err: any) {
      assert.strictEqual(err.message, 'Injected audit failure');
      failed = true;
    }
    assert.ok(failed);

    const votes = await prisma.communityVote.count({ where: { eventId, voterIdentity: 'voter1' }});
    assert.strictEqual(votes, 0, 'Vote should not have persisted');
    
    const audits = await prisma.auditEvent.count({ where: { eventId, action: 'VOTE_SUBMITTED' }});
    assert.strictEqual(audits, 0, 'Audit should not have persisted');
  });
});
