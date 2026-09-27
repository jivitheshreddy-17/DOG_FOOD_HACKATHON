import { NormalizationRepository, ScoreRepository, RubricRepository, JudgeAssignmentRepository } from '../../core/repositories';
import { NormalizationEngine, NormalizationEngineResult, NormalizationParameters } from '../../core/domain/normalization';
import { AuthenticatedUser } from '@hackathon/contracts';
import { ForbiddenError, NotFoundError, ConflictError } from '../../core/errors';

export interface NormalizationServiceDeps {
  normalizationRepository: NormalizationRepository;
  scoreRepository: ScoreRepository;
  rubricRepository: RubricRepository;
  judgeAssignmentRepository: JudgeAssignmentRepository;
  engine: NormalizationEngine;
}

export class NormalizationService {
  constructor(private readonly deps: NormalizationServiceDeps) {}

  async triggerNormalization(
    eventId: string,
    auth: AuthenticatedUser,
    params: NormalizationParameters = {}
  ): Promise<{ runId: string; status: string }> {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can trigger normalization');
    }

    // 1. Fetch dependencies
    const rubric = await this.deps.rubricRepository.findByEventId(eventId);
    if (!rubric) {
      throw new NotFoundError(`Rubric not found for event ${eventId}`);
    }

    // 2. We need to query Prisma directly or through a specialized method to get all completed scores for the event.
    // Wait, scoreRepository does not have `findAllCompletedByEvent`. We'll use a hack or Prisma client if we must,
    // but the engine expects `NormalizationInputObservation[]`. We will get it using `judgeAssignmentRepository.findByEvent`
    // and `scoreRepository.findByAssignmentId`.
    const assignments = await this.deps.judgeAssignmentRepository.findByEvent(eventId);
    const completedAssignments = assignments.filter(a => a.status === 'COMPLETED');
    
    if (completedAssignments.length === 0) {
      throw new ConflictError('No completed assignments to normalize');
    }

    const observations: any[] = [];
    const rubricCriterionMap = new Map(rubric.criteria.map(c => [c.id, c]));

    for (const assignment of completedAssignments) {
      const score = await this.deps.scoreRepository.findByAssignmentId(assignment.id);
      if (score && score.submittedAt) {
        for (const crit of score.criteria) {
          const rubricCrit = rubricCriterionMap.get(crit.criterionId);
          if (rubricCrit) {
            observations.push({
              judgeId: assignment.judgeId,
              projectId: assignment.projectId,
              criterionId: crit.criterionId,
              assignmentId: assignment.id,
              rubricId: rubric.id,
              value: crit.value,
              weight: rubricCrit.weight,
              submittedAt: new Date(score.submittedAt)
            });
          }
        }
      }
    }

    // 3. Run the engine
    const engineResult = this.deps.engine.run(observations, params);

    // 4. Persist run
    const run = await this.deps.normalizationRepository.createRun({
      eventId,
      rubricId: rubric.id,
      rubricSnapshot: rubric,
      inputSnapshot: observations, // Hash or snapshot
      method: 'cumulative-link-logit',
      parameters: params,
      diagnostics: engineResult.diagnostics,
      status: engineResult.status,
      results: engineResult.results.map(r => ({
        projectId: r.projectId,
        criterionId: r.criterionId,
        rawScore: r.rawScore,
        rawWeightedScore: r.rawWeightedScore,
        normalizedCriterionScore: r.normalizedCriterionScore,
        normalizedWeightedContribution: r.normalizedWeightedContribution,
        finalAggregate: r.finalAggregate,
        uncertainty: r.uncertainty,
        diagnosticFlags: r.diagnosticFlags
      }))
    });

    return { runId: run.id, status: run.status };
  }

  async listRuns(eventId: string, auth: AuthenticatedUser) {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can view normalization runs');
    }
    return this.deps.normalizationRepository.findRunsByEvent(eventId);
  }

  async getRunResults(runId: string, auth: AuthenticatedUser) {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can view normalization results');
    }
    const run = await this.deps.normalizationRepository.findRunById(runId);
    if (!run) throw new NotFoundError('Normalization run not found');
    
    const results = await this.deps.normalizationRepository.findResultsByRun(runId);
    return { run, results };
  }
}
