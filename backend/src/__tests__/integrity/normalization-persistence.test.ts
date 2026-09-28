import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { randomUUID } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.client';
import { PrismaNormalizationRepository } from '../../infrastructure/database/repositories/prisma-normalization.repository';

describe('Integrity - Normalization Persistence', () => {
  let eventId = randomUUID();
  let rubricId = randomUUID();

  before(async () => {
    await prisma.event.create({ data: { id: eventId, name: 'T4', votingMode: 'AUTHENTICATED', submissionsClose: new Date() }});
    await prisma.rubric.create({ data: { id: rubricId, eventId, name: 'R4' }});
  });

  after(async () => {
    await prisma.rubric.deleteMany({ where: { id: rubricId }});
    await prisma.event.deleteMany({ where: { id: eventId }});
    await prisma.$disconnect();
  });

  test('Rolls back run creation if results fail', async () => {
    const repo = new PrismaNormalizationRepository(prisma);

    let failed = false;
    try {
      await repo.createRun({
        eventId,
        rubricId,
        rubricSnapshot: {},
        inputSnapshot: {},
        method: 'test',
        parameters: {},
        diagnostics: {},
        status: 'COMPLETED',
        results: [
          {
            projectId: randomUUID(), // Does not exist! Will cause FK constraint failure!
            criterionId: randomUUID(), // Does not exist! Will cause FK constraint failure!
            rawScore: 1,
            rawWeightedScore: 1,
            normalizedCriterionScore: 1,
            normalizedWeightedContribution: 1,
            finalAggregate: 1,
            uncertainty: 0,
            diagnosticFlags: {}
          }
        ]
      } as any);
    } catch (e: any) {
      failed = true;
    }

    assert.ok(failed, 'Should fail due to FK constraints');

    const runs = await prisma.normalizationRun.count({ where: { eventId }});
    assert.strictEqual(runs, 0, 'Run should not be persisted if results fail');
  });
});
