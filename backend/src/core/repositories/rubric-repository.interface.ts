import { RubricDto, RubricCriterionDto } from '@hackathon/contracts';

export interface RubricRepository {
  /**
   * Retrieves a rubric by its ID.
   */
  findById(id: string): Promise<RubricDto | null>;

  /**
   * Retrieves the rubric associated with a specific event.
   */
  findByEventId(eventId: string): Promise<RubricDto | null>;

  /**
   * Creates or updates a rubric and its criteria.
   */
  save(rubric: RubricDto): Promise<void>;
}
