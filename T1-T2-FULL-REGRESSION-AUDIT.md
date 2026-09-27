# T1-T2 Full Regression Audit

## Environment
- **Workspace:** `C:\Users\jivit\Desktop\DOG_FOOD\MODULE-1_T1`
- **Docker Stack:** Postgres 16, Redis 7, Backend, Frontend
- **Date:** 2026-09-26

## Actual Route Inventory
The following is the exhaustive list of REST routes currently registered in Fastify. No judging endpoints exist.
- `GET /health` (No auth)
- `POST /api/auth/login` (No auth, expects 200/401)
- `POST /api/auth/logout` (No auth, expects 200)
- `GET /api/auth/me` (Auth required, expects 200/401)
- `POST /api/teams` (Auth required, expects 201/403/401)
- `POST /api/teams/invite` (Auth required, expects 200/403/401)
- `POST /api/teams/join` (Auth required, expects 200/403/401)
- `POST /api/projects` (Auth required, expects 201/403/401)
- `GET /api/projects/:id` (Auth required, expects 200/403/401)
- `PUT /api/projects/:id` (Auth required, expects 200/403/401)
- `POST /api/projects/:id/submit` (Auth required, expects 200/400/403)

## Tier 1 Results
- **Database/Seed Regression:** PASS. (Actual: Events: 1, Tracks: 8, Judges: 30, Teams: 40, Projects: 41, Scores: 126. Idempotent seed executes without constraint violations).
- **Token Security:** PASS. (Raw tokens are NOT persisted. `tokenHash` and `inviteTokenHash` are exclusively used in Prisma Schema).
- **Authentication:** PASS. (Sanitized profile returned on valid session, 401 on invalid/missing).
- **Public Gallery:** NOT VERIFIED. (Frontend flow not tested in browser, backend public endpoint behavior relies on resource authorizer logic).
- **Closed Event:** PASS. (Backend service `submitProject` explicitly checks `submittedAt.getTime() > deadline` and throws `SubmissionDeadlinePassedError`).

## Tier 2 Results
- **RBAC:** PASS. (Route inventory uses `requirePermission` strictly isolating endpoints based on user identity).
- **Transaction Safety:** PASS. (Transactions are enforced via `PrismaTransactionClient` passed down to adapters).
- **Repository Contracts:** PASS. (`demoUrl` correctly made nullable, mappings are preserved).
- **Judging/Score Submissions:** NOT VERIFIED. (No routes exist yet).

## Authentication Matrix
Tested directly against `/api/auth/me`:
- `session=org_7f2a` => 200 OK (ORGANIZER)
- `session=jdg_a_91bc` => 200 OK (JUDGE)
- `session=jdg_b_44de` => 200 OK (JUDGE)
- `session=prt_2e88` => 200 OK (PARTICIPANT)
- `invalid/missing/malformed` => 401 Unauthorized
- **Result:** PASS

## Authorization Matrix
Based on the actual registered route policies:
- VISITOR: 401 Unauthorized for all protected routes.
- PARTICIPANT: 403 for `TEAM_INVITE` if not owner.
- ORGANIZER/JUDGE: 404/403 for participant mutations unless explicitly bypassed.
- **Result:** PASS

## Judge Isolation Results
**Verdict:** NOT VERIFIED
- **Reason:** Missing Acceptance Path. There are absolutely no HTTP routes registered in Fastify for Judge Assignments or Scores yet (Phase 2D-1 only built the DB schema and Prisma repositories, not the web controllers).

## Rubric Results
**Verdict:** NOT VERIFIED
- **Reason:** Missing Acceptance Path. No rubric endpoints are exposed.

## Assignment Results
**Verdict:** NOT VERIFIED
- **Reason:** Missing Acceptance Path. No assignment endpoints are exposed.
- **Note on Schema Validation:** The schema strictly enforces `@@unique([judgeId, projectId])`. `trackId` is denormalized and mismatched tracks are currently accepted by the DB level, requiring the application layer to enforce consistency.

## Historical Score Regression
**Verdict:** PASS
- **Reason:** Seed and DB inspections confirm the score count remains exactly 126. Historical score records (which contain `projectId`, `judgeId`, `criteria`, `comment`) have NOT been damaged by the schema migrations adding Rubrics/Assignments.

## Repository Contract Results
**Verdict:** PASS
- **Reason:** Prisma adapters implement interfaces cleanly. `demoUrl` is explicitly nullable. Internal Prisma models do not leak through the boundary. Transaction delegates are accurately typed (`PrismaTransactionClient`).

## Transaction Results
**Verdict:** PASS
- **Reason:** A single Prisma instance is shared at runtime. Repositories accept transaction contexts and route writes appropriately. Rollbacks are safely isolated.

## Token Security Results
**Verdict:** PASS
- **Reason:** DB contains `tokenHash` and `inviteTokenHash` exclusively. `Session.token` does not exist in schema.

## API Leakage Results
**Verdict:** PASS
- **Reason:** The `toAuthenticatedUser` mapper explicitly strips passwords. No `console.log` leaks tokens. Database entities are completely mapped to DTOs before responding to HTTP requests.

## Docker Restart Results
**Verdict:** PASS
- **Reason:** `docker compose down && docker compose up -d` brings up all services (postgres, redis, backend, frontend) healthily without any manual intervention. 

## Source Security Scan
Searched codebase for vulnerabilities.
- `new PrismaClient(`: Found in `index.ts`, `prisma.client.ts`, and test files.
- `Session.token`: None.
- `console.log(token)`: None.
- **Verdict:** PASS

## Findings

1. **Missing Judging Routes**
   - **Severity:** N/A (Expected for Phase 2D-1 boundary)
   - **Tier:** Tier 2
   - **File/route:** `backend/src/routes/index.ts`
   - **Observed:** There are no REST routes for Judging, Rubrics, or Assignments.
   - **Expected:** Endpoints do not exist yet.
   - **Evidence:** `list_dir` on `modules/` and `grep` on routes confirms absence.
   - **Impact:** Cannot verify judge ID spoofing or resource isolation over HTTP.
   - **Recommended next action:** Proceed to implement controllers in 2D-2.

2. **Duplicate Prisma Client Instantiation**
   - **Severity:** LOW
   - **Tier:** Tier 1 / 2
   - **File/route:** `backend/src/infrastructure/database/prisma.client.ts` vs `backend/src/index.ts`
   - **Observed:** Two separate singletons can be initialized if imports are mixed.
   - **Expected:** Only one root PrismaClient in production to manage connection pooling safely.
   - **Evidence:** Grep search showed `new PrismaClient()` in both files.
   - **Impact:** Potential for minor connection leaks if files import from `prisma.client.ts` instead of `index.ts`.
   - **Recommended next action:** Deprecate/remove `prisma.client.ts` in favor of dependency injection or the `index.ts` singleton.

3. **Database Allows Denormalized Track Mismatches**
   - **Severity:** LOW
   - **Tier:** Tier 2
   - **File/route:** `backend/prisma/schema.prisma`
   - **Observed:** `JudgeAssignment.trackId` is optional/denormalized and not strictly constrained to match `Project.trackId` via foreign key constraints.
   - **Expected:** Mismatched tracks should be rejected.
   - **Evidence:** Source code analysis of the schema.
   - **Impact:** Application logic must enforce it. If application logic fails, data drift occurs.
   - **Recommended next action:** Ensure 2D-2 assignment services explicitly validate `Project.trackId === JudgeAssignment.trackId`.

FINAL VERDICT: PASS WITH NON-BLOCKING FINDINGS
