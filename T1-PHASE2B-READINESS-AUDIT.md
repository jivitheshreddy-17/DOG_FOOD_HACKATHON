# Phase 2B Readiness Audit

## A. MODULE 2 REPOSITORY INVENTORY

Module 2 expects the following repositories and interfaces (`apps/api/src/core/repositories`):

1. **SessionRepository**
   - **Methods**: `findById`, `findByTokenHash`, `create`, `delete`, `deleteByTokenHash`
   - **Input Types**: `CreateSessionDto` (userId, tokenHash, expiresAt)
   - **Output Types**: `SessionRecord` (id, userId, tokenHash, expiresAt, createdAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `Session`. Backed perfectly by Prisma.

2. **UserRepository**
   - **Methods**: `findById`, `findByEmail`, `create`
   - **Input Types**: `CreateUserDto` (email, passwordHash, role)
   - **Output Types**: `UserRecord` (id, email, passwordHash, role, createdAt, updatedAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `User`. Backed perfectly by Prisma.

3. **TeamRepository**
   - **Methods**: `findById`, `findByInviteToken`, `findByInviteTokenHash`, `create`, `update`
   - **Input Types**: `CreateTeamDto`, `Partial<Omit<...>>`
   - **Output Types**: `TeamRecord` (id, eventId, name, inviteToken, inviteTokenHash, createdAt, updatedAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `Team`. Missing timestamps (`createdAt`, `updatedAt`) and raw `inviteToken` is dropped at service level.

4. **TeamMemberRepository**
   - **Methods**: `findByTeamAndUser`, `findByEventAndUser`, `countByTeam`, `findByTeamId`, `create`
   - **Input Types**: `CreateTeamMemberDto` (teamId, userId, eventId)
   - **Output Types**: `TeamMemberRecord` (id, teamId, userId, eventId, createdAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `TeamMember`. Significant structural mismatch (missing ID, eventId, createdAt).

5. **ProjectRepository**
   - **Methods**: `findById`, `findByTeamId`, `create`, `update`
   - **Input Types**: `CreateProjectDto`, `UpdateProjectDto`
   - **Output Types**: `ProjectRecord` (id, teamId, trackId, title, description, repositoryUrl, demoUrl, status, submittedAt, createdAt, updatedAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `Project`. Field name mismatch (`summary` vs `description`) and missing `demoUrl`.

6. **EventRepository**
   - **Methods**: `findById`
   - **Output Types**: `EventRecord` (id, name, submissionDeadline, createdAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `Event`. Field mismatch (`submissionsClose` vs `submissionDeadline`).

7. **TrackRepository**
   - **Methods**: `findById`, `findByEventId`
   - **Output Types**: `TrackRecord` (id, eventId, name, description, createdAt)
   - **Persistence**: Required.
   - **Module 1 Model**: `Track`. Missing `description` and `createdAt`.

8. **TransactionManager**
   - **Methods**: `run<T>(operation: (repos: AppRepositories) => Promise<T>)`
   - **Persistence**: Required. Maps to `prisma.$transaction`.

*Note: There is no `ScoreRepository` in Module 2. Judging/scoring was explicitly deferred by Person 2.*

---

## B. PRISMA MODEL COMPATIBILITY

| Repository | Module 2 Contract | Prisma Model | Compatible? | Required Adapter Mapping | Risk |
|---|---|---|---|---|---|
| UserRepository | `UserRecord` | `User` | Yes | Direct passthrough mapping. | Low |
| SessionRepository | `SessionRecord` | `Session` | Yes | Direct passthrough mapping. | Low |
| TeamRepository | `TeamRecord` | `Team` | Partial | Map `inviteTokenHash` directly. Fake or omit `createdAt`/`updatedAt` since Prisma schema omits them. | Medium |
| TeamMemberRepository | `TeamMemberRecord` | `TeamMember` | Partial | Prisma `TeamMember` uses composite PK `[teamId, userId]` and lacks `id`, `eventId`, `createdAt`. Adapter must synthesize `id` (e.g. `teamId_userId`), resolve `eventId` through the `Team` relation, and mock `createdAt`. | High |
| ProjectRepository | `ProjectRecord` | `Project` | Partial | Map `description` <-> `summary`. Map `repositoryUrl` <-> `repoUrl`. `demoUrl` must be silently dropped since it doesn't exist in Prisma. | High |
| EventRepository | `EventRecord` | `Event` | Partial | Map `submissionDeadline` <-> `submissionsClose`. | Low |
| TrackRepository | `TrackRecord` | `Track` | Partial | Fake/omit `description` and `createdAt` as they don't exist in Prisma. | Low |

---

## C. SESSION PERSISTENCE

Module 2's session implementation is strictly isolated from raw tokens:
1. **Does it expect tokenHash?** Yes.
2. **Does it hash the raw incoming cookie?** Yes, via the Auth/Session services.
3. **Does it expect a raw token in persistence?** No, it specifically targets `tokenHash`.
4. **What does findByTokenHash expect?** A SHA-256 hashed string.
5. **What does SessionService return?** Evaluated `SessionRecord` (with expiration checks).
6. **Required User info?** Identity is linked via `userId`.
7. **Database vs Fixture IDs?** It correctly uses the database `User.id` (CUID), completely oblivious to `fixtureId`.
8. **Missing fields?** None. Module 2's session layer is perfectly aligned with Module 1's `Session` Prisma model.

---

## D. FIXTURE ID VS DATABASE ID

Module 1 uses `User.id` (CUID) as the primary identity and `User.fixtureId` as a helper.
Module 2 correctly treats `User.id` as the absolute database identity. Module 2 is completely decoupled from fixture generation.
No tests, interfaces, or domain logic in Module 2 use hardcoded fixture identities like `jdg_08` or `org_7f2a`. All test boundaries generate their own CUIDs or use standard UUIDs for mocked identities. There is no assumption that a fixture ID is a primary key.

---

## E. SCORE MODEL COMPATIBILITY

While Module 2 does not implement Score repositories, we must explicitly flag a severe compatibility risk for Module 3.

**Compatibility Issue Flagged:**
Module 3's expected API shape implies a flat scalar approach:
```json
{
  "id": "...",
  "project_id": "...",
  "score": 85
}
```

Module 1's actual `Score` Prisma schema mandates a rich JSON criteria structure:
```prisma
{
  id: String
  judgeId: String
  projectId: String
  criteria: Json      // e.g. { "functionality": 4, "quality": 5 }
  comment: String
  createdAt: DateTime
  updatedAt: DateTime
}
```
**Risk:** An adapter layer will eventually need to collapse `criteria` JSON into a scalar `score` integer, and associate `judgeId` correctly, to satisfy Module 3's contract.

---

## F. PROJECT / TEAM / EVENT / TRACK

- **Project**: Missing `demoUrl` in Prisma. Naming mismatches (`description` -> `summary`, `repositoryUrl` -> `repoUrl`).
- **Team**: Prisma lacks timestamp tracking (`createdAt`, `updatedAt`).
- **TeamMember**: Huge mismatch. Prisma uses composite PKs without `eventId` caching or timestamps.
- **Event**: `submissionDeadline` maps to `submissionsClose`.
- **Track**: Prisma lacks `description` and `createdAt`.

Adapter transformations will be heavily required to bridge Module 2's domain objects to the Prisma output.

---

## G. TRANSACTION ABSTRACTION

Module 2 defines `TransactionManager.run<T>(operation: (repos: AppRepositories) => Promise<T>)`.
- **Expected Scope:** The callback must receive a transaction-bound instance of `AppRepositories`.
- **Adapter Boundary:** Clean. We must implement a `PrismaTransactionManager` that wraps `prisma.$transaction`. Inside the transaction block, we instantiate the Prisma-backed repositories passing the `tx` client, and feed those into the Module 2 callback.
- **ORM independence:** Fully independent. It does not leak Prisma types to the domain.

---

## H. TEST COMPATIBILITY

1. **Pure domain/unit tests**: Remain unchanged. They use in-memory dependencies.
2. **Repository contract tests**: Will need to be repointed to use the Prisma adapter and a test PostgreSQL database.
3. **Integration tests**: Will need to spin up the actual Fastify app with the `AppRepositories` composition root wired to Prisma, running against the Docker PostgreSQL instance.
4. **Fixture-dependent tests**: None exist in Module 2, but E2E tests in the future will need mapping from `fixtureId` to `userId`.

---

## I. PACKAGE / TYPESCRIPT COMPATIBILITY

- **Dependencies**: Module 2 uses `zod`, `fastify`, `dotenv`. Module 1 has `zod`, `fastify`, `@fastify/cors`, `@fastify/cookie`, `ioredis`, `@prisma/client`.
- **Merge Strategy**: Module 1's `package.json` should retain Prisma and Redis dependencies while adopting Module 2's domain structure. 
- **TypeScript**: Module 1 uses CommonJS (`module: "commonjs"`); Module 2 uses NodeNext. This might cause compilation issues if not aligned.

---

## J. FILE REUSE / ADAPTER PLAN

- **KEEP AS-IS**: All domain interfaces, validation logic, routing, controllers, services, and authorization in `T1_MODULE2_REVIEW/apps/api/src/core` and `modules`.
- **ADAPT**: `dependencies.ts` (Composition root must swap in Prisma adapters).
- **REPLACE**: `createPlaceholderRepositories()` must be replaced entirely by concrete Prisma implementations.
- **DO NOT COPY**: In-memory repository implementations (except for fast unit tests).

---

## K. PROPOSED PHASE 2B FILE STRUCTURE

```text
MODULE-1_T1/backend/src/
├── core/                        # Domain interfaces (KEEP AS-IS)
├── modules/                     # Services/Logic (KEEP AS-IS)
├── routes/                      # API endpoints (KEEP AS-IS)
├── infrastructure/              # NEW: Module 1 Prisma Adapters
│   ├── database/
│   │   ├── prisma.client.ts            # Prisma singleton
│   │   ├── prisma.transaction.ts       # Implements TransactionManager
│   │   └── repositories/
│   │       ├── prisma-user.repository.ts
│   │       ├── prisma-session.repository.ts
│   │       ├── prisma-team.repository.ts
│   │       ├── prisma-team-member.repository.ts
│   │       ├── prisma-project.repository.ts
│   │       ├── prisma-event.repository.ts
│   │       └── prisma-track.repository.ts
└── index.ts                     # Composition root / Fastify bootstrap
```

---

## L. IMPLEMENTATION SEQUENCE

1. Initialize `infrastructure/database/prisma.client.ts`.
2. Implement exact Prisma mapping for `UserRepository` and `SessionRepository`.
3. Implement `PrismaTransactionManager`.
4. Implement `EventRepository` and `TrackRepository` (read-only dependencies).
5. Implement `TeamRepository` and `TeamMemberRepository` (handling the PK/ID mismatches).
6. Implement `ProjectRepository` (handling field mismatches and dropping `demoUrl`).
7. Update the composition root (`dependencies.ts` / `index.ts`) to inject the Prisma adapters.
8. Run Integration Tests against PostgreSQL.

---

## M. BLOCKERS

1. **HIGH RISK**: `TeamMemberRepository` expects single ID and `eventId`, but Prisma uses composite keys.
2. **HIGH RISK**: `ProjectRepository` expects `demoUrl`, which cannot be persisted.
3. **HIGH RISK**: Module 3 `Score` flat integer vs Prisma `Json` criteria requirement.
4. **MEDIUM RISK**: Module 1 is CommonJS, Module 2 expects NodeNext/ESM resolution.

---

## N. FINAL RECOMMENDATION

**PHASE 2B READINESS: READY**

Despite the high-risk mismatches in `TeamMember` and `Project` records, Module 2's persistence-independent repository interfaces allow us to absorb all structural differences inside the Prisma Adapter layer. We can cleanly synthesize composite keys, alias field names (`summary` -> `description`), and drop unsupported fields (`demoUrl`) entirely within `infrastructure/database/repositories` without violating Module 2's domain invariants or modifying Module 1's frozen schema.
