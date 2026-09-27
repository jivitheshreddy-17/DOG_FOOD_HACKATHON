# Phase 1: Integration Design Corrections & Validation

## 1. SESSION SCHEMA — VERIFIED

**Current Prisma Schema**:
```prisma
model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```
**Constraints & Relations**: `Session` uniquely identifies by `token` and relates `userId` to `User.id` (CUID) with `onDelete: Cascade`.
**Seed Behavior**: `seed.ts` creates static sessions via `upsert` matching exact strings like `"org_7f2a"`.
**.dogfood.toml Behavior**: Passes `Cookie: session=org_7f2a` unmodified to HTTP.
**Module 2 Expectations**: `SessionRepository` interface expects `findByTokenHash(tokenHash: string)` and `tokenHash` field in `CreateSessionDto`. `SessionService` performs `createHash('sha256').update(rawToken).digest('hex')` on all incoming cookies.
**Direct `Session.token` References**: A regex grep for `\.token\b` in `MODULE-1_T1` reveals no business logic references to `Session.token` other than `seed.ts` and `schema.prisma`. 

**Decision Validation**: 
Renaming `Session.token` → `Session.tokenHash` is **100% safe and complete**. We will perform the cryptographic hash directly in `seed.ts` during initialization.

## 2. TEAM INVITE TOKEN — USAGE VERIFICATION

**Module 1 Schema**: `Team.inviteToken String @unique @default(cuid())`
**Module 1 Seed**: Teams are seeded without explicit invite tokens.
**Module 2 Usage**: Extensive test coverage (`team.service.test.ts`, `team-api.test.ts`, `team-concurrency.test.ts`) verifies the cryptographic hashing of `inviteToken` → `inviteTokenHash` to prevent database token leaks. `TeamRepository` expects `findByInviteTokenHash(tokenHash: string)`.

**Necessity for T1**: 
Team joining flows (`/api/teams/join`) are **NOT** required for the current T1 integration (as per `.dogfood.toml` routes). However, if we preserve the Module 2 `TeamService` entirely, we must either adapt its interface or update the schema.
**Conclusion**: Changing `inviteToken` → `inviteTokenHash` in Prisma is **strongly recommended** as it seamlessly allows the inclusion of Module 2's secure team logic without creating fractured/skipped code paths.

## 3. GALLERY ARCHITECTURE — RE-EVALUATION

**Design A**: Browser → Next.js SSR → Prisma
**Design B**: Browser → Next.js SSR → Fastify `GET /api/projects` → Prisma

**Evaluation**:
- **Module 1 Architecture / Docker Deployment**: `docker-compose.yml` **explicitly withholds** the `DATABASE_URL` from the `frontend` container, supplying only `BACKEND_URL: http://backend:3001`. Therefore, Design A is physically impossible in the current offline Docker environment without breaking the isolation boundaries.
- **Backend Ownership**: Fastify is the sole arbiter of RBAC and business logic.
- **T2 Extensibility**: In T2, project visibility might depend on user roles (e.g., hidden tracks). If Next.js bypassed Fastify, we would duplicate RBAC logic in the frontend.

**Recommendation**: 
**Design B is the only correct architecture.** Module 2 must be extended with a `GET /api/projects` (or `/api/projects/public`) Fastify route. Next.js SSR will fetch data from `http://backend:3001/api/projects`.

## 4. SCORE DATA MODEL — VALIDATION

**Exact Prisma Models**:
```
User.id (CUID)
 ↓ (1:N)
Score.judgeId (CUID)
```
- **Fields**: `id`, `judgeId`, `projectId`, `criteria` (Json), `comment` (String), `createdAt`, `updatedAt`.
- **Fixture Judge IDs**: Are NOT foreign keys. They reside entirely in `User.fixtureId` (e.g., `"jdg_08"`).
- **Module 3 Mock Contract**: `Score` interface expects `{ score: number }`.

**Verification**:
The Prisma query `where: { judgeId: request.auth.id }` is **perfectly valid** because Fastify's `request.auth.id` maps to the real database CUID, exactly matching `Score.judgeId`.

**Data Mapping Reality Check**:
Module 3's Next.js API expects a single `score` integer. The Prisma schema stores `criteria` as a JSON object (e.g., `{"functionality":4}`). 
For the T1 rewrite, the Fastify endpoint must sum the values inside `Score.criteria` to produce the scalar `score` integer expected by the mock UI, or the frontend contract must be refactored to accept the JSON criteria.

## 5. JUDGE SCORE API CONTRACT

**Route**: `GET /api/judge/scores`
- **Request**: Query parameter `?judge=jdg_08`.
- **Authentication**: `Authorization: Bearer <token>` or `Cookie: session=<token>`.
- **Authorization**: Must possess the `JUDGE` role via `request.auth.role`.
- **Database Filtering**: Must filter strictly by `Score.judgeId === request.auth.id`.
- **Response**: `{ data: [{ id: "...", project_id: "...", score: 8 }] }`. Note the `project_id` casing in the response envelope, which differs from standard camelCase. `judgeId` is deliberately omitted to prevent data leakage.
- **Security Rule**: The `?judge=` query parameter **MUST NOT** be used to query the database. It is unauthenticated client input. The authoritative identity is `request.auth.id`.

