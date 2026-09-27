import { Clock, SystemClock } from '../clock';
import { PasswordHasher, ScryptPasswordHasher } from '../security';
import { Config } from '../config';
import {
  UserRepository,
  SessionRepository,
  TeamRepository,
  TeamMemberRepository,
  ProjectRepository,
  EventRepository,
  TrackRepository,
  RubricRepository,
  JudgeAssignmentRepository,
  ScoreRepository,
  TransactionManager,
  NormalizationRepository,
} from '../repositories';
import { SessionService } from '../../modules/identity/services/session.service';
import { AuthenticationService } from '../../modules/identity/services/authentication.service';
import { TeamService } from '../../modules/teams/services/team.service';
import { TeamResourceAuthorizer } from '../../modules/teams/authorization/team-resource-authorizer';
import { ProjectService } from '../../modules/projects/services/project.service';
import { ProjectResourceAuthorizer } from '../../modules/projects/authorization/project-resource-authorizer';
import { JudgingService } from '../../modules/judging/judging.service';
import { NormalizationService } from '../../modules/normalization/normalization.service';
import { NormalizationEngine } from '../domain/normalization/engine';

export interface AppRepositories {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  teamRepository: TeamRepository;
  teamMemberRepository: TeamMemberRepository;
  projectRepository: ProjectRepository;
  eventRepository?: EventRepository;
  trackRepository?: TrackRepository;
  rubricRepository?: RubricRepository;
  judgeAssignmentRepository?: JudgeAssignmentRepository;
  scoreRepository?: ScoreRepository;
  normalizationRepository?: NormalizationRepository;
}

export interface AppDependencies {
  clock: Clock;
  repositories: AppRepositories;
  transactionManager: TransactionManager;
  passwordHasher: PasswordHasher;
  sessionService: SessionService;
  authenticationService: AuthenticationService;
  teamService: TeamService;
  teamResourceAuthorizer: TeamResourceAuthorizer;
  projectResourceAuthorizer: ProjectResourceAuthorizer;
  projectService: ProjectService;
  judgingService: JudgingService;
  normalizationService: NormalizationService;
}

/**
 * Creates default placeholder repositories for standalone backend execution.
 * Production will replace these with Person 1's Prisma-backed implementations.
 * Tests will replace these with in-memory test doubles.
 */
export function createPlaceholderRepositories(): AppRepositories {
  const notImplemented = (repoName: string, methodName: string) => async () => {
    throw new Error(
      `[Repository Unimplemented] ${repoName}.${methodName} is awaiting Person 1 database/Prisma integration.`
    );
  };

  return {
    userRepository: {
      findById: notImplemented('UserRepository', 'findById'),
      findByEmail: notImplemented('UserRepository', 'findByEmail'),
      create: notImplemented('UserRepository', 'create'),
    },
    sessionRepository: {
      findById: notImplemented('SessionRepository', 'findById'),
      findByTokenHash: notImplemented('SessionRepository', 'findByTokenHash'),
      create: notImplemented('SessionRepository', 'create'),
      delete: notImplemented('SessionRepository', 'delete'),
      deleteByTokenHash: notImplemented('SessionRepository', 'deleteByTokenHash'),
    },
    teamRepository: {
      findById: notImplemented('TeamRepository', 'findById'),
      findByInviteToken: notImplemented('TeamRepository', 'findByInviteToken'),
      findByInviteTokenHash: notImplemented('TeamRepository', 'findByInviteTokenHash'),
      create: notImplemented('TeamRepository', 'create'),
      update: notImplemented('TeamRepository', 'update'),
    },
    teamMemberRepository: {
      findByTeamAndUser: notImplemented('TeamMemberRepository', 'findByTeamAndUser'),
      findByEventAndUser: notImplemented('TeamMemberRepository', 'findByEventAndUser'),
      countByTeam: notImplemented('TeamMemberRepository', 'countByTeam'),
      findByTeamId: notImplemented('TeamMemberRepository', 'findByTeamId'),
      create: notImplemented('TeamMemberRepository', 'create'),
    },
    projectRepository: {
      findById: notImplemented('ProjectRepository', 'findById'),
      findByTeamId: notImplemented('ProjectRepository', 'findByTeamId'),
      findAll: notImplemented('ProjectRepository', 'findAll'),
      create: notImplemented('ProjectRepository', 'create'),
      update: notImplemented('ProjectRepository', 'update'),
    },
    eventRepository: {
      findById: notImplemented('EventRepository', 'findById'),
    },
    trackRepository: {
      findById: notImplemented('TrackRepository', 'findById'),
    },
    rubricRepository: {
      findById: notImplemented('RubricRepository', 'findById'),
      findByEventId: notImplemented('RubricRepository', 'findByEventId'),
      save: notImplemented('RubricRepository', 'save'),
    },
    judgeAssignmentRepository: {
      create: notImplemented('JudgeAssignmentRepository', 'create'),
      findById: notImplemented('JudgeAssignmentRepository', 'findById'),
      findByJudgeAndProject: notImplemented('JudgeAssignmentRepository', 'findByJudgeAndProject'),
      findByJudge: notImplemented('JudgeAssignmentRepository', 'findByJudge'),
      findByEvent: notImplemented('JudgeAssignmentRepository', 'findByEvent'),
      findAll: notImplemented('JudgeAssignmentRepository', 'findAll'),
      updateStatus: notImplemented('JudgeAssignmentRepository', 'updateStatus'),
      updateStatusWithOcc: notImplemented('JudgeAssignmentRepository', 'updateStatusWithOcc'),
      getProgressStats: notImplemented('JudgeAssignmentRepository', 'getProgressStats'),
    },
    scoreRepository: {
      findByAssignmentId: notImplemented('ScoreRepository', 'findByAssignmentId'),
      upsert: notImplemented('ScoreRepository', 'upsert'),
    },
    normalizationRepository: {
      createRun: notImplemented('NormalizationRepository', 'createRun'),
      findRunById: notImplemented('NormalizationRepository', 'findRunById'),
      findRunsByEvent: notImplemented('NormalizationRepository', 'findRunsByEvent'),
      findResultsByRun: notImplemented('NormalizationRepository', 'findResultsByRun'),
    },
  };
}

