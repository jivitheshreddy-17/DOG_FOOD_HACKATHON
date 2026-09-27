import { describe, it, expect } from 'vitest';
import { NormalizationEngine } from '../src/core/domain/normalization/engine';
import { NormalizationInputObservation } from '../src/core/domain/normalization/types';

describe('NormalizationEngine', () => {
  it('should successfully normalize a connected graph', () => {
    const engine = new NormalizationEngine();
    
    // Setup a simple connected bipartite graph
    const observations: NormalizationInputObservation[] = [
      {
        judgeId: 'j1',
        projectId: 'p1',
        criterionId: 'c1',
        assignmentId: 'a1',
        rubricId: 'r1',
        value: 4,
        weight: 1,
        submittedAt: new Date(),
      },
      {
        judgeId: 'j1',
        projectId: 'p2',
        criterionId: 'c1',
        assignmentId: 'a2',
        rubricId: 'r1',
        value: 3,
        weight: 1,
        submittedAt: new Date(),
      },
      {
        judgeId: 'j2',
        projectId: 'p2',
        criterionId: 'c1',
        assignmentId: 'a3',
        rubricId: 'r1',
        value: 2,
        weight: 1,
        submittedAt: new Date(),
      },
      {
        judgeId: 'j2',
        projectId: 'p3',
        criterionId: 'c1',
        assignmentId: 'a4',
        rubricId: 'r1',
        value: 4,
        weight: 1,
        submittedAt: new Date(),
      }
    ];

    const result = engine.run(observations);

    expect(result.status).toBe('SUCCESS');
    expect(result.diagnostics).toContain('GRAPH_CONNECTED');
    
    // Should have results for p1, p2, p3
    expect(result.results.length).toBeGreaterThan(0);
    
    // Check if the relative ranking makes sense (j1 is more lenient than j2 since they gave 3 while j2 gave 2 for p2)
    const p1 = result.results.find(r => r.projectId === 'p1' && r.criterionId === 'c1');
    const p2 = result.results.find(r => r.projectId === 'p2' && r.criterionId === 'c1');
    const p3 = result.results.find(r => r.projectId === 'p3' && r.criterionId === 'c1');
    
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p3).toBeDefined();

    // Since j1 gave p1 a 4 and p2 a 3, p1 > p2
    expect(p1!.normalizedCriterionScore).toBeGreaterThan(p2!.normalizedCriterionScore);
    // Since j2 gave p3 a 4 and p2 a 2, p3 > p2
    expect(p3!.normalizedCriterionScore).toBeGreaterThan(p2!.normalizedCriterionScore);
  });
});
