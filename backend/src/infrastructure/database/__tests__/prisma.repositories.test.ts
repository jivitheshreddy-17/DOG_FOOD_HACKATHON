import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../prisma.client';
import { PrismaUserRepository } from '../repositories/prisma-user.repository';
import { PrismaTeamRepository } from '../repositories/prisma-team.repository';
import { PrismaSessionRepository } from '../repositories/prisma-session.repository';
import { PrismaProjectRepository } from '../repositories/prisma-project.repository';
import { createHash } from 'crypto';

describe('Prisma Repositories Integration', () => {
  before(async () => {
    await prisma.event.create({
      data: { id: 'test-event-1', name: 'Test Event', submissionsClose: new Date() }
    });
    await prisma.user.create({
      data: { id: 'test-user-for-session', email: 'test@session.com', name: 'Test', passwordHash: 'hash' }
    });
    await prisma.track.create({
      data: { id: 'test-track-1', eventId: 'test-event-1', name: 'Test Track' }
    });
  });

  after(async () => {
    await prisma.track.deleteMany({ where: { id: 'test-track-1' } });
    await prisma.user.deleteMany({ where: { id: 'test-user-for-session' } });
    await prisma.event.deleteMany({ where: { id: 'test-event-1' } });
  });

  it('should verify Team raw tokens are never persisted', async () => {
    const teamRepo = new PrismaTeamRepository(prisma);

    const rawInviteToken = 'secret-raw-invite-token';
    const expectedHash = createHash('sha256').update(rawInviteToken).digest('hex');

    const team = await teamRepo.create({
      id: 'test-team-123',
      name: 'Security Test Team',
      eventId: 'test-event-1',
      inviteToken: rawInviteToken
    });

    assert.strictEqual(team.inviteToken, undefined);
    assert.strictEqual(team.inviteTokenHash, expectedHash);

    // Verify in db
    const dbTeam = await prisma.team.findUnique({ where: { id: 'test-team-123' } });
    assert.strictEqual((dbTeam as any).inviteToken, undefined); // Prisma schema doesn't even have this column
    assert.strictEqual(dbTeam?.inviteTokenHash, expectedHash);

    // Verify find works
    const found = await teamRepo.findByInviteToken(rawInviteToken);
    assert.strictEqual(found?.id, 'test-team-123');

    // Cleanup
    await prisma.team.delete({ where: { id: 'test-team-123' } });
  });

  it('should verify Session raw tokens are never persisted', async () => {
    const sessionRepo = new PrismaSessionRepository(prisma);

    const rawToken = 'secret-raw-session-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const session = await sessionRepo.create({
      id: 'test-session-123',
      userId: 'test-user-for-session',
      tokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 100000)
    });

    assert.strictEqual(session.tokenHash, tokenHash);

    const dbSession = await prisma.session.findUnique({ where: { id: 'test-session-123' } });
    assert.strictEqual((dbSession as any).token, undefined);
    assert.strictEqual(dbSession?.tokenHash, tokenHash);

    await sessionRepo.delete('test-session-123');
  });

  it('should verify Project demoUrl bidirectional mapping', async () => {
    const projectRepo = new PrismaProjectRepository(prisma);
    
    // Create team first
    await prisma.team.create({
      data: { id: 'test-team-project', name: 'p', eventId: 'test-event-1' }
    });

    const project = await projectRepo.create({
      id: 'test-project-1',
      teamId: 'test-team-project',
      trackId: 'test-track-1',
      title: 'Test Project',
      description: 'Domain summary',
      repositoryUrl: 'https://github.com/repo',
      demoUrl: 'https://demo.com',
      status: 'SUBMITTED',
    });

    assert.strictEqual(project.description, 'Domain summary');
    assert.strictEqual(project.demoUrl, 'https://demo.com');
    assert.strictEqual(project.repositoryUrl, 'https://github.com/repo');

    // Verify Prisma schema fields
    const dbProject = await prisma.project.findUnique({ where: { id: 'test-project-1' } });
    assert.strictEqual(dbProject?.summary, 'Domain summary');
    assert.strictEqual(dbProject?.repoUrl, 'https://github.com/repo');
    assert.strictEqual(dbProject?.demoUrl, 'https://demo.com');

    // Cleanup
    await prisma.project.delete({ where: { id: 'test-project-1' } });
    await prisma.team.delete({ where: { id: 'test-team-project' } });
  });
});
