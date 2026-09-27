import {
  AuthenticatedUser,
  CreateTeamRequest,
  CreateTeamInviteRequest,
  JoinTeamRequest,
  PERMISSIONS,
} from '@hackathon/contracts';
import {
  TeamRepository,
  TeamMemberRepository,
  EventRepository,
  TransactionManager,
  TeamRecord,
  TeamMemberRecord,
} from '../../../core/repositories';
import { ResourceAuthorizer } from '../../../core/authorization';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../core/errors';
import { generateInviteToken, hashInviteToken } from '../security/invite-token';

export interface TeamWithMembers {
  team: TeamRecord;
  members: TeamMemberRecord[];
}

export interface TeamServiceDependencies {
  teamRepository: TeamRepository;
  teamMemberRepository: TeamMemberRepository;
  transactionManager: TransactionManager;
  teamResourceAuthorizer?: ResourceAuthorizer<TeamRecord>;
  eventRepository?: EventRepository;
}

export class TeamService {
  private teamRepository: TeamRepository;
  private teamMemberRepository: TeamMemberRepository;
  private transactionManager: TransactionManager;
  private teamResourceAuthorizer?: ResourceAuthorizer<TeamRecord>;
  private eventRepository?: EventRepository;

  constructor(dependencies: TeamServiceDependencies) {
    this.teamRepository = dependencies.teamRepository;
    this.teamMemberRepository = dependencies.teamMemberRepository;
    this.transactionManager = dependencies.transactionManager;
    this.teamResourceAuthorizer = dependencies.teamResourceAuthorizer;
    this.eventRepository = dependencies.eventRepository;
  }

  /**
   * Creates a new team and atomically enrolls the creator as its first member.
   *
   * Business Invariants:
   * 1. Requester must be authenticated (guaranteed by route guard).
   * 2. Team name must be non-empty and <= 100 chars (trimmed).
   * 3. Event existence is validated if an eventRepository is configured.
   * 4. A user can belong to only one team per event (one-team-per-participant-per-event).
   * 5. Atomicity: Team creation and creator membership commit together or rollback completely.
   */
  async createTeam(
    user: AuthenticatedUser,
    request: CreateTeamRequest
  ): Promise<TeamWithMembers> {
    const trimmedName = request.name?.trim();
    if (!trimmedName || trimmedName.length === 0) {
      throw new ValidationError('Team name must not be empty');
    }
    if (trimmedName.length > 100) {
      throw new ValidationError('Team name must be at most 100 characters');
    }

    const eventId = request.event_id?.trim();
    if (!eventId || eventId.length === 0) {
      throw new ValidationError('Event ID must not be empty');
    }

    // Optional event verification if eventRepository is configured
    if (this.eventRepository) {
      const event = await this.eventRepository.findById(eventId);
      if (!event) {
        throw new NotFoundError('Event not found');
      }
    }

    // Atomic transaction: check one-team-per-event, create team, create creator membership
    return this.transactionManager.run(async (repos) => {
      // Check if creator is already a member of any team for this event
      const existingMembership =
        await repos.teamMemberRepository.findByEventAndUser(eventId, user.id);
      if (existingMembership) {
        throw new ConflictError(
          'User already belongs to a team for this event'
        );
      }

      // Create team
      const team = await repos.teamRepository.create({
        eventId,
        name: trimmedName,
      });

      // Create creator membership
      const member = await repos.teamMemberRepository.create({
        teamId: team.id,
        userId: user.id,
        eventId,
      });

      return {
        team,
        members: [member],
      };
    });
  }

  /**
   * Issues a high-entropy, unpredictable invitation token for an existing team.
   *
   * Authorization:
   * - Requester must hold TEAM_INVITE (enforced by route guard).
   * - Requester must be an active member of the target team (enforced by TeamResourceAuthorizer).
   *
   * Security Invariants:
   * - Generates 256 bits of cryptographically secure random entropy.
   * - Stores only SHA-256 token hash in persistent storage; raw token is delivered to caller.
   */
  async createInvite(
    user: AuthenticatedUser,
    request: CreateTeamInviteRequest
  ): Promise<{ teamId: string; inviteToken: string }> {
    const teamId = request.team_id?.trim();
    if (!teamId || teamId.length === 0) {
      throw new ValidationError('Team ID must not be empty');
    }

    const team = await this.teamRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    // Resource authorization: verify user is a member of THIS team
    if (this.teamResourceAuthorizer) {
      await this.teamResourceAuthorizer.authorize(
        user,
        team,
        PERMISSIONS.TEAM_INVITE
      );
    }

    const rawInviteToken = generateInviteToken();
    const inviteTokenHash = hashInviteToken(rawInviteToken);

    await this.teamRepository.update(team.id, {
      inviteTokenHash,
    });

    return {
      teamId: team.id,
      inviteToken: rawInviteToken,
    };
  }

  /**
   * Joins an authenticated participant into a team using a valid invitation token.
   *
   * Business Invariants:
   * 1. Invite token must be valid and resolve to an existing team (404 NOT_FOUND if invalid).
   * 2. User must not already be a member of the target team (409 CONFLICT).
   * 3. User must not belong to another team for the same event (409 CONFLICT).
   * 4. Team capacity must not exceed 4 members (409 CONFLICT).
   * 5. Atomicity: Validation and membership creation occur inside a transactional boundary.
   */
  async joinTeam(
    user: AuthenticatedUser,
    request: JoinTeamRequest
  ): Promise<TeamWithMembers> {
    const inviteToken = request.invite_token?.trim();
    if (!inviteToken || inviteToken.length === 0) {
      throw new ValidationError('Invitation token must not be empty');
    }

    const tokenHash = hashInviteToken(inviteToken);

    // Look up team by hashed token (with fallback to raw token for backward compatibility)
    let team = await this.teamRepository.findByInviteTokenHash(tokenHash);
    if (!team && this.teamRepository.findByInviteToken) {
      team = await this.teamRepository.findByInviteToken(inviteToken);
    }

    if (!team) {
      throw new NotFoundError('Invalid or expired invitation token');
    }

    // Execute atomic transactional join
    return this.transactionManager.run(async (repos) => {
      // 1. Verify user is not already a member of this specific team
      const existingInTeam =
        await repos.teamMemberRepository.findByTeamAndUser(team!.id, user.id);
      if (existingInTeam) {
        throw new ConflictError('User is already a member of this team');
      }

      // 2. Verify user is not already in another team for the same event
      const existingInEvent =
        await repos.teamMemberRepository.findByEventAndUser(
          team!.eventId,
          user.id
        );
      if (existingInEvent) {
        throw new ConflictError(
          'User already belongs to a team for this event'
        );
      }

      // 3. Enforce maximum team size of 4 members
      const currentCount = await repos.teamMemberRepository.countByTeam(
        team!.id
      );
      if (currentCount >= 4) {
        throw new ConflictError(
          'Team has reached maximum capacity of 4 members'
        );
      }

      // 4. Create membership
      await repos.teamMemberRepository.create({
        teamId: team!.id,
        userId: user.id,
        eventId: team!.eventId,
      });

      // 5. Query updated membership list
      const members = await repos.teamMemberRepository.findByTeamId(team!.id);

      return {
        team: team!,
        members,
      };
    });
  }
}
