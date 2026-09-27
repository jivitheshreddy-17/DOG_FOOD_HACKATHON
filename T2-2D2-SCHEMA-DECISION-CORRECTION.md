# T2-2D2 SCHEMA DECISION CORRECTION PASS
**Document:** `T2-2D2-SCHEMA-DECISION-CORRECTION.md`  
**Phase:** Tier 2 — Judging (Sub-phase 2D-2 Score Submission Architecture)  
**Status:** COMPLETE & PENDING FINAL REVIEW  
**Target Normalization Engine:** Many-Facet Rasch / Ordinal Cumulative-Link Calibration Model ($Y_{jpc} \in \{1,2,3,4,5\}$)

---

## 1. Corrections Accepted

Based on the review of `T2-2D2-SCHEMA-DECISION.md`, the following eight authoritative corrections have been accepted in full:

1. **Delete Behavior:** Removed `onDelete: Cascade` from `Score.assignment`. Finalized raw observations must never be cascade-deleted.
2. **Concurrency Architecture:** Replaced imprecise conditional updates with formal **Optimistic Concurrency Control (OCC)** using `JudgeAssignment.version` to prevent race conditions between concurrent drafts and final submissions.
3. **Value Integrity:** Selected **Option B (Application validation PLUS PostgreSQL CHECK constraint)** to ensure integer values $\in \{1, 2, 3, 4, 5\}$ are enforced at both application and database layers.
4. **Historical Timestamp Strategy:** Confirmed that `fixtures.json` contains no historical judging timestamps. Rejected using `Event.submissionsClose`. Established a deterministic synthetic fixture-import metadata timestamp (`1970-01-01T00:00:00.000Z`) explicitly labeled as fixture metadata.
5. **Denormalization Invariants:** Documented the exact structural and application invariants governing denormalized fields on `Score` (`assignmentId`, `judgeId`, `projectId`, `rubricId`).
6. **Workflow State Mapping:** Formulated an exhaustive state-transition matrix mapping API commands (`DRAFT`, `SUBMITTED`) to `JudgeAssignment.status` (`PENDING`, `IN_PROGRESS`, `COMPLETED`), with no independent `Score.status` enum.
7. **Rubric Freeze Invariant:** Specified an absolute lock on the rubric definition once any assignment enters `IN_PROGRESS` or `COMPLETED`, identifying all six forbidden operations and their enforcement points.
8. **Normalization Input Contract:** Verified that the data model deterministically reconstructs all eight essential variables for the Many-Facet Rasch model without ambiguity.

---

## 2. Final Delete / Immutability Policy

### DECISION: `onDelete: Restrict` on `Score.assignment` and Domain-Level Lock on Finalized Data
- In `backend/prisma/schema.prisma`:
  - `Score.assignment`: `onDelete: Restrict`.
  - `Score.rubric`: `onDelete: Restrict`.
  - `ScoreCriterion.score`: `onDelete: Cascade` (cascade is strictly scoped to deleting provisional drafts).
  - `ScoreCriterion.criterion`: `onDelete: Restrict`.
- Service-Level Invariants:
  - If `JudgeAssignment.status === 'COMPLETED'`:
    - Neither the `JudgeAssignment`, the `Score`, nor any `ScoreCriterion` can be deleted.
    - Any delete attempt throws `409 Conflict: Cannot delete a completed assignment or finalized score`.
  - If `JudgeAssignment.status === 'IN_PROGRESS'`:
    - Draft removal is permitted by explicitly deleting the provisional `Score` and child `ScoreCriterion` rows before updating or reassigning `JudgeAssignment` to `PENDING`.
  - If `JudgeAssignment.status === 'PENDING'`:
    - Assignment may be deleted or reassigned freely since no `Score` exists.

### WHY
- Cascade deletion on `Score.assignment` would mean deleting a `JudgeAssignment` automatically deletes all raw scoring observations.
- In Many-Facet Rasch measurement, raw completed observations $Y_{jpc}$ form the empirical ground truth for judge severity calibration ($\alpha_j$) and latent project quality ($\theta_{pc}$). They must remain reproducible forever. `onDelete: Restrict` prevents accidental cascading destruction at the database engine level.

