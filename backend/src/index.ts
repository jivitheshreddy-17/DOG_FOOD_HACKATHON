/**
 * DOGFOOD 2026 — Fastify Backend Entry Point
 *
 * Module 1: server bootstrap only.
 * Module 2 will add: session hook, RBAC pre-handler, route plugins.
 * Module 3 will add: judge scores, peer-isolation guard, CSV export.
 */

import Fastify, { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import Redis from "ioredis";

// ── Singletons (exported for use in route plugins) ────────────────────────────
import { prisma } from "./infrastructure/database/prisma.client";
export { prisma };

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

import { createApp } from "./app";
import { PrismaUserRepository } from "./infrastructure/database/repositories/prisma-user.repository";
import { PrismaSessionRepository } from "./infrastructure/database/repositories/prisma-session.repository";
import { PrismaTeamRepository } from "./infrastructure/database/repositories/prisma-team.repository";
import { PrismaTeamMemberRepository } from "./infrastructure/database/repositories/prisma-team-member.repository";
import { PrismaProjectRepository } from "./infrastructure/database/repositories/prisma-project.repository";
import { PrismaEventRepository } from "./infrastructure/database/repositories/prisma-event.repository";
import { PrismaTrackRepository } from "./infrastructure/database/repositories/prisma-track.repository";
import { PrismaRubricRepository } from "./infrastructure/database/repositories/prisma-rubric.repository";
import { PrismaJudgeAssignmentRepository } from "./infrastructure/database/repositories/prisma-judge-assignment.repository";
import { PrismaScoreRepository } from "./infrastructure/database/repositories/prisma-score.repository";
import { PrismaNormalizationRepository } from "./infrastructure/database/repositories/prisma-normalization.repository";
import { PrismaCommunityVoteRepository } from "./infrastructure/database/repositories/prisma-community-vote.repository";
import { PrismaProjectCommentRepository } from "./infrastructure/database/repositories/prisma-project-comment.repository";
import { PrismaVerificationTokenRepository } from "./infrastructure/database/repositories/prisma-verification-token.repository";
import { PrismaAuditEventRepository } from "./infrastructure/database/repositories/prisma-audit-event.repository";
import { PrismaTransactionManager } from "./infrastructure/database/prisma.transaction";

// ── Server factory (exported for testing) ─────────────────────────────────────
export async function buildServer(): Promise<FastifyInstance> {
  const app = createApp({
    dependencies: {
      repositories: {
        userRepository: new PrismaUserRepository(prisma),
        sessionRepository: new PrismaSessionRepository(prisma),
        teamRepository: new PrismaTeamRepository(prisma),
        teamMemberRepository: new PrismaTeamMemberRepository(prisma),
        projectRepository: new PrismaProjectRepository(prisma),
        eventRepository: new PrismaEventRepository(prisma),
        trackRepository: new PrismaTrackRepository(prisma),
        rubricRepository: new PrismaRubricRepository(prisma),
        judgeAssignmentRepository: new PrismaJudgeAssignmentRepository(prisma),
        scoreRepository: new PrismaScoreRepository(prisma),
        normalizationRepository: new PrismaNormalizationRepository(prisma),
        communityVoteRepository: new PrismaCommunityVoteRepository(prisma),
        projectCommentRepository: new PrismaProjectCommentRepository(prisma),
        verificationTokenRepository: new PrismaVerificationTokenRepository(prisma),
        auditEventRepository: new PrismaAuditEventRepository(prisma),
      },
      transactionManager: new PrismaTransactionManager(prisma),
    },
    serverOptions: {
      logger: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty" }
            : undefined,
      },
      trustProxy: process.env.TRUST_PROXY === 'true' ? true : (process.env.TRUST_PROXY || false),
    },
  });

  // ── Core plugins ──────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: process.env.SESSION_SECRET ?? "dogfood-hackathon-2026-secret",
    parseOptions: {},
  });

  // ── Health check (used by Docker health check + frontend depends_on) ──────
  app.get("/health", async (_req, reply) => {
    // Verify postgres connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.code(503).send({ status: "error", detail: "database unavailable" });
    }
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });

  await app.ready();
  console.log(app.printRoutes());

  return app;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  const PORT = parseInt(process.env.PORT ?? "3001", 10);

  // Connect Redis eagerly so any auth hooks have it ready
  await redis.connect().catch(() => {
    // lazyConnect mode — errors surfaced on first command
  });

  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[backend] listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
