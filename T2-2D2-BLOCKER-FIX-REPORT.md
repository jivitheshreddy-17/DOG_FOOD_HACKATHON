# Tier 2 — 2D-2 Blocker Fix Report

## Overview
This report details the resolution of the three blockers identified during the Tier 2 — 2D-2 verification phase. All verification tests now pass successfully (59/59).

## Blockers Resolved

### Blocker 1: ScoreCriterion Unique Constraint
- **Issue**: `verify-2d2.ts` was reporting that the unique constraint on `scoreId` and `criterionId` in the `score_criteria` table was missing.
- **Root Cause**: The constraint `@@unique([scoreId, criterionId])` was already present in `schema.prisma` and successfully pushed to the Postgres database. The verification script failed because it used a case-sensitive `LIKE '%unique%'` check against `pg_indexes.indexdef`, while PostgreSQL generates the `CREATE UNIQUE INDEX` statement in uppercase (`UNIQUE`).
- **Fix**: Updated `verify-2d2.ts` to use case-insensitive matching (`ILIKE '%unique%'`).

### Blocker 2: Seed Idempotency/Fixture Path
- **Issue**: `seed.ts` failed to run idempotently because it could not locate `fixtures.json` when executed from the host environment (e.g. via `npx ts-node src/__tests__/verify-2d2.ts`).
- **Root Cause**: The `loadFixtures` function in `seed.ts` lacked the necessary candidate path for resolving `fixtures.json` relative to the workspace root when run locally on the host. The Docker Compose configuration correctly mounts the shared `references/fixtures.json`, but host execution requires a relative path out of the `backend/` directory.
- **Fix**: Added `path.join(__dirname, "..", "..", "..", "references", "fixtures.json")` to the list of `candidates` in `loadFixtures` to robustly resolve the path.

### Blocker 3: Rubric Freeze Not Enforced
- **Issue**: The rubric freeze rule (a rubric becomes immutable if an assignment is IN_PROGRESS/COMPLETED or a score exists) was not enforced at the application layer.
- **Root Cause**: The DB layer allows mutation of the `rubric_criteria` and `rubrics` tables without constraint regarding assignments or scores. The application layer (`PrismaRubricRepository`) lacked validation logic before performing modifications.
- **Fix**: Modified `PrismaRubricRepository.save()` to count active `judgeAssignment` rows and `score` rows for the target `rubricId` in the exact same transaction block. If the count is > 0, the application appropriately throws a `ConflictError`/domain exception to reject the mutation. The `verify-2d2.ts` test was also correctly updated to test this via the Application/Service layer repository rather than direct raw `prisma` execution.

## Verification Results
- `npx tsc --noEmit` completes successfully with no TypeScript errors.
- `npx prisma validate` and `npx prisma generate` execute successfully.
- `seed.ts` runs successfully and idempotently.
- Full `verify-2d2.ts` suite passes 59/59 tests.

## Final Status
**PASS — TIER 2 2D-2 BLOCKERS FIXED**
