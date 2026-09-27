import { z } from 'zod';
import { authenticatedRoleSchema, AuthenticatedRole } from './roles';

/**
 * Backend-level authentication identity contract.
 * Represents the authenticated principal with minimum required information.
 */
export interface AuthenticatedUser {
  id: string;
  role: AuthenticatedRole;
}

export const authenticatedUserSchema = z.object({
  id: z.string().min(1),
  role: authenticatedRoleSchema,
});

/**
 * POST /api/auth/login contracts
 */
export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string().min(1),
      role: authenticatedRoleSchema,
      email: z.string().email().optional(),
    }),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * POST /api/auth/logout contracts
 */
export const logoutResponseSchema = z.object({
  data: z.object({
    success: z.boolean(),
  }),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/**
 * GET /api/auth/me contracts
 */
export const meResponseSchema = z.object({
  data: z.union([
    z.object({
      user: z.object({
        id: z.string().min(1),
        role: authenticatedRoleSchema,
      }),
    }),
    z.object({
      id: z.string().min(1),
      role: authenticatedRoleSchema,
    }),
  ]),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
