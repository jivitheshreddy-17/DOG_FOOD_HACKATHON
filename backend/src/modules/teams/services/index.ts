/**
 * Teams Services Convention
 *
 * Future business services for Team Management (Phase 4) will reside here:
 * - CreateTeamService (atomic team creation + creator membership)
 * - TeamInviteService (secure token generation and lookup)
 * - JoinTeamService (capacity enforcement, duplicate check, event membership invariant)
 *
 * Services will use TransactionManager to coordinate atomic repository updates.
 */
export const TEAMS_SERVICES_LOCATION = 'teams/services';
