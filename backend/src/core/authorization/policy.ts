import {
  ROLES,
  AuthenticatedRole,
  AuthenticatedUser,
  PERMISSIONS,
  Permission,
} from '@hackathon/contracts';

/**
 * Authoritative centralized mapping from authenticated roles to granted permissions.
 *
 * Design Guarantees:
 * - Deterministic, static, in-memory evaluation with zero database calls.
 * - Explicit privilege grants: roles only hold the permissions expressly declared here.
 * - ADMIN privileges are explicitly enumerated and do not magically inherit unassigned roles.
 * - VISITOR is not an authenticated role and has no entries here.
 */
export const ROLE_PERMISSIONS: Readonly<Record<AuthenticatedRole, ReadonlySet<Permission>>> = {
  [ROLES.PARTICIPANT]: new Set<Permission>([
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.TEAM_JOIN,
    PERMISSIONS.TEAM_INVITE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_SUBMIT,
    PERMISSIONS.PROJECT_VIEW,
  ]),

  [ROLES.JUDGE]: new Set<Permission>([
    PERMISSIONS.JUDGE_EVALUATE,
    PERMISSIONS.JUDGE_VIEW,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.PROJECT_VIEW,
  ]),

  [ROLES.ORGANIZER]: new Set<Permission>([
    PERMISSIONS.EVENT_MANAGE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.JUDGE_VIEW,
  ]),

  [ROLES.ADMIN]: new Set<Permission>([
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.EVENT_MANAGE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.JUDGE_VIEW,
  ]),
};

/**
 * Checks whether an authenticated user matches at least one of the specified roles.
 */
export function hasRole(
  user: AuthenticatedUser | undefined,
  ...roles: AuthenticatedRole[]
): boolean {
  if (!user) {
    return false;
  }
  return roles.includes(user.role);
}

/**
 * Retrieves the complete set of permissions assigned to an authenticated role.
 */
export function getPermissionsForRole(role: AuthenticatedRole): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role] ?? new Set<Permission>();
}

/**
 * Checks whether a given role holds a specific permission according to centralized policy.
 */
export function hasPermission(role: AuthenticatedRole, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return granted ? granted.has(permission) : false;
}

/**
 * Checks whether a given role holds at least one of the specified permissions.
 */
export function hasAnyPermission(role: AuthenticatedRole, permissions: Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) {
    return false;
  }
  return permissions.some((perm) => granted.has(perm));
}

/**
 * Checks whether a given role holds all of the specified permissions.
 */
export function hasAllPermissions(role: AuthenticatedRole, permissions: Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) {
    return false;
  }
  return permissions.every((perm) => granted.has(perm));
}