/**
 * Creates a placeholder transaction manager for standalone backend execution.
 * Production will replace this with Person 1's Prisma-backed implementation.
 * Tests will replace this with the in-memory transaction manager test double.
 */
export function createPlaceholderTransactionManager(): TransactionManager {
  return {
    async run<T>(_operation: (repos: AppRepositories) => Promise<T>): Promise<T> {
      throw new Error(
        `[TransactionManager Unimplemented] TransactionManager.run is awaiting Person 1 database/Prisma integration.`
      );
    },
  };
}

/**
 * Assembles application dependencies with optional overrides and environment configuration.
 */
export function resolveDependencies(
  overrides?: Partial<AppDependencies>,
  config?: Config
): AppDependencies {
  const defaultRepositories = createPlaceholderRepositories();
  const defaultTransactionManager = createPlaceholderTransactionManager();

  const clock = overrides?.clock ?? new SystemClock();
  const repositories = {
    ...defaultRepositories,
    ...(overrides?.repositories ?? {}),
  };
  const transactionManager = overrides?.transactionManager ?? defaultTransactionManager;
  const passwordHasher = overrides?.passwordHasher ?? new ScryptPasswordHasher();
  const sessionTtlSeconds = config?.sessionTtlSeconds ?? 604800;

  const sessionService =
    overrides?.sessionService ??
    new SessionService({
      sessionRepository: repositories.sessionRepository,
      userRepository: repositories.userRepository,
      clock,
      sessionTtlSeconds,
    });

  const authenticationService =
    overrides?.authenticationService ??
    new AuthenticationService({
      userRepository: repositories.userRepository,
      passwordHasher,
    });

  const teamResourceAuthorizer =
    overrides?.teamResourceAuthorizer ??
    new TeamResourceAuthorizer(repositories.teamMemberRepository);

  const teamService =
    overrides?.teamService ??
    new TeamService({
      teamRepository: repositories.teamRepository,
      teamMemberRepository: repositories.teamMemberRepository,
      transactionManager,
      teamResourceAuthorizer,
      eventRepository: repositories.eventRepository,
    });

  const projectResourceAuthorizer =
    overrides?.projectResourceAuthorizer ??
    new ProjectResourceAuthorizer(repositories.teamMemberRepository);
  const projectService =
    overrides?.projectService ??
    new ProjectService({
      projectRepository: repositories.projectRepository,
      teamRepository: repositories.teamRepository,
      trackRepository: repositories.trackRepository,
      transactionManager,
      resourceAuthorizer: projectResourceAuthorizer,
      eventRepository: repositories.eventRepository,
      clock,
    });

  const judgingService =
    overrides?.judgingService ??
    new JudgingService({
      judgeAssignmentRepository: repositories.judgeAssignmentRepository!,
      rubricRepository: repositories.rubricRepository!,
      scoreRepository: repositories.scoreRepository!,
      transactionManager,
      projectRepository: repositories.projectRepository,
      trackRepository: repositories.trackRepository!,
      userRepository: repositories.userRepository,
      eventRepository: repositories.eventRepository!,
    });

  const normalizationEngine = new NormalizationEngine();

  const normalizationService =
    overrides?.normalizationService ??
    new NormalizationService({
      normalizationRepository: repositories.normalizationRepository!,
      scoreRepository: repositories.scoreRepository!,
      rubricRepository: repositories.rubricRepository!,
      judgeAssignmentRepository: repositories.judgeAssignmentRepository!,
      engine: normalizationEngine,
    });

  return {
    clock,
    repositories,
    transactionManager,
    passwordHasher,
    sessionService,
    authenticationService,
    teamService,
    teamResourceAuthorizer,
    projectResourceAuthorizer,
    projectService,
    judgingService,
    normalizationService,
  };
}
