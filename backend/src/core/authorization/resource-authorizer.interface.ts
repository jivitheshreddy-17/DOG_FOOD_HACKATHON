import { AuthenticatedUser, Permission } from '@hackathon/contracts';

/**
 * Reusable abstraction seam for resource-level authorization.
 *
 * Distinct from coarse RBAC:
 * While RBAC verifies whether a role can perform an action in the abstract
 * (e.g., "Can PARTICIPANT update projects?"), a ResourceAuthorizer verifies
 * contextual ownership and relational access
 * (e.g., "Can Participant A update Project X belonging to Team Y?").
 *
 * Implemented by future domain modules (Teams in Phase 4, Projects in Phase 5).
 * Contains zero domain business logic in Phase 3.
 */
export interface ResourceAuthorizer<TResource, TAction = Permission> {
  /**
   * Asserts that an authenticated user is permitted to perform the specified action
   * on the given resource instance.
   *
   * Must throw ForbiddenError if the user does not have permission.
   */
  authorize(user: AuthenticatedUser, resource: TResource, action: TAction): Promise<void>;

  /**
   * Evaluates whether an authenticated user is permitted to perform the specified action
   * on the given resource instance without throwing.
   */
  isAuthorized(user: AuthenticatedUser, resource: TResource, action: TAction): Promise<boolean>;
}
