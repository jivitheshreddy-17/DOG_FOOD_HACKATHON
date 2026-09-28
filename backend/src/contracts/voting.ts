import { z } from 'zod';

export const votingModeSchema = z.enum(['DISABLED', 'OPEN_LINK', 'EMAIL_GATED', 'AUTHENTICATED']);
export type VotingModeDto = z.infer<typeof votingModeSchema>;

export const votingConfigSchema = z.object({
  eventId: z.string().min(1),
  votingMode: votingModeSchema,
  votingStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
  votingEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
  isResultsPublished: z.boolean(),
  maxVotesPerVoter: z.number().int().min(1).max(100),
});
export type VotingConfigDto = z.infer<typeof votingConfigSchema>;

export const updateVotingConfigRequestSchema = z
  .object({
    votingMode: votingModeSchema.optional(),
    votingStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
    votingEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
    isResultsPublished: z.boolean().optional(),
    maxVotesPerVoter: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.votingStartsAt && data.votingEndsAt) {
        return new Date(data.votingStartsAt) <= new Date(data.votingEndsAt);
      }
      return true;
    },
    {
      message: 'votingStartsAt must be before or equal to votingEndsAt',
      path: ['votingStartsAt'],
    }
  );
export type UpdateVotingConfigRequest = z.infer<typeof updateVotingConfigRequestSchema>;

export const submitVoteRequestSchema = z.object({
  projectId: z.string().min(1),
  verificationToken: z.string().optional(),
});
export type SubmitVoteRequest = z.infer<typeof submitVoteRequestSchema>;

export const otpRequestSchema = z.object({
  email: z.string().email(),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().min(6).max(6),
});
export type OtpVerifyRequest = z.infer<typeof otpVerifySchema>;

export const communityVoteResponseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  projectId: z.string(),
  voterType: votingModeSchema,
  points: z.number().int(),
  createdAt: z.string(),
});
export type CommunityVoteResponseDto = z.infer<typeof communityVoteResponseSchema>;

export interface BallotProjectDto {
  id: string;
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl?: string | null;
  trackId: string;
}

export interface BallotResponseDto {
  eventId: string;
  projects: BallotProjectDto[];
}

export const createCommentRequestSchema = z.object({
  content: z.string().min(1).max(1000),
  authorName: z.string().max(100).optional(),
});
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const getGalleryQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  trackId: z.string().optional(),
});
export type GetGalleryQuery = z.infer<typeof getGalleryQuerySchema>;

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().min(1).max(100).optional(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

