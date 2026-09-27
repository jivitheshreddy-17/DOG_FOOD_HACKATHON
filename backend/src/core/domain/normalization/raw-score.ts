import { NormalizationInputObservation } from './types';

export function computeRawScores(
  observations: NormalizationInputObservation[]
): Record<string, { totalWeightedScore: number; totalWeight: number }> {
  const result: Record<string, { totalWeightedScore: number; totalWeight: number }> = {};

  for (const obs of observations) {
    if (obs.weight <= 0 || !Number.isFinite(obs.weight)) {
      throw new Error(`Invalid weight for observation: ${obs.weight}`);
    }
    if (obs.value < 1 || obs.value > 5 || !Number.isFinite(obs.value)) {
      throw new Error(`Invalid score value for observation: ${obs.value}`);
    }

    if (!result[obs.projectId]) {
      result[obs.projectId] = { totalWeightedScore: 0, totalWeight: 0 };
    }

    result[obs.projectId].totalWeightedScore += obs.value * obs.weight;
    result[obs.projectId].totalWeight += obs.weight;
  }

  return result;
}

export function computeRawCriterionScores(
  observations: NormalizationInputObservation[]
): Record<string, Record<string, { sum: number; count: number }>> {
  // projectId -> criterionId -> sums
  const result: Record<string, Record<string, { sum: number; count: number }>> = {};

  for (const obs of observations) {
    if (!result[obs.projectId]) {
      result[obs.projectId] = {};
    }
    if (!result[obs.projectId][obs.criterionId]) {
      result[obs.projectId][obs.criterionId] = { sum: 0, count: 0 };
    }
    result[obs.projectId][obs.criterionId].sum += obs.value;
    result[obs.projectId][obs.criterionId].count += 1;
  }
  return result;
}
