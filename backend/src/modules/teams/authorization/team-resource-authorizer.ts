import { AuthenticatedUser, Permission, ROLES } from '@hackathon/contracts';
import { ResourceAuthorizer, PERMISSIONS } from '../../../core/authorization';
import { TeamRecord, TeamMemberRepository } from '../../../core/repositories';
import { ForbiddenError } from '../../../core/errors';

/**
 * Concrete ResourceAuthorizer for Team domain resources.
 *
 * Enforces instance-level contextual rules:
 * - Organizers and Admins hold elevated management authority.
 * - For TEAM_INVITE: Authenticated participants must be active members of the target team.
 *   Non-members receive HTTP 403 FORBIDDEN.
 */
export class TeamResourceAuthorizer implements ResourceAuthorizer<TeamRecord> {
  constructor(private teamMemberRepository: TeamMemberRepository) {}

  async isAuthorized(
    user: AuthenticatedUser,
    resource: TeamRecord,
    action: Permission
  ): Promise<boolean> {
    // Elevate platform administrators and organizers
    if (user.role === ROLES.ORGANIZER || user.role === ROLES.ADMIN) {
      return true;
    }

    if (action === PERMISSIONS.TEAM_INVITE || action === PERMISSIONS.TEAM_VIEW) {
      const membership = await this.teamMemberRepository.findByTeamAndUser(
        resource.id,
        user.id
      );
      return Boolean(membership);
    }

    return false;
  }

  async authorize(
    user: AuthenticatedUser,
    resource: TeamRecord,
    action: Permission
  ): Promise<void> {
    const allowed = await this.isAuthorized(user, resource, action);
    if (!allowed) {
      throw new ForbiddenError(
        'You do not have permission to perform this action on this team'
      );
    }
  }
}
