import { z } from 'zod';

export const ROLES = {
  VISITOR: 'VISITOR',
  PARTICIPANT: 'PARTICIPANT',
  JUDGE: 'JUDGE',
  ORGANIZER: 'ORGANIZER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const roleSchema = z.enum([
  ROLES.VISITOR,
  ROLES.PARTICIPANT,
  ROLES.JUDGE,
  ROLES.ORGANIZER,
  ROLES.ADMIN,
]);

/**
 * Roles that can be assigned to authenticated users.
 * VISITOR is excluded as it represents the conceptual unauthenticated/anonymous state.
 */
export const AUTHENTICATED_ROLES = [
  ROLES.PARTICIPANT,
  ROLES.JUDGE,
  ROLES.ORGANIZER,
  ROLES.ADMIN,
] as const;

export type AuthenticatedRole = (typeof AUTHENTICATED_ROLES)[number];

export const authenticatedRoleSchema = z.enum(AUTHENTICATED_ROLES);
