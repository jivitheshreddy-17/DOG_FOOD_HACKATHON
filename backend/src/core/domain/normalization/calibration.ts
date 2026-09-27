import { ComponentData, NormalizationParameters } from './types';
import { OrdinalModelResult } from './ordinal-model';

export function applyJudgeCalibration(
  component: ComponentData,
  modelResult: OrdinalModelResult,
  params: NormalizationParameters
): Record<string, Record<string, number>> {
  const kappa = params.shrinkageKappa ?? 5;
  const shrunkSeverities: Record<string, Record<string, number>> = {};

  const { alpha_j, alpha_jc } = modelResult;

  // Count observations n_jc
  const n_jc: Record<string, Record<string, number>> = {};
  for (const obs of component.observations) {
    if (!n_jc[obs.judgeId]) n_jc[obs.judgeId] = {};
    if (!n_jc[obs.judgeId][obs.criterionId]) n_jc[obs.judgeId][obs.criterionId] = 0;
    n_jc[obs.judgeId][obs.criterionId]++;
  }

  for (const judge of component.judges) {
    shrunkSeverities[judge] = {};
    for (const criterion in alpha_jc[judge]) {
      const count = n_jc[judge]?.[criterion] || 0;
      const lambda_jc = count / (count + kappa);

      const raw_jc = alpha_jc[judge][criterion];
      const overall_j = alpha_j[judge];

      shrunkSeverities[judge][criterion] = lambda_jc * raw_jc + (1 - lambda_jc) * overall_j;
    }
  }

  return shrunkSeverities;
}