### ALTERNATIVES
- **Alternative 1: `onDelete: Cascade` (Rejected):** Erases historical scores if an assignment row is dropped. Catastrophic for auditability and normalization reproducibility.
- **Alternative 2: Soft Deletes (`deletedAt DateTime?`) (Rejected):** Adds query filtering overhead to every relational query in the system without adding value over a hard immutability constraint.

### TIER 2 NORMALIZATION IMPACT
- Guarantees complete preservation of the observation matrix $\mathbf{Y}$. An audit or re-run of the normalization pipeline months later will yield mathematically identical calibration parameters.

---

## 3. Final Concurrency Policy

### DECISION: Optimistic Concurrency Control (OCC) Using `JudgeAssignment.version`
- In `backend/prisma/schema.prisma`:
  - Add `version Int @default(1)` to `model JudgeAssignment`.
- Transaction Execution Order:
  All score modifications and assignment status transitions must run inside an atomic transaction managed by `TransactionManager.run()` (Prisma `$transaction`):
  1. **Read & Authorize:** Fetch `JudgeAssignment` by `assignmentId`. Verify `assignment.judgeId === authenticatedUser.id`.
  2. **State Guard:** If `assignment.status === 'COMPLETED'`, immediately abort with `409 Conflict: Assignment is finalized and immutable`.
  3. **Capture Version:** Note `currentVersion = assignment.version`.
  4. **Upsert Score & Criteria:**
     - Upsert `Score` row.
     - Upsert child `ScoreCriterion` rows.
     - If API request is `SUBMITTED`, stamp `Score.submittedAt = clock.now()`.
  5. **Conditional Atomic State Transition:**
     Execute an atomic update on `JudgeAssignment` checking both `id`, `version`, and `status`:
     ```typescript
     const updateResult = await tx.judgeAssignment.updateMany({
       where: {
         id: assignmentId,
         version: currentVersion,
         status: { not: 'COMPLETED' },
       },
       data: {
         status: targetStatus, // 'IN_PROGRESS' for DRAFT, 'COMPLETED' for SUBMITTED
         version: { increment: 1 },
       },
     });

     if (updateResult.count === 0) {
       throw new ConflictError(
         'Concurrent modification detected or assignment was finalized by another request'
       );
     }
     ```

### Race Condition Analysis
Consider the concurrent race described in the review:
- **Request A** reads assignment `status: IN_PROGRESS`, `version: 3`.
- **Request B** reads assignment `status: IN_PROGRESS`, `version: 3`.
- Both modify draft criteria in transaction.
- **Request A** submits: Executes `updateMany({ where: { id, version: 3, status: { not: 'COMPLETED' } }, data: { status: 'COMPLETED', version: 4 } })`.
  - Matches 1 row. Request A commits successfully. The assignment row is now `status: 'COMPLETED'`, `version: 4`.
- **Request B** tries to finalize or update: Executes `updateMany({ where: { id, version: 3, status: { not: 'COMPLETED' } }, data: { ... } })`.
  - Matches 0 rows because `version` is now 4, and `status` is `'COMPLETED'`.
  - `updateResult.count === 0` triggers an immediate rollback and returns `409 Conflict`.
- Request B cannot overwrite finalized scores.

### WHY
- Works natively with Prisma 5.22 and PostgreSQL 16 `READ COMMITTED` isolation without requiring raw SQL `SELECT FOR UPDATE`.
- Integrates seamlessly with our `TransactionManager` and repository patterns.
- Protects against both draft-vs-draft overwrite races and draft-vs-submit finalization races.

### ALTERNATIVES
- **Alternative 1: Raw SQL `SELECT FOR UPDATE` (Rejected):** Requires bypassing the repository abstraction with `tx.$queryRaw`, increasing fragility.
- **Alternative 2: Serializable Isolation Level (Rejected):** Requires wrapping all operations in complex application-level retry loops with backoff.
- **Alternative 3: Status-only conditional update without version (Rejected):** Does not detect concurrent draft updates where two judges/sessions overwrite each other's draft comments/ratings.

### TIER 2 NORMALIZATION IMPACT
- Completely eliminates corrupt/overlapping observations in $Y_{jpc}$. Every completed score is guaranteed to represent a single, un-raced, atomic finalization.

---

## 4. Final Value-Integrity Policy

