import { NormalizationInputObservation, ComponentResult } from './types';

export function computeWeightedAggregation(
  observations: NormalizationInputObservation[],
  componentResults: ComponentResult[]
): Record<string, { finalAggregate: number }> {
  // First, extract weights per criterion from observations
  const criterionWeights: Record<string, number> = {};
  for (const obs of observations) {
    if (!criterionWeights[obs.criterionId]) {
      criterionWeights[obs.criterionId] = obs.weight;
    }
  }

  const aggregates: Record<string, { finalAggregate: number }> = {};

  for (const comp of componentResults) {
    for (const projectId in comp.projectQualities) {
      let sumWeightedTheta = 0;
      let sumWeights = 0;

      for (const criterionId in comp.projectQualities[projectId]) {
        const theta = comp.projectQualities[projectId][criterionId];
        const weight = criterionWeights[criterionId] ?? 0;

        sumWeightedTheta += theta * weight;
        sumWeights += weight;
      }

      aggregates[projectId] = {
        finalAggregate: sumWeights > 0 ? sumWeightedTheta / sumWeights : 0,
      };
    }
  }

  return aggregates;
}
