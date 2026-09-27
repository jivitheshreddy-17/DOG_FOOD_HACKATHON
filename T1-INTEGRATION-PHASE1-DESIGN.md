# Phase 1: Integration Design + Schema/Contract Reconciliation

## 1. Current Architecture Summary
- **Module 1 (Base)**: Provides the Docker environment (PostgreSQL 16, Redis 7, Fastify, Next.js), `.dogfood.toml` specs, exact routing via `next.config.js` rewrites (`/api/*` → Fastify), and the authoritative Prisma schema/seed script which populates the DB with deterministic data and static plaintext session tokens.
- **Module 2 (Backend)**: Provides the core Fastify backend logic, decoupled repository interfaces, in-memory transaction managers, `SessionService` (requiring SHA-256 hashed token storage), and centralized RBAC/resource authorization.
- **Module 3 (Frontend/APIs)**: Provides the Next.js SSR gallery and mock Next.js API routes (`/api/judge/scores`, `/api/export.csv`) backed by local mock providers and mock string-based user IDs (e.g., `jdg_08`).

## 2. Module 1 → Module 2 Compatibility Mapping
- **Database & Repositories**: Module 2 defines abstract interfaces (`UserRepository`, `SessionRepository`, `TeamRepository`, `ProjectRepository`, `TransactionManager`). These must be implemented in Module 1's backend using Prisma.
- **Session Persistence**: Module 1 currently uses `Session.token` (plaintext). Module 2 requires `Session.tokenHash`.
- **Team Persistence**: Module 1 uses `Team.inviteToken` (plaintext). Module 2 requires `Team.inviteTokenHash`.
- **Validation**: Both environments rely on Zod, but Module 2 extracts contracts to a shared `@hackathon/contracts` workspace. We must pull this workspace into Module 1.

## 3. Module 1 → Module 3 Compatibility Mapping
- **API Routing Conflict**: Module 1's `next.config.js` blindly proxies all `/api/*` requests to the Fastify backend. Therefore, Module 3's Next.js API routes in `app/api/` will never be accessible. They **must** be relocated to the Fastify backend as standard Fastify routes.
- **Mock Providers**: Module 3 uses `MockProjectRepository` for the SSR gallery. Since `app/projects/page.tsx` is a Next.js Server Component running in the same Docker network (or same monorepo), it can either query Prisma directly or call the internal Fastify API.
- **Judge IDs**: Module 3 uses fixture string IDs (e.g., `jdg_08`) as authenticated user IDs. Module 1 uses dynamically generated CUIDs for Users, retaining the fixture ID only in the `User.fixtureId` column.

## 4. Session/Authentication Reconciliation Design

**Decision: Option A — Replace plaintext persistence with `tokenHash`.**

*Reasoning*: Module 2 implements a robust `SessionService` that expects to look up sessions strictly by `tokenHash` (SHA-256) to prevent database dump exploits. To retain compatibility with the deterministic `.dogfood.toml` plaintext tokens (e.g., `org_7f2a`) without compromising security, we can update the `seed.ts` script to compute the SHA-256 hash of these static tokens *before* upserting them into the database. 
At runtime, `run.py` sends `Cookie: session=org_7f2a`. The HTTP authentication hook extracts the plaintext token and delegates it to `SessionService`, which computes the hash dynamically and performs a successful lookup in the `SessionRepository`.

## 5. Prisma Schema Reconciliation Design

1. **Model: Session**
   - **Current Field**: `token String @unique`
   - **Proposed Field**: `tokenHash String @unique`
   - **Reason**: Aligns with Module 2's secure session architecture.
   - **Migration Concern**: Requires a migration.
   - **Seed Impact**: `seed.ts` must use `crypto.createHash('sha256').update(token).digest('hex')` before upsert.
   - **Runtime Impact**: `SessionRepository` implementation natively queries by `tokenHash`.
   - **Rollback Concern**: Safe, local dev environment.

2. **Model: Team**
   - **Current Field**: `inviteToken String @unique`
   - **Proposed Field**: `inviteTokenHash String @unique`
   - **Reason**: Aligns with Module 2's secure team invites.
   - **Migration Concern**: Requires a migration.
   - **Seed Impact**: None (teams are seeded without invite tokens initially).
   - **Runtime Impact**: Native `TeamRepository.findByInviteTokenHash` compatibility.
   - **Rollback Concern**: Safe.

