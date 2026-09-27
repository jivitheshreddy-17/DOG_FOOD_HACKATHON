import { test } from 'node:test';
import assert from 'node:assert';
import { NormalizationEngine } from '../src/core/domain/normalization/engine';
import { NormalizationInputObservation } from '../src/core/domain/normalization/types';

test('2D5 Graph Identifiability and Edge Cases', async (t) => {
  const engine = new NormalizationEngine();

  const baseObs = (override: Partial<NormalizationInputObservation>): NormalizationInputObservation => ({
    judgeId: 'j1',
    projectId: 'p1',
    criterionId: 'c1',
    assignmentId: 'a1',
    rubricId: 'r1',
    value: 3,
    weight: 1,
    submittedAt: new Date(),
    ...override
  });

  await t.test('Connected graph produces success', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 3 }),
      baseObs({ judgeId: 'j1', projectId: 'p2', value: 4 }),
      baseObs({ judgeId: 'j1', projectId: 'p3', value: 3 }), // overlaps with j2
      baseObs({ judgeId: 'j2', projectId: 'p1', value: 2 }), // overlaps with j1
      baseObs({ judgeId: 'j2', projectId: 'p2', value: 2 }),
      baseObs({ judgeId: 'j2', projectId: 'p3', value: 4 }),
      baseObs({ judgeId: 'j3', projectId: 'p2', value: 3 }), // j3 joins
      baseObs({ judgeId: 'j3', projectId: 'p3', value: 4 }),
      baseObs({ judgeId: 'j3', projectId: 'p1', value: 3 }),
    ];
    const res = engine.run(obs);
    if (res.status === 'FAILED') console.log('Connected graph failed with diagnostics:', res.diagnostics);
    assert.strictEqual(res.status, 'SUCCESS');
    assert.ok(res.diagnostics.includes('GRAPH_CONNECTED'));
    assert.ok(!res.diagnostics.includes('NOT_IDENTIFIED'));
    // p3 > p2 > p1 overall
    const getTheta = (p: string) => res.results.find(r => r.projectId === p && r.criterionId === 'c1')!.normalizedCriterionScore;
    assert.ok(getTheta('p3') > getTheta('p2'));
    assert.ok(getTheta('p2') > getTheta('p1'));
  });

  await t.test('Disconnected graph identifies NOT_IDENTIFIED', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 3 }),
      baseObs({ judgeId: 'j1', projectId: 'p2', value: 4 }),
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 2 }),
      baseObs({ judgeId: 'j2', projectId: 'p3', value: 4 }),
      baseObs({ judgeId: 'j2', projectId: 'p4', value: 5 }),
      baseObs({ judgeId: 'j2', projectId: 'p3', value: 3 }),
    ];
    const res = engine.run(obs);
    assert.ok(res.diagnostics.includes('GRAPH_DISCONNECTED'));
    assert.ok(res.diagnostics.includes('NOT_IDENTIFIED'));
  });

  await t.test('Single judge baseline', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 3 }),
      baseObs({ judgeId: 'j1', projectId: 'p2', value: 4 }),
    ];
    const res = engine.run(obs);
    assert.ok(res.diagnostics.includes('SINGLE_JUDGE_BASELINE'));
  });

  await t.test('Constant judge detection', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 3 }),
      baseObs({ judgeId: 'j1', projectId: 'p2', value: 3 }),
      baseObs({ judgeId: 'j1', projectId: 'p3', value: 3 }),
    ];
    const res = engine.run(obs);
    assert.ok(res.diagnostics.includes('CONSTANT_JUDGE'));
  });

  await t.test('Invalid score failure', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 6 }), // Invalid > 5
    ];
    const res = engine.run(obs);
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.results.length, 0);
  });

  await t.test('Invalid weight failure', () => {
    const obs = [
      baseObs({ judgeId: 'j1', projectId: 'p1', value: 3, weight: 0 }),
    ];
    const res = engine.run(obs);
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.results.length, 0);
  });

  await t.test('Zero observations', () => {
    const res = engine.run([]);
    assert.strictEqual(res.status, 'FAILED');
    assert.ok(res.diagnostics.includes('NO_DATA'));
    assert.strictEqual(res.results.length, 0);
  });
});
