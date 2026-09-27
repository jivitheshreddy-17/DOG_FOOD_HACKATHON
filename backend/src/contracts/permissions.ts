import { z } from 'zod';

/**
 * Granular application permissions vocabulary.
 * Forms the foundation for role-based and resource-based authorization.
 */
export const PERMISSIONS = {
  // Team permissions
  TEAM_CREATE: 'TEAM_CREATE',
  TEAM_JOIN: 'TEAM_JOIN',
  TEAM_INVITE: 'TEAM_INVITE',
  TEAM_VIEW: 'TEAM_VIEW',

  // Project permissions
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_SUBMIT: 'PROJECT_SUBMIT',
  PROJECT_VIEW: 'PROJECT_VIEW',

  // Judging permissions
  JUDGE_EVALUATE: 'JUDGE_EVALUATE',
  JUDGE_VIEW: 'JUDGE_VIEW',

  // Event & Administration permissions
  EVENT_MANAGE: 'EVENT_MANAGE',
  USER_MANAGE: 'USER_MANAGE',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const permissionSchema = z.nativeEnum(PERMISSIONS);

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];