## 6. Fixture ID ↔ Database ID Mapping Design

* **Fixture ID**: e.g., `jdg_08`
* **Must resolve to Database User.id**: e.g., `clq123...`
* **Mechanism**: `seed.ts` correctly creates the User with `fixtureId: 'jdg_08'` and maps the static session (`jdg_a_91bc`) to this User's generated CUID.
* **Authorization Context**: During an HTTP request, `SessionService` retrieves the CUID and populates `request.auth.id`.
* **API Behavior (`/api/judge/scores`)**:
  - The authenticated judge identity comes **exclusively** from `request.auth.id`.
  - The `?judge=jdg_08` query parameter must be strictly ignored for data-fetching, or used only to assert that the `User.fixtureId` matching `request.auth.id` equals `jdg_08`.
  - Under no circumstances will a user be allowed to fetch scores by blindly trusting the `?judge=` query parameter. This enforces flawless score isolation.

## 7. Repository Adapter Mapping

We will implement the following Prisma-backed classes in `backend/src/core/repositories/prisma`:
- `PrismaUserRepository` (reads `User`)
- `PrismaSessionRepository` (reads/writes `Session` via `tokenHash`)
- `PrismaTeamRepository` (reads/writes `Team` and `inviteTokenHash`)
- `PrismaTeamMemberRepository` (manages `TeamMember` mapping)
- `PrismaProjectRepository` (manages `Project` and atomic status transitions)
- `PrismaTrackRepository` and `PrismaEventRepository` (reads tracks/events)

## 8. Transaction Manager Mapping

Module 2 provides an `InMemoryTransactionManager`. We will replace it with `PrismaTransactionManager`, leveraging Prisma's Interactive Transactions (`prisma.$transaction(async (tx) => { ... })`). This adapter will instantiate transaction-scoped repositories (e.g., `new PrismaTeamRepository(tx)`) and supply them to the business logic callback, preserving Module 2's atomic execution requirement without leaking Prisma internals into the domain.

## 9. API Contract Mapping

| Method | Path | Current Owner | Final Owner | Auth Req | Authz Req | Request Shape | Response Shape | Error Behavior |
|---|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | Module 2 | Module 2 | Public | None | `LoginRequest` | `{ user: { id, role } }` | 401 |
| POST | `/api/teams` | Module 2 | Module 2 | Required | `TEAM_CREATE` | `CreateTeamRequest` | `{ team: TeamDto }` | 401, 403, 409 |
| POST | `/api/projects/:id/submit`| Module 2 | Module 2 | Required | `PROJECT_SUBMIT` | Params: `id` | `{ project: ProjectDto }`| 401, 403, 400 |
| GET | `/api/judge/scores` | Module 3 (Next.js) | Module 2 (Fastify) | Required | `JUDGE` role | Query: `?judge` | `{ data: Score[] }` | 401, 403 |
| GET | `/api/export.csv` | Module 3 (Next.js) | Module 2 (Fastify) | Required | `ORGANIZER`, `ADMIN` | None | Raw CSV bytes | 401, 403 |

## 10. Gallery Integration Design

The SSR page in `Module 3` (`apps/web/src/app/projects/page.tsx`) requires fetching public projects. Since it is a Next.js Server Component running within the monorepo, it is most efficient and robust to bypass HTTP overhead and import a dedicated Prisma query directly into the Server Component (e.g., `getPublicProjects()` using `prisma.project.findMany`). This cleanly replaces the `MockProjectRepository` while keeping Next.js responsibilities confined to read-only presentation data.

## 11. Judge Scores API Integration Design

The `/api/judge/scores` endpoint will be entirely rewritten as a Fastify route in the backend. 
- **Pre-handlers**: `requireAuth()`, `requireRole('JUDGE')`.
- **Logic**: Use Prisma to query `prisma.score.findMany({ where: { judgeId: request.auth.id } })`. Strip out `judgeId` before responding. This guarantees zero chance of cross-judge data leakage.

## 12. CSV Export Integration Design

The `/api/export.csv` endpoint will be rewritten as a Fastify route.
- **Pre-handlers**: `requireAuth()`, `requireAnyRole('ORGANIZER', 'ADMIN')`.
- **Logic**: Query Prisma for all submitted projects (`status: 'submitted'`), map them to CSV rows (escaping appropriately), and return them with `reply.header('Content-Type', 'text/csv')` and `Content-Disposition`.

