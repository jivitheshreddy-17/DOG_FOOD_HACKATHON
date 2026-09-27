export interface NormalizationInputObservation {
  judgeId: string;
  projectId: string;
  criterionId: string;
  assignmentId: string;
  rubricId: string;
  value: number; // 1..5
  weight: number;
  submittedAt: Date;
}

export interface NormalizationParameters {
  shrinkageKappa?: number;
  maxIterations?: number;
  tolerance?: number;
}

export type NormalizationStatus = 'SUCCESS' | 'SUCCESS_WITH_DIAGNOSTICS' | 'FAILED' | 'NOT_IDENTIFIED';

export type DiagnosticFlag =
  | 'GRAPH_CONNECTED'
  | 'GRAPH_DISCONNECTED'
  | 'NOT_IDENTIFIED'
  | 'SINGLE_JUDGE_BASELINE'
  | 'SINGLE_JUDGE_CALIBRATION_LIMIT'
  | 'CONSTANT_JUDGE'
  | 'NEAR_CONSTANT_JUDGE'
  | 'SEVERITY_OUTLIER'
  | 'LOW_PROJECT_EVAL'
  | 'LOW_JUDGE_OVERLAP'
  | 'WEAK_BRIDGE'
  | 'LOW_VARIANCE_CRITERION'
  | 'PARTIAL_OBSERVATION'
  | 'DATA_INTEGRITY_FAILURE'
  | 'INVALID_SCORE'
  | 'INVALID_WEIGHT'
  | 'NUMERICAL_ERROR'
  | 'NON_CONVERGENCE'
  | 'STALE_RUN'
  | 'RUBRIC_MUTATION'
  | 'VERSION_MISMATCH'
  | 'NO_DATA';

export interface ComponentResult {
  componentId: string;
  judgeSeverities: Record<string, number>; // alpha_j
  criterionSeverities: Record<string, Record<string, number>>; // alpha_jc
  projectQualities: Record<string, Record<string, number>>; // theta_pc
  thresholds: Record<string, number[]>; // tau_ck
}

export interface ComponentData {
  componentId: string;
  judges: Set<string>;
  projects: Set<string>;
  observations: NormalizationInputObservation[];
}

export interface ProjectResult {
  projectId: string;
  criterionId: string | null; // null for final aggregate
  rawScore: number;
  rawWeightedScore: number;
  normalizedCriterionScore: number;
  normalizedWeightedContribution: number;
  finalAggregate: number;
  uncertainty: number;
  diagnosticFlags: DiagnosticFlag[];
}

export interface NormalizationEngineResult {
  status: NormalizationStatus;
  diagnostics: DiagnosticFlag[];
  results: ProjectResult[];
}
