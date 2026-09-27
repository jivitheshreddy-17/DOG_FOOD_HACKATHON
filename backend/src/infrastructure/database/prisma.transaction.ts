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
      };
      return operation(txRepositories);
    });
  }
}
