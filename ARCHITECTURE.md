# Architecture

## Core Application Architecture
The backend is structured around an event-driven, layered clean architecture:

1. **HTTP Routing Layer (Fastify)**: Responsible for authentication (`requireAuth`), authorization (`requirePermission`), payload validation (`zod`), and delegating to the application services. Located in `src/modules/*/*.routes.ts`.
2. **Application Service Layer**: Contains the core business logic and orchestrates data access (e.g., `JudgingService`, `NormalizationEngine`). Located in `src/modules/*/*.service.ts`.
3. **Data Access Layer**: Provides abstractions over Prisma Client via Repository interfaces. Defined in `src/core/repositories/` and implemented in `src/infrastructure/database/repositories/`.

## Tier 2: Judging Subsystem
The judging subsystem integrates the following bounded contexts:
- **Organizer Configuration**: Organizers configure `Rubric` and `JudgeAssignment` structures.
- **Judge Execution**: Judges draft and submit scores based on assignments, persisting `Score` and `ScoreCriterion` entities.
- **Normalization Engine**: The core mathematical engine (Layer 2) that processes raw scores (`Score`) into normalized insights (`JudgeAssignment.normalizedScore`, etc.) to correct for judge severity bias. It runs asynchronously or via scheduled runs.

## Dependencies
- Fastify (HTTP Server)
- Prisma (ORM for Postgres)
- Zod (Schema Validation)
- `node:crypto` (Identifiers, Hashes)