### DECISION: Application / Zod Validation PLUS PostgreSQL Engine CHECK Constraint (Option B)
- **Layer 1 (Contract / Transport Validation):**
  Zod schema enforces integer values strictly between 1 and 5:
  ```typescript
  export const scoreValueSchema = z.number().int().min(1).max(5);
  ```
- **Layer 2 (Domain Service Layer Validation):**
  Before database writes, domain validator asserts:
  ```typescript
  for (const item of scores) {
    if (!Number.isInteger(item.value) || item.value < 1 || item.value > 5) {
      throw new ValidationError(`Score value must be an integer between 1 and 5. Received: ${item.value}`);
    }
  }
  ```
- **Layer 3 (Database Engine CHECK Constraint):**
  Prisma schema defines `value Int`. The database migration DDL adds an explicit PostgreSQL table constraint:
  ```sql
  ALTER TABLE score_criteria 
    ADD CONSTRAINT check_score_criterion_value_range 
    CHECK (value >= 1 AND value <= 5);
  ```
  This constraint is embedded in the migration DDL (`prisma/migrations/.../migration.sql`) and verified during container database initialization.

### WHY
- The Many-Facet Rasch model specifies a 5-category ordinal response format:
  $$Y_{jpc} \in \{1, 2, 3, 4, 5\}$$
  If a value outside this range (e.g. 0, 6, or null) entered the database via seed scripts, administrative queries, or buggy code, the logistic threshold equations:
  $$\text{logit}[P(Y_{jpc} \le k)] = \tau_{ck} - \theta_{pc} + \alpha_j, \quad k \in \{1, 2, 3, 4\}$$
  would fail or yield undefined mathematical results. Enforcing this at the DB level guarantees mathematical invariant integrity.

### ALTERNATIVES
- **Alternative: Application-only validation (Rejected):** Does not protect against direct database edits, manual seeding scripts, or administrative utilities.

### TIER 2 NORMALIZATION IMPACT
- Guarantees $Y_{jpc} \in \{1, 2, 3, 4, 5\}$ unconditionally across all database consumers.

---

## 5. Final Historical Timestamp Policy

### DECISION: Deterministic Static Import Epoch (`1970-01-01T00:00:00.000Z`) for Seeded Fixtures
- **Fixture Inspection Finding:**
  Inspection of `/app/fixtures.json` confirms that fixture scores have **only four properties**:
  `"judge"`, `"project"`, `"criteria"`, `"comment"`.
  **No timestamp field exists in the fixture dataset.**
- **Policy:**
  - `Event.submissionsClose` (`2026-03-01T18:00:00Z`) must **NOT** be used as `submittedAt`.
  - For seeded fixture scores, `Score.submittedAt` is set to:
    ```typescript
    const FIXTURE_IMPORT_METADATA_TIMESTAMP = new Date("1970-01-01T00:00:00.000Z");
    ```
  - For live scores submitted via the API:
    `Score.submittedAt = clock.now()`.
  - The database comment / documentation will explicitly document that `submittedAt === '1970-01-01T00:00:00.000Z'` indicates baseline fixture data imported without original timestamp metadata.

### WHY
- Avoids fabricating synthetic dates that masquerade as real judging timestamps.
- The Unix epoch timestamp is universally recognized as sentinel metadata for legacy/fixture baseline data.
- Does not collide with or misrepresent participant submission deadlines.

### ALTERNATIVES
- **Alternative 1: Use `Event.submissionsClose` (Rejected):** Conflates project submission close with judge evaluation time.
- **Alternative 2: Use `now()` at time of seed execution (Rejected):** Breaks deterministic testing, because every seed run produces different timestamps.
- **Alternative 3: Leave `submittedAt: null` on fixtures (Rejected):** Violates the invariant that all completed assignments must have `submittedAt` set.

### TIER 2 NORMALIZATION IMPACT
- Normalization queries filtering `WHERE submittedAt IS NOT NULL` will correctly ingest both fixture baseline scores and live submitted scores without date-dependent anomalies.

---

## 6. Final Denormalization Policy

### DECISION: Retain Denormalized Fields on `Score` with Strict Service-Enforced Invariants
- `Score` model retains:
  - `assignmentId String @unique`
  - `judgeId String`
  - `projectId String`
  - `rubricId String`
