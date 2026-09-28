import { VotingMode } from '@prisma/client';

export interface CommunityVoteDTO {
  id?: string;
  eventId: string;
  projectId: string;
  voterIdentity: string;
  voterType: VotingMode;
  userId?: string | null;
  points?: number;
  createdAt?: Date;
}

export interface CommunityVoteRepository {
  create(data: CommunityVoteDTO): Promise<CommunityVoteDTO>;
  findByUnique(eventId: string, voterIdentity: string, projectId: string): Promise<CommunityVoteDTO | null>;
  countByVoter(eventId: string, voterIdentity: string): Promise<number>;
  countByProject(eventId: string, projectId: string): Promise<number>;
  listByEvent(eventId: string): Promise<CommunityVoteDTO[]>;
  getEventVoteTotals?(eventId: string): Promise<{ projectId: string; totalVotes: number }[]>;
  lockVoterForEvent?(eventId: string, voterIdentity: string): Promise<() => void>;
}
