# Phase 2D-1: Rubric and Judge Assignment Design & Audit

## 1. Audit Findings
The current database (`Event`, `Track`, `Project`, `User`, and `Score`) successfully handles raw scores as JSON payloads, but lacks a strict configurable rubric and explicit sparse judge-project assignment mapping. A review of `references/fixtures.json` reveals that implicit assignments exist for every recorded score. The judging system must allow organizer-configured rubrics with explicit criteria and weights, while judge assignments must explicitly track progress independently of submitted scores.

## 2. Schema Changes
Added the following to `backend/prisma/schema.prisma`:
- **`Rubric`**: Represents an organizer-configured evaluation sheet for an Event.
- **`RubricCriterion`**: Represents individual metrics (e.g., UI/UX, Technical) within a Rubric.
- **`JudgeAssignment`**: Represents a scheduled evaluation between a specific Judge and a Project.

## 3. Rationale for Each Field
- `Rubric`: 
  - `eventId`: Links the rubric strictly to an event.
  - `name`: Identifier for the rubric.
- `RubricCriterion`:
  - `rubricId`: Associates criterion to the rubric.
  - `name`, `description`: Details on what is being evaluated.
  - `weight`: Explicit numeric weight for computing normalized scores.
  - `order`: Determines the UI layout order.
- `JudgeAssignment`:
  - `eventId`, `judgeId`, `projectId`: Links the core entities.
  - `trackId`: Optional denormalization to ease track-specific filtering.
  - `status`: String state (`PENDING`, `IN_PROGRESS`, `COMPLETED`) to track judging progress independent of the final score record.

## 4. Backward Compatibility Evaluation
- The existing `Score` table, `Project`, and `User` tables remain structurally backward compatible.
- The `seed.ts` script was carefully updated to seed assignments deterministically based on existing score records in `fixtures.json`. Existing 126 fixture scores remain valid, and no tests broke.

## 5. Domain Contracts Added
Defined in `@hackathon/contracts/judging.ts`:
- `RubricDto`, `RubricCriterionDto`, `JudgeAssignmentDto`
- `CreateRubricRequest`, `AssignJudgeRequest`, `UpdateAssignmentStatusRequest`

## 6. Repository Interfaces Defined
- `RubricRepository`
- `JudgeAssignmentRepository`

## 7. Prisma Adapters Created
- `PrismaRubricRepository`
- `PrismaJudgeAssignmentRepository`

## 8. Test Cases Added and Results
Created `backend/src/__tests__/judging.integration.ts` which tests:
- Successful retrieval of seeded `Rubric`.
- Successful update of `Rubric` and `RubricCriterion` cascade.
- Successful creation, retrieval, and status-update of a `JudgeAssignment`.
**Result:** ✅ `Tests finished running without error.`

## 9. Explanation of Why Assignments Can Be Sparse
The design enforces sparse assignments. Not every judge evaluates every project. The `JudgeAssignment` table models an explicit many-to-many edge. Judges will only see and evaluate projects they have an explicit `JudgeAssignment` edge for, allowing organizers to distribute load fairly across tracks.

## 10. Explanation of How Fixtures Determine Assignment State
During seeding, `seed.ts` parses the `scores` array from `fixtures.json`. Every project that a judge has scored implicitly receives a `JudgeAssignment` record with `status: 'COMPLETED'`. This deterministically maps existing judging actions into the new assignment state machine without modifying the static JSON fixture.

## 11. Relationship Between Score Submission and Judge Assignment
A `Score` is the final outcome of an evaluation. A `JudgeAssignment` is the authorization and workflow intent. A judge cannot submit a score unless a `JudgeAssignment` exists. When a score is successfully submitted, the corresponding `JudgeAssignment.status` transitions to `COMPLETED`.

## 12. Module 3 Features Leaked In
**Assert NO.** 
No public gallery UI, no CSV export, no pairwise judging mechanics, and no frontend routing were touched or modeled. The boundary remains strictly restricted to internal judging infrastructure (Phase 2D).

## 13. Exact Next Step
Proceed to **Phase 2D-2: Score Submission and Normalization**, focusing on business logic services, fastify routes, authorization enforcement for score submission, and computing weighted/calibrated scores.
