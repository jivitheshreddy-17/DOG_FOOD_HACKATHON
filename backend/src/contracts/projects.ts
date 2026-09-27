import { z } from 'zod';

/**
 * Project lifecycle state machine
 * DRAFT -> SUBMITTED
 */
export const PROJECT_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const projectStatusSchema = z.enum([
  PROJECT_STATUS.DRAFT,
  PROJECT_STATUS.SUBMITTED,
]);

/**
 * Path parameter validation contract for project routes (/api/projects/:id)
 */
export const projectParamsSchema = z
  .object({
    id: z.string().trim().min(1, 'id is required'),
  })
  .strict();

export type ProjectParams = z.infer<typeof projectParamsSchema>;

/**
 * POST /api/projects request contract
 *
 * Validation rules:
 * - team_id: required, trimmed, non-empty
 * - track_id: required, trimmed, non-empty
 * - title: required, trimmed, 1-200 characters
 * - description: required, trimmed, 1-5000 characters
 * - repository_url: optional/nullable valid URL
 * - demo_url: optional/nullable valid URL
 * - Strict: rejects unknown or protected fields (e.g. id, status, submitted_at)
 */
export const createProjectSchema = z
  .object({
    team_id: z.string().trim().min(1, 'team_id is required'),
    track_id: z.string().trim().min(1, 'track_id is required'),
    title: z
      .string()
      .trim()
      .min(1, 'title is required')
      .max(200, 'title must be at most 200 characters'),
    description: z
      .string()
      .trim()
      .min(1, 'description is required')
      .max(5000, 'description must be at most 5000 characters'),
    repository_url: z
      .string()
      .trim()
      .url('repository_url must be a valid URL')
      .nullable()
      .optional(),
    demo_url: z
      .string()
      .trim()
      .url('demo_url must be a valid URL')
      .nullable()
      .optional(),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;

/**
 * PUT /api/projects/:id request contract
 *
 * Validation rules:
 * - track_id: optional trimmed non-empty string
 * - title: optional trimmed 1-200 character string
 * - description: optional trimmed 1-5000 character string
 * - repository_url: optional/nullable valid URL
 * - demo_url: optional/nullable valid URL
 * - Strict: rejects unknown or protected fields (e.g. id, team_id, status, submitted_at)
 */
export const updateProjectSchema = z
  .object({
    track_id: z.string().trim().min(1, 'track_id must not be empty').optional(),
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .max(200, 'title must be at most 200 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .min(1, 'description must not be empty')
      .max(5000, 'description must be at most 5000 characters')
      .optional(),
    repository_url: z
      .string()
      .trim()
      .url('repository_url must be a valid URL')
      .nullable()
      .optional(),
    demo_url: z
      .string()
      .trim()
      .url('demo_url must be a valid URL')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable field is required',
  });

export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;

export const submitProjectSchema = z.object({}).strict().optional();
export type SubmitProjectRequest = z.infer<typeof submitProjectSchema>;

/**
 * Project response DTO contracts
 */
export const projectDtoSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  track_id: z.string(),
  title: z.string(),
  description: z.string(),
  repository_url: z.string().nullable().optional(),
  demo_url: z.string().nullable().optional(),
  status: projectStatusSchema,
  submitted_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectResponseSchema = z.object({
  data: projectDtoSchema,
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectListResponseSchema = z.object({
  data: z.array(projectDtoSchema),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
