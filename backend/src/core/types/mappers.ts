import {
  AuthenticatedUser,
  TeamResponse,
  TeamMemberDto,
  ProjectResponse,
  ProjectDto,
} from '@hackathon/contracts';
import { UserRecord } from '../repositories/user-repository.interface';
import { TeamRecord } from '../repositories/team-repository.interface';
import { TeamMemberRecord } from '../repositories/team-member-repository.interface';
import { ProjectRecord } from '../repositories/project-repository.interface';

/**
 * Maps an internal User persistence record to a safe public/authenticated identity,
 * ensuring internal fields (such as passwordHash) are never leaked.
 */
export function toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  return {
    id: user.id,
    role: user.role,
  };
}

/**
 * Maps a persistence TeamMemberRecord to a sanitized TeamMemberDto.
 */
export function toTeamMemberDto(member: TeamMemberRecord): TeamMemberDto {
  return {
    id: member.id,
    user_id: member.userId,
    team_id: member.teamId,
    created_at: member.createdAt ? member.createdAt.toISOString() : undefined,
  };
}

/**
 * Maps a persistence TeamRecord and optional member records to a sanitized TeamResponse envelope data object.
 */
export function toTeamResponseDto(
  team: TeamRecord,
  members?: TeamMemberRecord[]
): TeamResponse['data'] {
  return {
    id: team.id,
    event_id: team.eventId,
    name: team.name,
    members: members ? members.map(toTeamMemberDto) : undefined,
    created_at: team.createdAt ? team.createdAt.toISOString() : undefined,
  };
}

/**
 * Maps an internal Project persistence record to a public ProjectDto.
 */
export function toProjectDto(project: ProjectRecord): ProjectDto {
  return {
    id: project.id,
    team_id: project.teamId,
    track_id: project.trackId,
    title: project.title,
    description: project.description,
    repository_url: project.repositoryUrl ?? null,
    demo_url: project.demoUrl ?? null,
    status: project.status,
    submitted_at: project.submittedAt ? project.submittedAt.toISOString() : null,
    created_at: project.createdAt ? project.createdAt.toISOString() : undefined,
    updated_at: project.updatedAt ? project.updatedAt.toISOString() : undefined,
  };
}

/**
 * Maps an internal Project persistence record to a sanitized ProjectResponse envelope data object.
 */
export function toProjectResponseDto(
  project: ProjectRecord
): ProjectResponse['data'] {
  return toProjectDto(project);
}
