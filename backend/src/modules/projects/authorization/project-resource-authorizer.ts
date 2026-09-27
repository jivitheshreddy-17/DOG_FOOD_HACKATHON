import {
  AuthenticatedUser,
  Permission,
  PERMISSIONS,
  ROLES,
} from '@hackathon/contracts';
import { ResourceAuthorizer } from '../../../core/authorization';
import {
  ProjectRecord,
  TeamMemberRepository,
} from '../../../core/repositories';
import { ForbiddenError } from '../../../core/errors';

export class ProjectResourceAuthorizer
  implements ResourceAuthorizer<ProjectRecord>
{
  constructor(private readonly teamMemberRepository: TeamMemberRepository) {}

  async isAuthorized(
    user: AuthenticatedUser,
    project: ProjectRecord,
    action: Permission
  ): Promise<boolean> {
    if (
      user.role === ROLES.ADMIN ||
      user.role === ROLES.ORGANIZER
    ) {
      return true;
    }

    // No judge-assignment repository exists yet; PROJECT_VIEW is the
    // established judge visibility boundary until that contract is added.
    if (user.role === ROLES.JUDGE && action === PERMISSIONS.PROJECT_VIEW) {
      return true;
    }

    if (
      action === PERMISSIONS.PROJECT_VIEW ||
      action === PERMISSIONS.PROJECT_UPDATE ||
      action === PERMISSIONS.PROJECT_CREATE ||
      action === PERMISSIONS.PROJECT_SUBMIT
    ) {
      return Boolean(
        await this.teamMemberRepository.findByTeamAndUser(
          project.teamId,
          user.id
        )
      );
    }

    return false;
  }

  async authorize(
    user: AuthenticatedUser,
    project: ProjectRecord,
    action: Permission
  ): Promise<void> {
    if (!(await this.isAuthorized(user, project, action))) {
      throw new ForbiddenError(
        'You do not have permission to perform this action on this project'
      );
    }
  }
}
