import { test } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../src/infrastructure/database/prisma.client';
import { createApp } from '../src/app';
import { AuthenticatedUser } from '@hackathon/contracts';
import { PrismaNormalizationRepository } from '../src/infrastructure/database/repositories/prisma-normalization.repository';
import { PrismaScoreRepository } from '../src/infrastructure/database/repositories/prisma-score.repository';
import { PrismaRubricRepository } from '../src/infrastructure/database/repositories/prisma-rubric.repository';
import { PrismaJudgeAssignmentRepository } from '../src/infrastructure/database/repositories/prisma-judge-assignment.repository';
import { NormalizationEngine } from '../src/core/domain/normalization';
import { NormalizationService } from '../src/modules/normalization/normalization.service';

test('2D5 Integration Verification', async (t) => {
  const eventId = 'test-event-' + Date.now();
  const rubricId = 'test-rubric-' + Date.now();
  const teamId = 'team-' + Date.now();
  const trackId = 'track-' + Date.now();

  // Create mock event and rubric
  await prisma.event.create({
    data: { id: eventId, name: 'Integration Event', submissionsClose: new Date() }
  });
  await prisma.track.create({
    data: { id: trackId, name: 'Track', eventId }
  });
  await prisma.team.create({
    data: { id: teamId, name: 'Team', eventId }
  });
  
  const crit1Id = 'crit1-' + Date.now();
  const crit2Id = 'crit2-' + Date.now();
  
  await prisma.rubric.create({
    data: { id: rubricId, name: 'Integration Rubric', eventId,
      criteria: { create: [
        { id: crit1Id, name: 'Crit1', weight: 1 },
        { id: crit2Id, name: 'Crit2', weight: 2 }
      ]}
    }
  });


  const auth: AuthenticatedUser = { id: 'admin1', role: 'ADMIN' };
  
  const service = new NormalizationService({
    normalizationRepository: new PrismaNormalizationRepository(prisma),
    scoreRepository: new PrismaScoreRepository(prisma),
    rubricRepository: new PrismaRubricRepository(prisma),
    judgeAssignmentRepository: new PrismaJudgeAssignmentRepository(prisma),
    engine: new NormalizationEngine()
  });

  await t.test('4/5. Atomicity & 7. Provenance (SUCCESS/FAILED)', async () => {
    const pId = 'p1-' + Date.now();
    const jId = 'j1-' + Date.now();
    const aId = 'a1-' + Date.now();
    const sId = 's1-' + Date.now();
    const scId = 'sc1-' + Date.now();

    await prisma.project.create({ data: { id: pId, title: 'P1', summary: '', repoUrl: '', submittedAt: new Date(), teamId, trackId }});
    await prisma.user.create({ data: { id: jId, email: jId + '@example.com', name: 'J1', passwordHash: '', role: 'JUDGE' }});
    
    // We expect service to throw when no completed assignments exist. 
    // This is Atomicity (nothing is created in DB).
    await assert.rejects(
      service.triggerNormalization(eventId, auth, { maxIterations: 100 }),
      /No completed assignments to normalize/
    );

    const dbRunFail = await prisma.normalizationRun.findFirst({ where: { eventId } });
    assert.strictEqual(dbRunFail, null);

    // Now create a valid assignment that actually converges
    const pId2 = 'p2-' + Date.now();
    const pId3 = 'p3-' + Date.now();
    const jId2 = 'j2-' + Date.now();
    const jId3 = 'j3-' + Date.now();
    
    await prisma.project.create({ data: { id: pId2, title: 'P2', summary: '', repoUrl: '', submittedAt: new Date(), teamId, trackId }});
    await prisma.project.create({ data: { id: pId3, title: 'P3', summary: '', repoUrl: '', submittedAt: new Date(), teamId, trackId }});
    await prisma.user.create({ data: { id: jId2, email: jId2 + '@example.com', name: 'J2', passwordHash: '', role: 'JUDGE' }});
    await prisma.user.create({ data: { id: jId3, email: jId3 + '@example.com', name: 'J3', passwordHash: '', role: 'JUDGE' }});

    const createAssign = async (idx: number, j: string, p: string, v: number) => {
      await prisma.judgeAssignment.create({
        data: {
          id: aId + idx, eventId, judgeId: j, projectId: p, status: 'COMPLETED', trackId,
          score: {
            create: {
              id: sId + idx, projectId: p, rubricId, submittedAt: new Date(), judgeId: j,
              criteria: { create: [ { id: scId + idx, criterionId: crit1Id, value: v } ] }
            }
          }
        }
      });
    };

    await createAssign(1, jId, pId, 3);
    await createAssign(2, jId, pId2, 4);
    await createAssign(3, jId, pId3, 3);
    
    await createAssign(4, jId2, pId, 2);
    await createAssign(5, jId2, pId2, 2);
    await createAssign(6, jId2, pId3, 4);
    
    await createAssign(7, jId3, pId2, 3);
    await createAssign(8, jId3, pId3, 4);
    await createAssign(9, jId3, pId, 3);

    const runSuccess = await service.triggerNormalization(eventId, auth, { maxIterations: 5000 });
    if (runSuccess.status === 'FAILED') {
      const dbRun = await prisma.normalizationRun.findUnique({ where: { id: runSuccess.runId } });
      console.log('DIAGNOSTICS:', dbRun?.diagnostics);
    }
    assert.strictEqual(runSuccess.status, 'SUCCESS'); 
    
    const dbRunSuccess = await prisma.normalizationRun.findUnique({ where: { id: runSuccess.runId }, include: { results: true } });
    assert.ok(dbRunSuccess);
    assert.strictEqual(dbRunSuccess!.status, 'SUCCESS');
    assert.ok(dbRunSuccess!.results.length > 0);
    assert.ok(dbRunSuccess!.inputSnapshot);
    assert.ok(dbRunSuccess!.rubricSnapshot);
  });

  await t.test('6. Reproducibility', async () => {
    const run1 = await service.triggerNormalization(eventId, auth, { maxIterations: 5000 });
    const run2 = await service.triggerNormalization(eventId, auth, { maxIterations: 5000 });
    
    const res1 = await prisma.normalizedResult.findMany({ where: { normalizationRunId: run1.runId }, orderBy: { projectId: 'asc' }});
    const res2 = await prisma.normalizedResult.findMany({ where: { normalizationRunId: run2.runId }, orderBy: { projectId: 'asc' }});
    
    assert.strictEqual(res1.length, res2.length);
    for (let i = 0; i < res1.length; i++) {
      assert.strictEqual(res1[i].normalizedCriterionScore, res2[i].normalizedCriterionScore);
      assert.strictEqual(res1[i].finalAggregate, res2[i].finalAggregate);
    }
  });

  await t.test('9. Concurrency', async () => {
    const p = [
      service.triggerNormalization(eventId, auth, { maxIterations: 5000 }),
      service.triggerNormalization(eventId, auth, { maxIterations: 5000 })
    ];
    const [c1, c2] = await Promise.all(p);
    
    assert.notStrictEqual(c1.runId, c2.runId);
    const dbC1 = await prisma.normalizationRun.findUnique({ where: { id: c1.runId }, include: { results: true }});
    const dbC2 = await prisma.normalizationRun.findUnique({ where: { id: c2.runId }, include: { results: true }});
    
    assert.ok(dbC1!.results.length > 0);
    assert.ok(dbC2!.results.length > 0);
  });

  await t.test('10. Result Semantics (Types & Schema)', async () => {
    const runRes = await service.triggerNormalization(eventId, auth, { maxIterations: 5000 });
    const run = await prisma.normalizationRun.findUnique({ where: { id: runRes.runId }, include: { results: true } });
    const agg = run!.results.find((r: any) => r.criterionId === null);
    assert.ok(agg);
    assert.notStrictEqual(agg.rawScore, undefined);
    assert.notStrictEqual(agg.finalAggregate, undefined);
  });
});
