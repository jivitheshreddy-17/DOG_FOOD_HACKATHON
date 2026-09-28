import { PrismaClient } from '@prisma/client';
import { TransactionManager } from '../../core/repositories';
import { AppRepositories } from '../../core/application/dependencies';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaSessionRepository } from './repositories/prisma-session.repository';
import { PrismaTeamRepository } from './repositories/prisma-team.repository';
import { PrismaTeamMemberRepository } from './repositories/prisma-team-member.repository';
import { PrismaProjectRepository } from './repositories/prisma-project.repository';
import { PrismaEventRepository } from './repositories/prisma-event.repository';
import { PrismaTrackRepository } from './repositories/prisma-track.repository';
import { PrismaRubricRepository } from './repositories/prisma-rubric.repository';
import { PrismaJudgeAssignmentRepository } from './repositories/prisma-judge-assignment.repository';
import { PrismaScoreRepository } from './repositories/prisma-score.repository';
import { PrismaNormalizationRepository } from './repositories/prisma-normalization.repository';
import { PrismaCommunityVoteRepository } from './repositories/prisma-community-vote.repository';
import { PrismaProjectCommentRepository } from './repositories/prisma-project-comment.repository';
import { PrismaVerificationTokenRepository } from './repositories/prisma-verification-token.repository';
import { PrismaAuditEventRepository } from './repositories/prisma-audit-event.repository';

export class PrismaTransactionManager implements TransactionManager {
  constructor(private readonly prismaClient: PrismaClient) {}

  async run<T>(operation: (repositories: AppRepositories) => Promise<T>): Promise<T> {
    return this.prismaClient.$transaction(async (tx) => {
      const txRepositories: AppRepositories = {
        userRepository: new PrismaUserRepository(tx),
        sessionRepository: new PrismaSessionRepository(tx),
        teamRepository: new PrismaTeamRepository(tx),
        teamMemberRepository: new PrismaTeamMemberRepository(tx),
        projectRepository: new PrismaProjectRepository(tx),
        eventRepository: new PrismaEventRepository(tx),
        trackRepository: new PrismaTrackRepository(tx),
        rubricRepository: new PrismaRubricRepository(tx as any),
        judgeAssignmentRepository: new PrismaJudgeAssignmentRepository(tx as any),
        scoreRepository: new PrismaScoreRepository(tx as any),
        normalizationRepository: new PrismaNormalizationRepository(tx as any),
        communityVoteRepository: new PrismaCommunityVoteRepository(tx),
        projectCommentRepository: new PrismaProjectCommentRepository(tx),
        verificationTokenRepository: new PrismaVerificationTokenRepository(tx),
        auditEventRepository: new PrismaAuditEventRepository(tx),
      };
      return operation(txRepositories);
    });
  }
}
