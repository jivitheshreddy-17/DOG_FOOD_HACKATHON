// Adapted from Module 2 core repositories

export type AuthenticatedRole = 'VISITOR' | 'PARTICIPANT' | 'JUDGE' | 'ORGANIZER' | 'ADMIN';
export type ProjectStatus = 'draft' | 'submitted';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AuthenticatedRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  id?: string;
  email: string;
  passwordHash: string;
  role: AuthenticatedRole;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: CreateUserDto): Promise<UserRecord>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateSessionDto {
  id?: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  findById(id: string): Promise<SessionRecord | null>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  create(data: CreateSessionDto): Promise<SessionRecord>;
  delete(id: string): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

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

export interface ProjectRecord {
  id: string;
  teamId: string;
  trackId: string;
  title: string;
  description: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status: ProjectStatus;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectDto {
  id?: string;
  teamId: string;
  trackId: string;
  title: string;
  description: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status?: ProjectStatus;
  submittedAt?: Date | null;
}

export interface UpdateProjectDto {
  trackId?: string;
  title?: string;
  description?: string;
  repositoryUrl?: string | null;
  demoUrl?: string | null;
  status?: ProjectStatus;
  submittedAt?: Date | null;
}

export interface ProjectRepository {
  findById(id: string): Promise<ProjectRecord | null>;
  findByTeamId(teamId: string): Promise<ProjectRecord | null>;
  create(data: CreateProjectDto): Promise<ProjectRecord>;
  update(id: string, data: UpdateProjectDto): Promise<ProjectRecord>;
}

export interface EventRecord {
  id: string;
  name?: string;
  submissionDeadline?: Date | null;
  createdAt?: Date;
}

export interface EventRepository {
  findById(id: string): Promise<EventRecord | null>;
}

export interface TrackRecord {
  id: string;
  eventId?: string;
  name: string;
  description?: string;
  createdAt?: Date;
}

export interface TrackRepository {
  findById(id: string): Promise<TrackRecord | null>;
  findByEventId?(eventId: string): Promise<TrackRecord[]>;
}

export interface AppRepositories {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  teamRepository: TeamRepository;
  teamMemberRepository: TeamMemberRepository;
  projectRepository: ProjectRepository;
  eventRepository?: EventRepository;
  trackRepository?: TrackRepository;
}

export interface TransactionManager {
  run<T>(operation: (repositories: AppRepositories) => Promise<T>): Promise<T>;
}
