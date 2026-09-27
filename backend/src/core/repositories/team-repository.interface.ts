export interface TeamRecord {
  id: string;
  eventId: string;
  name: string;
  inviteToken?: string | null;
  inviteTokenHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamDto {
  id?: string;
  eventId: string;
  name: string;
  inviteToken?: string | null;
  inviteTokenHash?: string | null;
}

export interface TeamRepository {
  findById(id: string): Promise<TeamRecord | null>;
  findByInviteToken(token: string): Promise<TeamRecord | null>;
  findByInviteTokenHash(tokenHash: string): Promise<TeamRecord | null>;
  create(data: CreateTeamDto): Promise<TeamRecord>;
  update(
    id: string,
    data: Partial<Omit<TeamRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<TeamRecord>;
}