- Invariants & Enforcement:
  1. **`assignmentId` Invariant:** `Score.assignmentId` is 1-to-1 with `JudgeAssignment.id`.
  2. **`judgeId` Invariant:** `Score.judgeId === assignment.judgeId`.
  3. **`projectId` Invariant:** `Score.projectId === assignment.projectId`.
  4. **`rubricId` Invariant:** `Score.rubricId === rubric.id`, where `rubric.eventId === assignment.eventId`.
  5. **Application Enforcement:**
     In `JudgingService.submitScore(user, assignmentId, payload)`:
     - The service loads the authoritative `JudgeAssignment` record inside the transaction.
     - The payload contains **only** `scores`, `comment`, and `status`.
     - `judgeId`, `projectId`, and `rubricId` are derived directly from the trusted `JudgeAssignment` and the active event `Rubric`.
     - The client payload is never permitted to supply `judgeId`, `projectId`, or `rubricId`.

### WHY
- High-efficiency read paths: Modules in Tier 1 and Tier 2 (such as peer scores, judge assignment lists, and project score summaries) can query `Score` directly by `judgeId` or `projectId` without joining `JudgeAssignment`.
- Integrity is 100% maintained because all score writes originate from trusted server-side derivation.

### ALTERNATIVES
- **Alternative: Pure Relational Normalization (Only `assignmentId` and `rubricId` on `Score`) (Rejected):** Requires two-table joins for every single score query, complicating repository signatures and regression compatibility with Tier 1.

### TIER 2 NORMALIZATION IMPACT
- Allows the normalization extraction query to retrieve `(judgeId, projectId, criterionId, value)` with maximum performance and zero risk of mismatched relational identifiers.

---

## 7. Final Workflow-State Mapping

There is **no independent `Score.status` enum**. The single authoritative workflow state machine is `JudgeAssignment.status`:

$$\text{PENDING} \longrightarrow \text{IN_PROGRESS} \longrightarrow \text{COMPLETED}$$

### Complete State Transition Matrix

| Current Assignment Status | API Command | Action Taken | Resulting Assignment Status | `Score.submittedAt` | Resulting Version | HTTP Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`PENDING`** | `DRAFT` | Validates criterion IDs against rubric. Allows partial criteria. Upserts `Score` and available `ScoreCriterion` rows. | `IN_PROGRESS` | `null` | `v + 1` | `200 OK` |
| **`PENDING`** | `SUBMITTED` | Validates ALL rubric criteria are present and $\in \{1..5\}$. Upserts `Score` and all `ScoreCriterion` rows. Stamps `submittedAt = clock.now()`. | `COMPLETED` | `clock.now()` | `v + 1` | `200 OK` |
| **`IN_PROGRESS`** | `DRAFT` | Validates criterion IDs against rubric. Overwrites draft `ScoreCriterion` rows with new draft values. Updates `Score.comment`. | `IN_PROGRESS` | `null` | `v + 1` | `200 OK` |
| **`IN_PROGRESS`** | `SUBMITTED` | Validates ALL rubric criteria are present and $\in \{1..5\}$. Upserts all `ScoreCriterion` rows. Stamps `submittedAt = clock.now()`. Locks observation. | `COMPLETED` | `clock.now()` | `v + 1` | `200 OK` |
| **`COMPLETED`** | `DRAFT` | **Rejected.** Completed scores are immutable. No DB write. | `COMPLETED` (unchanged) | Intact | Unchanged | `409 Conflict` |
| **`COMPLETED`** | `SUBMITTED` | **Rejected.** Completed scores cannot be re-submitted. No DB write. | `COMPLETED` (unchanged) | Intact | Unchanged | `409 Conflict` |

### WHY
- Eliminates any possibility of desynchronization between assignment queues and score records.
- Provides a clean, predictable API for frontend clients: `DRAFT` saves work in progress; `SUBMITTED` finalizes the score.

### ALTERNATIVES
- **Alternative: Two independent status machines (Rejected):** Introduces invalid states like `JudgeAssignment.COMPLETED` + `Score.DRAFT`.

### TIER 2 NORMALIZATION IMPACT
- The normalization engine ingests exclusively finalized data by applying `WHERE ja.status = 'COMPLETED'` (or `WHERE s.submitted_at IS NOT NULL`).

