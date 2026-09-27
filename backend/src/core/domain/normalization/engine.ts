import { 
  NormalizationInputObservation, 
  NormalizationParameters, 
  NormalizationEngineResult, 
  ComponentResult, 
  ProjectResult,
  DiagnosticFlag
} from './types';
import { analyzeGraph } from './graph';
import { computeRawScores, computeRawCriterionScores } from './raw-score';
import { solveOrdinalModel } from './ordinal-model';
import { applyJudgeCalibration } from './calibration';
import { computeWeightedAggregation } from './aggregation';
import { collectDiagnostics } from './diagnostics';

export class NormalizationEngine {
  public run(
    observations: NormalizationInputObservation[],
    params: NormalizationParameters = {}
  ): NormalizationEngineResult {
    try {
      if (observations.length === 0) {
        return {
          status: 'FAILED',
          diagnostics: ['NO_DATA'],
          results: []
        };
      }

      const rawAggregates = computeRawScores(observations);
      const rawCriterion = computeRawCriterionScores(observations);
      
      const components = analyzeGraph(observations);
      const diagnostics = collectDiagnostics(observations, components, []); // pre-collect some flags
      const componentResults: ComponentResult[] = [];

      let hasFailures = false;
      const globalFlags = new Set<DiagnosticFlag>(diagnostics);

      for (const comp of components) {
        try {
          // If a component has only 1 project, solver won't work well, but it's handled.
          const modelRes = solveOrdinalModel(comp, params);
          const shrunkSeverities = applyJudgeCalibration(comp, modelRes, params);

          componentResults.push({
            componentId: comp.componentId,
            judgeSeverities: modelRes.alpha_j,
            criterionSeverities: shrunkSeverities,
            projectQualities: modelRes.theta_pc,
            thresholds: modelRes.tau_ck
          });
        } catch (err: any) {
          hasFailures = true;
          if (err.name === 'NormalizationError' && err.code) {
            globalFlags.add(err.code as DiagnosticFlag);
          } else {
            globalFlags.add('NUMERICAL_ERROR');
          }
        }
      }

      if (hasFailures) {
        return {
          status: 'FAILED',
          diagnostics: Array.from(globalFlags),
          results: []
        };
      }

      const finalAggregates = computeWeightedAggregation(observations, componentResults);
      
      const results: ProjectResult[] = [];
      const criterionWeights: Record<string, number> = {};
      observations.forEach(o => criterionWeights[o.criterionId] = o.weight);

      for (const compRes of componentResults) {
        const isComponentLevel = components.length > 1;
        const compFlags: DiagnosticFlag[] = isComponentLevel ? ['NOT_IDENTIFIED'] : [];

        for (const projectId in compRes.projectQualities) {
          const rawAgg = rawAggregates[projectId];
          const finalAgg = finalAggregates[projectId].finalAggregate;

          // For each criterion
          for (const criterionId in compRes.projectQualities[projectId]) {
            const rawCritSum = rawCriterion[projectId][criterionId].sum;
            const rawCritCount = rawCriterion[projectId][criterionId].count;
            const theta = compRes.projectQualities[projectId][criterionId];
            const weight = criterionWeights[criterionId] ?? 0;

            results.push({
              projectId,
              criterionId,
              rawScore: rawCritCount > 0 ? rawCritSum / rawCritCount : 0,
              rawWeightedScore: (rawCritCount > 0 ? rawCritSum / rawCritCount : 0) * weight,
              normalizedCriterionScore: theta,
              normalizedWeightedContribution: theta * weight,
              finalAggregate: finalAgg,
              uncertainty: 0.1, // Placeholder
              diagnosticFlags: compFlags
            });
          }

          // Aggregate-level result (criterionId = null)
          results.push({
            projectId,
            criterionId: null,
            rawScore: rawAgg.totalWeight > 0 ? rawAgg.totalWeightedScore / rawAgg.totalWeight : 0,
            rawWeightedScore: rawAgg.totalWeightedScore,
            normalizedCriterionScore: 0,
            normalizedWeightedContribution: 0,
            finalAggregate: finalAgg,
            uncertainty: 0.1, // Placeholder
            diagnosticFlags: compFlags
          });
        }
      }

      const status = components.length > 1 ? 'SUCCESS_WITH_DIAGNOSTICS' : 'SUCCESS';

      return {
        status,
        diagnostics: Array.from(globalFlags),
        results
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        diagnostics: err.code ? [err.code] : ['NUMERICAL_ERROR'],
        results: []
      };
    }
  }
}
