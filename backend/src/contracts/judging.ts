import { z } from 'zod';

export const rubricCriterionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  weight: z.number().int().positive(),
  order: z.number().int(),
});

export const rubricSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string().min(1),
  criteria: z.array(rubricCriterionSchema).min(1),
});

export type RubricCriterionDto = z.infer<typeof rubricCriterionSchema>;
export type RubricDto = z.infer<typeof rubricSchema>;

export const judgeAssignmentSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  judgeId: z.string(),
  projectId: z.string(),
  trackId: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
  version: z.number().int().default(1).optional(),
});

export type JudgeAssignmentDto = z.infer<typeof judgeAssignmentSchema>;

// Requests
export const createRubricRequestSchema = z.object({
  eventId: z.string(),
  name: z.string().min(1),
  criteria: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      weight: z.number().int().positive(),
      order: z.number().int(),
    })
  ).min(1),
});

export type CreateRubricRequest = z.infer<typeof createRubricRequestSchema>;

export const assignJudgeRequestSchema = z.object({
  eventId: z.string(),
  judgeId: z.string(),
  projectId: z.string(),
});

export type AssignJudgeRequest = z.infer<typeof assignJudgeRequestSchema>;

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

export type UpdateAssignmentStatusRequest = z.infer<typeof updateAssignmentStatusSchema>;

// ── 2D-2 Score Submission Contracts ──────────────────────────────────────────

export const scoreCriterionInputSchema = z.object({
  criterionId: z.string().min(1),
  value: z.number().int().min(1).max(5),
});

export type ScoreCriterionInput = z.infer<typeof scoreCriterionInputSchema>;

export const submitScoreRequestSchema = z.object({
  scores: z.array(scoreCriterionInputSchema),
  comment: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED']),
});

export type SubmitScoreRequest = z.infer<typeof submitScoreRequestSchema>;

export const scoreCriterionResponseSchema = z.object({
  criterionId: z.string(),
  value: z.number().int(),
});

export type ScoreCriterionResponse = z.infer<typeof scoreCriterionResponseSchema>;

export const scoreResponseDtoSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  projectId: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
  criteria: z.array(scoreCriterionResponseSchema),
  comment: z.string(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export type ScoreResponseDto = z.infer<typeof scoreResponseDtoSchema>;