---

## 8. Final Rubric-Freeze Invariant

### DECISION: Absolute Immutability Once Judging Begins
- **Invariant Rule:**
  For any given event, once **ANY** of the following conditions is met:
  1. Any `JudgeAssignment` for the event has `status === 'IN_PROGRESS'`
  2. Any `JudgeAssignment` for the event has `status === 'COMPLETED'`
  3. Any `Score` record exists for the event's rubric
  The Rubric and all its child `RubricCriterion` records are permanently **FROZEN**.

### Prohibited Operations Under Freeze
The following six operations are strictly rejected with `409 Conflict: Rubric is locked because judging has begun for this event`:
1. **Add criterion:** Cannot add new criteria to the rubric.
2. **Remove criterion:** Cannot delete existing criteria.
3. **Rename criterion:** Cannot modify the `name` of an existing criterion.
4. **Change weight:** Cannot modify the `weight` of any criterion.
5. **Change order:** Cannot modify the display `order` of any criterion.
6. **Change description:** Cannot alter the `description` text.

### Enforcement Point
Enforced in `RubricService.updateRubric(...)` and `PrismaRubricRepository.save(...)`:
```typescript
const activeScoresCount = await prisma.score.count({
  where: { rubricId: rubric.id },
});
const activeAssignmentsCount = await prisma.judgeAssignment.count({
  where: {
    eventId: rubric.eventId,
    status: { in: ['IN_PROGRESS', 'COMPLETED'] },
  },
});

if (activeScoresCount > 0 || activeAssignmentsCount > 0) {
  throw new ConflictError(
    'Rubric is frozen and cannot be modified because judging has begun for this event'
  );
}
```

### WHY
- If criteria or weights change after a judge has already scored projects, scores submitted under the old rubric cannot be meaningfully combined or calibrated with scores submitted under the new rubric.
- Many-Facet Rasch calibration relies on fixed, identifiable rating scales across all evaluated projects.

### ALTERNATIVES
- **Alternative: Soft rubric versioning (Rejected):** Unnecessary operational complexity; hackathons must not alter judging rubrics mid-competition.

### TIER 2 NORMALIZATION IMPACT
- Ensures calibration parameter stability: $\tau_{ck}$ (thresholds) and $w_c$ (weights) remain constant across all observations $Y_{jpc}$.

---

## 9. Final Normalization Input Contract

The final schema guarantees that the normalization engine can deterministically construct the exact observation tuple for every observation $Y_{jpc}$:

| Normalization Parameter | Source Schema Field | Description | Type / Constraints |
| :--- | :--- | :--- | :--- |
| **$j$ (Judge ID)** | `JudgeAssignment.judgeId` (or `Score.judgeId`) | Unique identifier of the judging agent | `String` (User CUID) |
| **$p$ (Project ID)** | `JudgeAssignment.projectId` (or `Score.projectId`) | Unique identifier of the evaluated project | `String` (Project ID) |
| **$c$ (Criterion ID)** | `ScoreCriterion.criterionId` | Unique canonical identifier of the rubric criterion | `String` (RubricCriterion CUID) |
| **$Y_{jpc}$ (Raw Rating)** | `ScoreCriterion.value` | Discrete ordinal observation | `Int` $\in \{1, 2, 3, 4, 5\}$ |
| **$w_c$ (Criterion Weight)** | `RubricCriterion.weight` | Weight used in Layer 4 aggregation | `Int` $\ge 1$ |
| **Rubric Context** | `Score.rubricId` | Identifies the governing rubric | `String` (Rubric CUID) |
| **Assignment Context** | `Score.assignmentId` | Direct link to the authorizing assignment | `String` (JudgeAssignment CUID) |
| **Submitted Timestamp** | `Score.submittedAt` | Proof of completion and immutability | `DateTime` (ISO-8601) |
| **Observation Identity** | `ScoreCriterion.id` | Discrete primary key of the individual observation row | `String` (ScoreCriterion CUID) |

