import { ScoreCriterionInput, ScoreResponseDto } from '@hackathon/contracts';

/**
 * Immutable raw score observations for one judge × project pair.
 * Created once on first submission; updated only while status is DRAFT.
 * Finalized (SUBMITTED) rows are never mutated — normalization reads them as-is.
 */
export interface ScoreRepository {
  /**
   * Find a score by its judge_assignment id (1:1 relation).
   */
  findByAssignmentId(assignmentId: string): Promise<ScoreResponseDto | null>;

  /**
   * Upsert the score row and replace all ScoreCriterion child rows atomically.
   * Must run inside a transaction.
   *
   * Rules (enforced by service before calling):
   *  - Only allowed when current status is null (new) or DRAFT.
   *  - SUBMITTED scores are immutable; service throws before reaching here.
   */
  upsert(params: {
    assignmentId: string;
    judgeId: string;
    projectId: string;
    rubricId: string;
    criteria: ScoreCriterionInput[];
    comment: string;
    /** Null = draft save; non-null = judge finalized submission */
    submittedAt: Date | null;
  }): Promise<ScoreResponseDto>;
}
