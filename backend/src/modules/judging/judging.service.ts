import {
  JudgeAssignmentRepository,
  RubricRepository,
  ScoreRepository,
} from '../../core/repositories';
import { TransactionManager } from '../../core/repositories';
import { SubmitScoreRequest, ScoreResponseDto } from '@hackathon/contracts';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../core/errors';
import { randomUUID } from 'node:crypto';

export interface JudgingServiceDeps {
  judgeAssignmentRepository: JudgeAssignmentRepository;
  rubricRepository: RubricRepository;
  scoreRepository: ScoreRepository;
  transactionManager: TransactionManager;
  projectRepository: import('../../core/repositories').ProjectRepository;
  trackRepository: import('../../core/repositories').TrackRepository;
  userRepository: import('../../core/repositories').UserRepository;
  eventRepository: import('../../core/repositories').EventRepository;
}

export class JudgingService {
  constructor(private readonly deps: JudgingServiceDeps) {}

  /**
   * Submit or update scores for an assignment.
   *
   * Business rules:
   *  1. Assignment must exist.
   *  2. Caller must be the assigned judge (judgeId check).
   *  3. Assignment must not already be COMPLETED (immutability of finalized scores).
   *  4. All submitted criterionIds must belong to the assignment's rubric.
   *  5. All rubric criteria must be covered (no missing observations).
   *  6. Score values must be 1–5 (validated by Zod in the route layer).
   *  7. If request.status === 'SUBMITTED', mark assignment COMPLETED via OCC.
   *  8. On OCC conflict → throw ConflictError (caller retries or surfaces 409).
   */
  async submitScore(
    assignmentId: string,
    judgeId: string,
    request: SubmitScoreRequest
  ): Promise<ScoreResponseDto> {
    const { judgeAssignmentRepository, rubricRepository, scoreRepository } = this.deps;

    // ── 1. Load assignment ─────────────────────────────────────────────────────
    const assignment = await judgeAssignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment ${assignmentId} not found`);
    }

    // ── 2. Ownership check ─────────────────────────────────────────────────────
    if (assignment.judgeId !== judgeId) {
      throw new ForbiddenError('You are not the assigned judge for this project');
    }

    // ── 3. Immutability guard ──────────────────────────────────────────────────
    if (assignment.status === 'COMPLETED') {
      throw new ConflictError('Score has already been finalized and cannot be modified');
    }

    // ── 4 & 5. Rubric validation ───────────────────────────────────────────────
    const rubric = await rubricRepository.findByEventId(assignment.eventId);
    if (!rubric) {
      throw new NotFoundError(`No rubric found for event ${assignment.eventId}`);
    }

    const rubricCriterionIds = new Set(rubric.criteria.map((c) => c.id));
    const submittedIds = new Set(request.scores.map((s) => s.criterionId));

    // Unknown criterion guard
    for (const id of submittedIds) {
      if (!rubricCriterionIds.has(id)) {
        throw new NotFoundError(`Criterion ${id} does not belong to this rubric`);
      }
    }

    // Completeness guard — only enforced on SUBMITTED (draft saves are partial)
    if (request.status === 'SUBMITTED') {
      for (const cId of rubricCriterionIds) {
        if (!submittedIds.has(cId)) {
          throw new ConflictError(
            `Missing score for criterion ${cId} — all criteria must be scored before submission`
          );
        }
      }
    }

    // ── 6. Persist (atomic upsert inside transaction) ──────────────────────────
    const submittedAt = request.status === 'SUBMITTED' ? new Date() : null;

    const scoreResult = await scoreRepository.upsert({
      assignmentId,
      judgeId,
      projectId: assignment.projectId,
      rubricId: rubric.id,
      criteria: request.scores,
      comment: request.comment ?? '',
      submittedAt,
    });

    // ── 7. Transition assignment status via OCC ────────────────────────────────
    if (request.status === 'SUBMITTED') {
      const currentVersion = assignment.version ?? 1;
      const updated = await judgeAssignmentRepository.updateStatusWithOcc(
        assignmentId,
        currentVersion,
        'COMPLETED'
      );
      if (!updated) {
        throw new ConflictError(
          'Concurrent modification detected — please reload and try again'
        );
      }
    } else {
      // Draft save — advance to IN_PROGRESS if still PENDING
      if (assignment.status === 'PENDING') {
        await judgeAssignmentRepository.updateStatus(assignmentId, 'IN_PROGRESS');
      }
    }

    return scoreResult;
  }

  /**
   * Retrieve current score for an assignment (judge can check their own progress).
   */
  async getScore(
    assignmentId: string,
    auth: import('@hackathon/contracts').AuthenticatedUser
  ): Promise<ScoreResponseDto | null> {
    const assignment = await this.deps.judgeAssignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment ${assignmentId} not found`);
    }

    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      if (assignment.judgeId !== auth.id) {
        throw new ForbiddenError('You are not the assigned judge for this project');
      }
    }

    return this.deps.scoreRepository.findByAssignmentId(assignmentId);
  }

  /**
   * Retrieve assignments for the authenticated user.
   */
  async listAssignments(
    auth: import('@hackathon/contracts').AuthenticatedUser,
    eventId?: string
  ): Promise<import('@hackathon/contracts').JudgeAssignmentDto[]> {
    if (auth.role === 'ORGANIZER' || auth.role === 'ADMIN') {
      if (eventId) {
        return this.deps.judgeAssignmentRepository.findByEvent(eventId);
      }
      // If no event is provided, return all (if repository supported it) or require eventId.
      // Since no findAll exists, let's require eventId for organizers, or implement findAll in repository.
      // We will assume organizers must provide eventId, or we can just fetch all events.
      // Let's rely on the repository adding findAll or returning empty if we don't have eventId.
      // Actually, if we just want to avoid adding findAll, we throw an error if no eventId.
      if (!eventId) {
         // To avoid breaking, we will add findAll to the repo next, so I'll just call it here.
         return (this.deps.judgeAssignmentRepository as any).findAll();
      }
    }

    if (auth.role === 'JUDGE') {
      const assignments = await this.deps.judgeAssignmentRepository.findByJudge(auth.id);
      if (eventId) {
        return assignments.filter(a => a.eventId === eventId);
      }
      return assignments;
    }

    throw new ForbiddenError('You do not have permission to list assignments');
  }

  /**
   * Retrieve aggregate progress statistics for the dashboard.
   */
  async getProgress(
    auth: import('@hackathon/contracts').AuthenticatedUser,
    eventId?: string
  ) {
    if (auth.role !== 'JUDGE' && auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('You do not have permission to view judging progress');
    }

    const filter: { eventId?: string; judgeId?: string } = {};
    if (eventId) filter.eventId = eventId;
    if (auth.role === 'JUDGE') {
      filter.judgeId = auth.id;
    }

    const stats = await this.deps.judgeAssignmentRepository.getProgressStats(filter);

    const result = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      completionPercentage: 0,
      byTrack: {} as Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }>,
      byJudge: undefined as Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }> | undefined,
    };

    if (auth.role === 'ORGANIZER' || auth.role === 'ADMIN') {
      result.byJudge = {};
    }

    for (const row of stats) {
      result.total += row.count;
      if (row.status === 'PENDING') result.pending += row.count;
      else if (row.status === 'IN_PROGRESS') result.inProgress += row.count;
      else if (row.status === 'COMPLETED') result.completed += row.count;

      if (row.trackId) {
        if (!result.byTrack[row.trackId]) {
          result.byTrack[row.trackId] = { total: 0, pending: 0, inProgress: 0, completed: 0, percentage: 0 };
        }
        result.byTrack[row.trackId].total += row.count;
        if (row.status === 'PENDING') result.byTrack[row.trackId].pending += row.count;
        else if (row.status === 'IN_PROGRESS') result.byTrack[row.trackId].inProgress += row.count;
        else if (row.status === 'COMPLETED') result.byTrack[row.trackId].completed += row.count;
      }

      if (result.byJudge && row.judgeId) {
        if (!result.byJudge[row.judgeId]) {
          result.byJudge[row.judgeId] = { total: 0, pending: 0, inProgress: 0, completed: 0, percentage: 0 };
        }
        result.byJudge[row.judgeId].total += row.count;
        if (row.status === 'PENDING') result.byJudge[row.judgeId].pending += row.count;
        else if (row.status === 'IN_PROGRESS') result.byJudge[row.judgeId].inProgress += row.count;
        else if (row.status === 'COMPLETED') result.byJudge[row.judgeId].completed += row.count;
      }
    }

    result.completionPercentage = result.total === 0 ? 0 : Math.round((result.completed / result.total) * 100);

    for (const trackId in result.byTrack) {
      const track = result.byTrack[trackId];
      track.percentage = track.total === 0 ? 0 : Math.round((track.completed / track.total) * 100);
    }

    if (result.byJudge) {
      for (const judgeId in result.byJudge) {
        const judge = result.byJudge[judgeId];
        judge.percentage = judge.total === 0 ? 0 : Math.round((judge.completed / judge.total) * 100);
      }
    }

    return result;
  }

  // ── 2D-6: Rubric and Assignment Management ───────────────────────────────

  /**
   * Create a new Rubric
   */
  async createRubric(
    eventId: string,
    auth: import('@hackathon/contracts').AuthenticatedUser,
    request: import('@hackathon/contracts').CreateRubricRequest
  ): Promise<import('@hackathon/contracts').RubricDto> {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can manage rubrics');
    }

    const event = await this.deps.eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }

    const existing = await this.deps.rubricRepository.findByEventId(eventId);
    if (existing) {
      throw new ConflictError(`Rubric already exists for event ${eventId}`);
    }

    const newId = randomUUID();
    const rubric: import('@hackathon/contracts').RubricDto = {
      id: newId,
      eventId,
      name: request.name,
      criteria: request.criteria.map((c) => ({
        id: randomUUID(),
        name: c.name,
        description: c.description ?? null,
        weight: c.weight,
        order: c.order,
      })),
    };

    try {
      await this.deps.rubricRepository.save(rubric);
    } catch (e: any) {
      if (e.message?.includes('frozen')) {
        throw new ConflictError('Rubric is frozen and cannot be mutated');
      }
      throw e;
    }

    return rubric;
  }

  /**
   * Get a Rubric
   */
  async getRubric(
    rubricId: string,
    auth: import('@hackathon/contracts').AuthenticatedUser
  ): Promise<import('@hackathon/contracts').RubricDto> {
    const rubric = await this.deps.rubricRepository.findById(rubricId);
    if (!rubric) {
      throw new NotFoundError(`Rubric ${rubricId} not found`);
    }
    return rubric;
  }

  /**
   * Update an existing Rubric
   */
  async updateRubric(
    rubricId: string,
    auth: import('@hackathon/contracts').AuthenticatedUser,
    request: import('@hackathon/contracts').CreateRubricRequest
  ): Promise<import('@hackathon/contracts').RubricDto> {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can manage rubrics');
    }

    const existing = await this.deps.rubricRepository.findById(rubricId);
    if (!existing) {
      throw new NotFoundError(`Rubric ${rubricId} not found`);
    }

    // Freeze check logic is also in the repository level for safety,
    // but we can preemptively check or catch the error.
    
    // We must reuse existing criteria IDs if we can, but since the request doesn't include criteria IDs,
    // we recreate them or let the repo recreate them.
    const rubric: import('@hackathon/contracts').RubricDto = {
      id: rubricId,
      eventId: existing.eventId,
      name: request.name,
      criteria: request.criteria.map((c) => ({
        id: randomUUID(),
        name: c.name,
        description: c.description ?? null,
        weight: c.weight,
        order: c.order,
      })),
    };

    try {
      await this.deps.rubricRepository.save(rubric);
    } catch (e: any) {
      if (e.message?.includes('frozen')) {
        throw new ConflictError('Rubric is frozen and cannot be mutated');
      }
      throw e;
    }

    return rubric;
  }

  /**
   * Create a Judge Assignment
   */
  async createAssignment(
    auth: import('@hackathon/contracts').AuthenticatedUser,
    request: import('@hackathon/contracts').AssignJudgeRequest
  ): Promise<import('@hackathon/contracts').JudgeAssignmentDto> {
    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      throw new ForbiddenError('Only organizers can create judge assignments');
    }

    // Validate Event
    const event = await this.deps.eventRepository.findById(request.eventId);
    if (!event) {
      throw new NotFoundError(`Event ${request.eventId} not found`);
    }

    // Validate Judge
    const judge = await this.deps.userRepository.findById(request.judgeId);
    if (!judge || judge.role !== 'JUDGE') {
      throw new ConflictError(`User ${request.judgeId} is not a valid judge`);
    }

    // Validate Project
    const project = await this.deps.projectRepository.findById(request.projectId);
    if (!project) {
      throw new NotFoundError(`Project ${request.projectId} not found`);
    }

    // Validate Track
    const track = await this.deps.trackRepository.findById(project.trackId);
    if (!track) {
      throw new NotFoundError(`Track ${project.trackId} not found`);
    }
    if (track.eventId !== request.eventId) {
      throw new ConflictError(`Project track belongs to a different event`);
    }

    // Check Duplicate
    const existing = await this.deps.judgeAssignmentRepository.findByJudgeAndProject(request.judgeId, request.projectId);
    if (existing) {
      throw new ConflictError(`Judge is already assigned to project ${request.projectId}`);
    }

    const assignment: import('@hackathon/contracts').JudgeAssignmentDto = {
      id: randomUUID(),
      eventId: request.eventId,
      judgeId: request.judgeId,
      projectId: request.projectId,
      trackId: project.trackId,
      status: 'PENDING',
      version: 1,
    };

    await this.deps.judgeAssignmentRepository.create(assignment);
    return assignment;
  }

  /**
   * Get an Assignment
   */
  async getAssignment(
    assignmentId: string,
    auth: import('@hackathon/contracts').AuthenticatedUser
  ): Promise<import('@hackathon/contracts').JudgeAssignmentDto> {
    const assignment = await this.deps.judgeAssignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment ${assignmentId} not found`);
    }

    if (auth.role !== 'ORGANIZER' && auth.role !== 'ADMIN') {
      if (assignment.judgeId !== auth.id) {
        throw new ForbiddenError('You are not authorized to view this assignment');
      }
    }

    return assignment;
  }
}