## 6. CSV ARCHITECTURE — DESIGN FOR T2

**Current T1 Export**: A single Next.js route `/api/export.csv` exporting a hardcoded project list.
**Future T2 Extension**: T2 will demand raw scores, assignments, and normalized results. Creating hardcoded routes for each is anti-pattern.
**Extensible Backend Architecture**:
- Create an `ExportService` in Module 2 with an `exportProjects()` method (and future `exportScores()`).
- Fastify route `GET /api/export.csv` should accept an optional query param `?type=projects` (defaulting to projects for T1).
- **CSV Escaping**: Must implement RFC 4180 rules. If a field contains commas, quotes, or newlines, the entire field is enclosed in double quotes `""`, and internal quotes are doubled `""""`.
- **Ordering**: Fields must be deterministically ordered via array mapping: `id,title,team,track,submitted_at`.
- **Headers**:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="projects.csv"`
- **Authorization**: Strictly `requireAnyPermission('EVENT_MANAGE', 'USER_MANAGE')` (equivalent to ORGANIZER and ADMIN).

## 7. PHASE 2 MUST BE SPLIT

### PHASE 2A: Schema + Seed Only
- **Touched**: `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/package.json`
- **Objective**: Implement `tokenHash` and `inviteTokenHash`. Update seed to perform `crypto.createHash`.
- **Acceptance**: `npx prisma db push` and `npx prisma db seed` succeed perfectly.

### PHASE 2B: Prisma Repository Adapters
- **Touched**: `backend/src/core/repositories/prisma/*`
- **Objective**: Satisfy all Module 2 repository interfaces + `PrismaTransactionManager`.
- **Acceptance**: `npm run typecheck` passes in backend.

### PHASE 2C: Fastify Application Integration
- **Touched**: `backend/src/index.ts`, `backend/src/modules/*`
- **Objective**: Inject Prisma adapters into the Module 2 `createApp` factory. Setup RBAC and `authenticateRequest`.
- **Acceptance**: Server boots successfully; `curl /health` works.

### PHASE 2D: Judge Scores API
- **Touched**: `backend/src/modules/judging/routes.ts`
- **Objective**: Implement `GET /api/judge/scores`.
- **Acceptance**: Returns 403 for Participant, 200 for Judge (filtering by `request.auth.id`).

### PHASE 2E: CSV Export API
- **Touched**: `backend/src/modules/export/routes.ts`
- **Objective**: Implement `GET /api/export.csv` with RFC 4180 escaping.
- **Acceptance**: Returns 200 CSV for Organizer; 403 for Judge.

### PHASE 2F: Gallery Integration
- **Touched**: `frontend/app/projects/page.tsx`, `backend/src/modules/projects/routes.ts`
- **Objective**: Add `GET /api/projects/public` to Fastify. Point the Next.js SSR page to `http://backend:3001/api/projects/public`.
- **Acceptance**: UI renders fixture projects perfectly.

### PHASE 2G: Full Regression Verification
- **Touched**: None.
- **Objective**: Run the official test harness.
- **Acceptance**: `python3 run.py .dogfood.toml` passes completely.

## 8. T1 REGRESSION CONTRACT
The split phases guarantee that:
- `.dogfood.toml` remains exactly as-is.
- Docker Compose networking boundaries remain enforced (Next.js is blind to Postgres).
- `/api/*` proxies faithfully to Fastify.
- The closed-event submission protection remains managed entirely by the Fastify domain logic.

## 9. T2 COMPATIBILITY
No decisions made here compromise T2. 
- Fastify Route ownership establishes the exact foundation needed for T2 Weighted Rubrics (JSON `criteria` parsing). 
- Using `request.auth.id` establishes true Judge Isolation which cannot be spoofed by `?judge=` query parameters.
- The extensible `ExportService` architecture provides an easy injection point for future CSV types.

---

STATUS:
APPROVED FOR PHASE 2A

### Phase 2A Implementation Prompt
```
Execute PHASE 2A (Schema + Seed Only).

1. Modify MODULE-1_T1/backend/prisma/schema.prisma:
   - Rename Session.token to Session.tokenHash
   - Rename Team.inviteToken to Team.inviteTokenHash
2. Modify MODULE-1_T1/backend/prisma/seed.ts:
   - Import `crypto` from `node:crypto`.
   - Update `upsertSession` to hash the token using `crypto.createHash('sha256').update(token).digest('hex')`.
   - Ensure the query matches the new `tokenHash` field.
3. Validate:
   - Run `npx prisma db push --accept-data-loss` (or equivalent) in backend.
   - Run `npx tsx prisma/seed.ts` in backend.
4. Do NOT proceed to Phase 2B. Return confirmation of successful schema and seed.
```
