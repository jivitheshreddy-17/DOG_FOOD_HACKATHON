import { ComponentData, ComponentResult, DiagnosticFlag, NormalizationInputObservation } from './types';

export function collectDiagnostics(
  observations: NormalizationInputObservation[],
  components: ComponentData[],
  componentResults: ComponentResult[]
): DiagnosticFlag[] {
  const flags = new Set<DiagnosticFlag>();

  if (observations.length === 0) {
    flags.add('NO_DATA');
    return Array.from(flags);
  }

  if (components.length === 1) {
    flags.add('GRAPH_CONNECTED');
  } else if (components.length > 1) {
    flags.add('GRAPH_DISCONNECTED');
    flags.add('NOT_IDENTIFIED');
  }

  for (const comp of components) {
    if (comp.judges.size === 1) {
      flags.add('SINGLE_JUDGE_BASELINE');
      flags.add('SINGLE_JUDGE_CALIBRATION_LIMIT');
    }

    // Check for constant judge (var = 0)
    const judgeScores: Record<string, number[]> = {};
    for (const obs of comp.observations) {
      if (!judgeScores[obs.judgeId]) judgeScores[obs.judgeId] = [];
      judgeScores[obs.judgeId].push(obs.value);
    }
    
    for (const judge in judgeScores) {
      const scores = judgeScores[judge];
      if (scores.length > 0) {
        const first = scores[0];
        const allSame = scores.every(s => s === first);
        if (allSame) {
          flags.add('CONSTANT_JUDGE');
        }
      }
    }
    
    // Check for low project evaluations (e.g., project with 1 eval)
    const projEvals: Record<string, number> = {};
    for (const obs of comp.observations) {
      projEvals[obs.projectId] = (projEvals[obs.projectId] || 0) + 1;
    }
    const hasLowProjEval = Object.values(projEvals).some(count => count <= 1);
    if (hasLowProjEval) {
      flags.add('LOW_PROJECT_EVAL');
    }
  }

  return Array.from(flags);
}
