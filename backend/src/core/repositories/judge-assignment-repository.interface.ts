import { JudgeAssignmentDto } from '@hackathon/contracts';

export interface JudgeAssignmentRepository {
  /**
   * Creates a new judge assignment.
   */
  create(assignment: JudgeAssignmentDto): Promise<void>;

  /**
   * Retrieves an assignment by ID.
   */
  findById(id: string): Promise<JudgeAssignmentDto | null>;

  /**
   * Retrieves an assignment by judge and project.
   */
  findByJudgeAndProject(judgeId: string, projectId: string): Promise<JudgeAssignmentDto | null>;

  /**
   * Retrieves all assignments for a specific judge.
   */
  findByJudge(judgeId: string): Promise<JudgeAssignmentDto[]>;

  /**
   * Retrieves all assignments for a specific event.
   */
  findByEvent(eventId: string): Promise<JudgeAssignmentDto[]>;

  /**
   * Retrieves all assignments.
   */
  findAll(): Promise<JudgeAssignmentDto[]>;

  /**
   * Updates the status of an assignment.
   */
  updateStatus(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'): Promise<void>;

  /**
   * Atomically updates status using optimistic concurrency control.
   * Returns true if successfully updated, false if version mismatch or already completed.
   */
  updateStatusWithOcc(
    id: string,
    expectedVersion: number,
    status: 'IN_PROGRESS' | 'COMPLETED'
  ): Promise<boolean>;

  /**
   * Retrieves aggregate progress statistics for assignments.
   */
  getProgressStats(filter: { eventId?: string; judgeId?: string }): Promise<{
    trackId: string | null;
    judgeId: string;
    status: string;
    count: number;
  }[]>;
}