## 13. RBAC / Resource Authorization Mapping

Module 2's RBAC mechanism (`requirePermission`, `hasPermission`) operates on string enums. Module 1 uses a native Prisma enum `Role`. The adapter will map the Prisma `User.role` directly to the `AuthenticatedRole` union type used by Module 2's authorization guard context, enabling seamless execution of all Module 2 domain guards.

## 14. Files to KEEP
- `MODULE-1_T1/backend/prisma/schema.prisma` (will be modified)
- `MODULE-1_T1/backend/prisma/seed.ts` (will be modified)
- `MODULE-1_T1/.dogfood.toml` (untouched source of truth)
- `MODULE-1_T1/docker-compose.yml`
- `MODULE-1_T1/frontend/next.config.js`
- `T1_MODULE2_REVIEW/packages/contracts/`

## 15. Files to ADAPT
- `T1_MODULE2_REVIEW/apps/api/src/core/` (requires Prisma implementations)
- `T1_MODULE2_REVIEW/apps/api/src/modules/` (wire into Fastify)
- `T1_MODULE3_REVIEW/apps/web/src/app/projects/page.tsx` (wire to Prisma read queries)

## 16. Files to REPLACE
- `T1_MODULE3_REVIEW/apps/web/src/app/api/judge/scores/route.ts` (Move to Fastify)
- `T1_MODULE3_REVIEW/apps/web/src/app/api/export.csv/route.ts` (Move to Fastify)

## 17. Files that MUST NOT be copied
- `T1_MODULE3_REVIEW/apps/web/src/api-providers.ts`
- `T1_MODULE2_REVIEW/apps/api/tests/doubles/` (In-memory mocks are not needed for integration)

## 18. Migration / Data-Loss Risks
- **Risk**: Modifying `Session.token` to `tokenHash` drops existing sessions. 
- **Mitigation**: Since this is a test/hackathon environment seeded via script, data loss is fully acceptable. Simply run `npx prisma db push` or `prisma migrate dev` and re-seed.

## 19. T1 Regression Risks
- **Risk**: Altering the Next.js rewriting behavior could break frontend to backend communication.
- **Mitigation**: Do not alter `next.config.js`. Move the APIs to the backend instead.

## 20. T2 Regression Risks
- **Risk**: Failing to map the authenticated CUID back to the expected `fixtures.json` behavior in `/api/judge/scores`.
- **Mitigation**: Strictly relying on the authenticated identity generated during seed guarantees correlation to the fixture judge.

## 21. Exact Implementation Order for Phase 2

1. **Workspace Migration**: Copy `@hackathon/contracts` from Module 2 to `MODULE-1_T1/packages/contracts`. Update root `package.json` to handle workspaces.
2. **Schema & Seed Update**: Update `schema.prisma` (`tokenHash`, `inviteTokenHash`) and modify `seed.ts` to hash static tokens. Run `npx prisma db push` and `npx prisma db seed`.
3. **Backend Foundation**: Port `T1_MODULE2_REVIEW/apps/api/src` to `MODULE-1_T1/backend/src`. Install required dependencies (`zod`, `crypto`, etc.).
4. **Prisma Adapters**: Write `PrismaUserRepository`, `PrismaSessionRepository`, etc., implementing Module 2 interfaces.
5. **App Initialization**: Wire the Fastify app in `MODULE-1_T1/backend/src/index.ts` using the new Prisma adapters.
6. **New Routes (Module 3 Port)**: Write the `/api/judge/scores` and `/api/export.csv` Fastify routes.
7. **Frontend Porting**: Copy `app/projects/page.tsx` into the Next.js frontend, rewriting its data fetching to use `PrismaClient`.

## 22. Verification Checkpoints

- **Checkpoint 1 (After Seed)**: `npx prisma db seed` runs successfully without errors.
- **Checkpoint 2 (After Backend Compile)**: `npm run typecheck` succeeds in `backend/`.
- **Checkpoint 3 (After Route Porting)**: `curl http://localhost:3001/api/export.csv` returns 401 Unauthorized (confirming auth guards are wired).
- **Checkpoint 4 (End-to-End)**: Run `python3 run.py .dogfood.toml`. It must pass all configured checks.

---

**PHASE 1 STATUS:**
READY FOR PHASE 2