### Normative Extraction Query
```typescript
const observations = await prisma.scoreCriterion.findMany({
  where: {
    score: {
      assignment: { status: 'COMPLETED' },
      submittedAt: { not: null },
    },
  },
  select: {
    id: true, // Observation Identity
    value: true, // Y_jpc in {1, 2, 3, 4, 5}
    score: {
      select: {
        judgeId: true, // j
        projectId: true, // p
        rubricId: true,
        assignmentId: true,
        submittedAt: true,
      },
    },
    criterionId: true, // c
    criterion: {
      select: {
        name: true,
        weight: true, // w_c for Layer 4 weighted aggregation
        order: true,
      },
    },
  },
});
```

---

## 10. Exact Implementation Changes Allowed in the Next Phase

When implementation is officially started, the modifications will be strictly confined to:

1. **`backend/prisma/schema.prisma`:**
   - Add `version Int @default(1)` to `model JudgeAssignment`.
   - Update `model Score` with `assignmentId String @unique`, `rubricId String`, `submittedAt DateTime?`, `onDelete: Restrict`.
   - Add `model ScoreCriterion` with `value Int`, `onDelete: Restrict` on criterion, and `@@unique([scoreId, criterionId])`.
   - Add relation inversions to `JudgeAssignment`, `Rubric`, and `RubricCriterion`.
2. **Database Migration / DDL:**
   - Apply PostgreSQL constraint `CHECK (value >= 1 AND value <= 5)` on `score_criteria`.
3. **`backend/prisma/seed.ts`:**
   - Map the 126 fixture scores to `Score` and 378 `ScoreCriterion` rows using `FIXTURE_IMPORT_METADATA_TIMESTAMP`.
4. **`backend/src/contracts/judging.ts`:**
   - Add Zod schemas: `submitScoreRequestSchema`, `scoreResponseSchema`.
5. **Repositories & Application Services:**
   - Update `TransactionManager` to include `judgeAssignmentRepository`, `rubricRepository`, `scoreRepository`.
   - Implement `PrismaScoreRepository`.
   - Implement `JudgingService.submitScore(...)` with the workflow transition matrix and OCC version check.
6. **Routes:**
   - Implement Fastify route: `POST /api/judge/assignments/:assignmentId/scores`.

---

## 11. Tests Required Before Implementation is Considered Complete

1. **Database Schema & Constraint Test:**
   - Verify PostgreSQL rejects `ScoreCriterion` row with `value = 0` or `value = 6` with a database check constraint violation.
2. **Seed & Fixture Integrity Test:**
   - Verify that running `seed.ts` results in exactly 41 projects, 30 judges, 126 assignments, 126 scores, and 378 score criteria, with all `submittedAt` set to `1970-01-01T00:00:00.000Z`.
3. **Draft Lifecycle Test:**
   - Submitting `DRAFT` creates/updates `Score`, leaves `submittedAt: null`, advances assignment from `PENDING` to `IN_PROGRESS`, and increments `version`.
4. **Final Submission Test:**
   - Submitting `SUBMITTED` with complete criteria sets `status: COMPLETED`, stamps `submittedAt = clock.now()`, and increments `version`.
5. **Partial Criteria Rejection on Final Submission:**
   - Submitting `SUBMITTED` with only 2 of 3 criteria returns `400 Bad Request`.
6. **Immutability Protection Test:**
   - Any `DRAFT` or `SUBMITTED` request against a `COMPLETED` assignment returns `409 Conflict`.
7. **OCC Concurrency Conflict Test:**
   - Simulate two simultaneous requests with identical version numbers; verify that one succeeds and the other receives `409 Conflict`.
8. **Rubric Freeze Test:**
   - Attempting to update a rubric when any assignment is `IN_PROGRESS` or `COMPLETED` returns `409 Conflict`.
9. **Cascading Delete Prevention Test:**
   - Attempting to delete a `JudgeAssignment` that has a completed `Score` is rejected with a foreign key restriction.

---

## 12. Remaining Blockers

There are currently **zero remaining technical blockers**.

All architectural decisions, delete invariants, concurrency mechanisms, timestamp conventions, and normalization contracts have been resolved and agreed upon.

### Status
- **Tier 1 Status:** PASS
- **Tier 2 Status:** PASS (Pre-Implementation Architecture Approved)
- **2D-2 Implementation Status:** AWAITING USER COMMAND TO BEGIN IMPLEMENTATION (Strict Stop Honored).
