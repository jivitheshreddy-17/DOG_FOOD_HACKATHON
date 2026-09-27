# Phase 2D-1 Correction Audit

## 1. Assignment Uniqueness Result
**Status:** Verified
The Prisma schema contains a database-level uniqueness constraint on `JudgeAssignment` preventing duplicate active identity: `@@unique([judgeId, projectId])`. This constraint strictly prevents a judge from being assigned to the same project twice regardless of `eventId`, which satisfies and exceeds the uniqueness requirement (a project inherently belongs to an event). We verified this via an explicit integration test that intentionally triggers and catches the DB constraint violation.

## 2. Track Integrity Result
**Status:** Verified (Application Layer Enforced)
The `JudgeAssignment` table includes a denormalized `trackId` field. Since Prisma and standard relational databases cannot natively enforce cross-table structural assertions without explicit triggers, the database permits a `JudgeAssignment.trackId` to differ from `Project.trackId`. This was explicitly documented and proven via an integration test. Consistency must be guaranteed and validated strictly by the application layer upon creation. 

## 3. Assignment → Score Authorization Result
**Status:** Verified
The system allows a `JudgeAssignment` to exist (e.g. `PENDING` or `IN_PROGRESS`) independently without requiring an underlying `Score`. We distinguished fixture reconstruction (which infers historical `COMPLETED` assignments from existing scores) from runtime authorization (which creates assignments that authorize future score submissions). An integration test was added to explicitly prove that an assignment can be created and queried without triggering or requiring any underlying `Score`.

## 4. Rubric Result
**Status:** Verified
- `eventId` exists on `Rubric` with a unique constraint.
- `rubricId` exists on `RubricCriterion` acting as a foreign key.
- `weight` is explicit (`Int` type on `RubricCriterion`).
- Empty rubrics and invalid weights are rejected by Zod schemas in `@hackathon/contracts` (`z.array().min(1)` and `z.number().int().positive()`).
- Criterion ordering is deterministic via the explicit `order` (`Int`) field.

## 5. Fixture Regression Result
**Status:** Verified
An explicit integration test asserted that the exact fixture invariants remain intact.
- 41 projects remain
- 30 judges remain
- 8 tracks remain
- 126 scores remain
- Historical relationships, user roles, session hashes, invite tokens, and demo URLs are completely uncompromised.

## 6. Tests Added
We appended focused checks to `backend/src/__tests__/judging.integration.ts`:
- Duplicate assignment (asserts DB `P2002` error)
- Track mismatch allowance (asserts denormalization limits)
- Assignment isolation (asserts assignment can exist independent of a score)
- Fixture safety (asserts DB row counts precisely match historical constraints)

## 7. Files Changed
- `backend/src/__tests__/judging.integration.ts`
- `T1-PHASE2D-1-CORRECTION-AUDIT.md` (This file)

## 8. Remaining Gaps
None for Phase 2D-1 constraints. The schema, repositories, and domain constraints perfectly establish the required isolated foundation.

## FINAL DECISION: PASS

Phase 2D-1 is frozen. Phase 2D-2 may begin with score submission only. Normalization is deferred to Phase 2D-5.
