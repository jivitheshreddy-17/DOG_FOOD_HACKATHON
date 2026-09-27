export interface TeamMemberRecord {
  id: string;
  teamId: string;
  userId: string;
  eventId: string;
  createdAt: Date;
}

export interface CreateTeamMemberDto {
  id?: string;
  teamId: string;
  userId: string;
  eventId: string;
}

export interface TeamMemberRepository {
  findByTeamAndUser(teamId: string, userId: string): Promise<TeamMemberRecord | null>;
  findByEventAndUser(eventId: string, userId: string): Promise<TeamMemberRecord | null>;
  countByTeam(teamId: string): Promise<number>;
  findByTeamId(teamId: string): Promise<TeamMemberRecord[]>;
  create(data: CreateTeamMemberDto): Promise<TeamMemberRecord>;
}
