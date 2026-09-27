import { z } from 'zod';

/**
 * POST /api/teams request contract
 */
export const createTeamSchema = z.object({
  event_id: z.string().trim().min(1, 'event_id is required'),
  name: z.string().trim().min(1, 'name is required').max(100, 'name must be at most 100 characters'),
});

export type CreateTeamRequest = z.infer<typeof createTeamSchema>;

/**
 * POST /api/teams/join request contract
 */
export const joinTeamSchema = z.object({
  invite_token: z.string().trim().min(1, 'invite_token is required'),
});

export type JoinTeamRequest = z.infer<typeof joinTeamSchema>;

/**
 * POST /api/teams/invite request & response contract
 */
export const createTeamInviteSchema = z.object({
  team_id: z.string().trim().min(1, 'team_id is required'),
});

export type CreateTeamInviteRequest = z.infer<typeof createTeamInviteSchema>;

export const teamInviteResponseSchema = z.object({
  data: z.object({
    team_id: z.string(),
    invite_token: z.string(),
  }),
});

export type TeamInviteResponse = z.infer<typeof teamInviteResponseSchema>;

/**
 * Team response DTO contracts
 */
export const teamMemberSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  team_id: z.string(),
  created_at: z.string().datetime().optional(),
});

export type TeamMemberDto = z.infer<typeof teamMemberSchema>;

export const teamResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    event_id: z.string(),
    name: z.string(),
    members: z.array(teamMemberSchema).optional(),
    created_at: z.string().datetime().optional(),
  }),
});

export type TeamResponse = z.infer<typeof teamResponseSchema>;
