import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { randomUUID } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.client';
import { JudgingService } from '../../modules/judging/judging.service';
import { PrismaJudgeAssignmentRepository } from '../../infrastructure/database/repositories/prisma-judge-assignment.repository';
import { PrismaRubricRepository } from '../../infrastructure/database/repositories/prisma-rubric.repository';
import { PrismaScoreRepository } from '../../infrastructure/database/repositories/prisma-score.repository';
import { PrismaTransactionManager } from '../../infrastructure/database/prisma.transaction';

describe('Integrity - Concurrent Judge Score Updates', () => {
  let eventId = randomUUID();
  let trackId = randomUUID();
  let teamId = randomUUID();
  let projectId = randomUUID();
  let judgeId = randomUUID();
  let rubricId = randomUUID();
  let criterionId = randomUUID();
  let assignmentId = randomUUID();

  before(async () => {
    await prisma.user.create({ data: { id: judgeId, email: `judge_${judgeId}@test.com`, name: 'J1', role: 'JUDGE', passwordHash: 'hash' }});
    await prisma.event.create({ data: { id: eventId, name: 'T2', votingMode: 'AUTHENTICATED', submissionsClose: new Date() }});
    await prisma.track.create({ data: { id: trackId, name: 'T2', eventId }});
    await prisma.team.create({ data: { id: teamId, name: 'T2', eventId, inviteTokenHash: 'T2' }});
    await prisma.project.create({ data: { id: projectId, title: 'P2', summary: 'P2', repoUrl: 'P2', teamId, trackId, status: 'SUBMITTED', submittedAt: new Date() }});
    
    await prisma.rubric.create({ data: { id: rubricId, eventId, name: 'R2' }});
    await prisma.rubricCriterion.create({ data: { id: criterionId, rubricId, name: 'C2', weight: 1, order: 1 }});

    await prisma.judgeAssignment.create({ data: { id: assignmentId, eventId, projectId, judgeId, trackId, status: 'PENDING', version: 1 }});
  });

  after(async () => {
    await prisma.scoreCriterion.deleteMany({ where: { criterionId }});
    await prisma.score.deleteMany({ where: { assignmentId }});
    await prisma.judgeAssignment.deleteMany({ where: { id: assignmentId }});
    await prisma.rubricCriterion.deleteMany({ where: { id: criterionId }});
    await prisma.rubric.deleteMany({ where: { id: rubricId }});
    await prisma.project.deleteMany({ where: { id: projectId }});
    await prisma.team.deleteMany({ where: { id: teamId }});
    await prisma.track.deleteMany({ where: { id: trackId }});
    await prisma.event.deleteMany({ where: { id: eventId }});
    await prisma.user.deleteMany({ where: { id: judgeId }});
    await prisma.$disconnect();
  });

  test('Race condition on score submit', async () => {
    const deps = {
      judgeAssignmentRepository: new PrismaJudgeAssignmentRepository(prisma),
      rubricRepository: new PrismaRubricRepository(prisma),
      scoreRepository: new PrismaScoreRepository(prisma),
      transactionManager: new PrismaTransactionManager(prisma) as any,
      projectRepository: {} as any,
      trackRepository: {} as any,
      userRepository: {} as any,
      eventRepository: {} as any,
    };
    const svc = new JudgingService(deps);

    // Provide two concurrent requests. 
    // Wait! Since scoreRepository.upsert is NOT in a transaction, the second request will overwrite the first request's scores.
    // And then OCC will fail for the second request, but the scores are already overwritten.
    
    // Req 1 writes value: 5
    // Req 2 writes value: 1
    const p1 = svc.submitScore(assignmentId, judgeId, {
      status: 'SUBMITTED',
      comment: 'good',
      scores: [{ criterionId, value: 5 }],
      expectedVersion: 1
    } as any);

    // We can simulate race by simply calling them together without artificial delay
    const p2 = svc.submitScore(assignmentId, judgeId, {
      status: 'SUBMITTED',
      comment: 'bad',
      scores: [{ criterionId, value: 1 }],
      expectedVersion: 1
    } as any);

    const results = await Promise.allSettled([p1, p2]);
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one should succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one should fail');
    
    // Wait, since they execute concurrently, we don't know which one failed.
    // If we want a deterministic lost update, we can just check the DB.
    // The successful one will increment the version.
    // But does the DB match the successful one?
    const successfulReq = fulfilled[0] as PromiseFulfilledResult<any>;
    
    const scoreInDb = await prisma.scoreCriterion.findFirst({ where: { criterionId }});
    
    // If bug exists, score in DB might be 1 (from bad) while p1 succeeded (value 5)
    // Actually, we just need to verify consistency: the DB should match the fulfilled result
    const fulfilledValue = successfulReq.value.criteria[0].value;
    
    // Wait, the DB could be mutated AFTER p1 succeeded.
    assert.strictEqual(scoreInDb?.value, fulfilledValue, 'Database score should match the successful request (Lost Update detected)');
  });
});
