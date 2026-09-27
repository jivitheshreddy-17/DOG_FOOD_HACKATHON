# T2-2D2 PRE-IMPLEMENTATION AUDIT

## 1. Prisma Singleton Cleanup Result
**STATUS: PASS**
- **Action**: Removed duplicate `new PrismaClient()` instantiations.
- **Details**: Updated `backend/src/infrastructure/database/prisma.client.ts` to export a single configured `PrismaClient` singleton with logging options. Refactored `backend/src/index.ts` to import this shared instance instead of instantiating its own. Verified backend starts and `/health` returns 200.

## 2. Tier 1 Gallery Verification Result
**STATUS: PASS WITH NON-BLOCKING FINDINGS**
- **Action**: Verified the public gallery endpoint.
- **Details**: The frontend `/projects` page was originally returning a hardcoded HTML stub. A minimal `GET /api/projects` route was added to the Fastify backend, backed by a new `findAll` method in the Prisma project repository. The frontend page was updated to perform an SSR `fetch` from the backend API.
- **Finding**: The Next.js frontend rebuild via Docker took care of replacing the mock page with real database data, satisfying Tier 1 requirements without redesigning the UI. 

## 3. Current Score Schema Analysis
**STATUS: BLOCKED (Requires Schema Updates)**
The existing `Score` schema is insufficient for the 2D-2 requirements and the upcoming normalization pipeline.
- **Judge & Project**: Represented (`judgeId`, `projectId`).
- **Criterion-level scores**: Represented as a `criteria` JSON field.
  - *Gap*: The JSON keys (e.g., "functionality") are strings, not `RubricCriterion.id` references. This breaks strict relational integrity for normalization.
- **Rubric/Version**: Missing. There is no `rubricId` in the `Score` model, meaning we cannot guarantee which rubric version was used if the rubric changes.
- **Submission/Update state**: Missing on `Score`. We currently have to rely on `JudgeAssignment.status`.
- **Timestamps**: Represented (`createdAt`, `updatedAt`).
- **Auditability**: Lacking. Overwriting the JSON field destroys the previous "draft" values. Raw observations must remain immutable. 
- **Recommendation**: Do not implement 2D-2 until the `Score` schema is updated. Propose adding `rubricId` to `Score`. Ensure JSON keys use `criterion.id`. 

## 4. Current Judging Architecture Analysis
**STATUS: PASS**
- **Transport/API**: Fastify routes with `requireAuth` and `validateRequest` schemas.
- **Application**: Modular services (`ProjectService`, upcoming `JudgingService`).
- **Domain**: Rules are centralized in services and authorizers.
- **Infrastructure**: Prisma-backed repositories implementing abstract interfaces. 
- **Cross-cutting**: Transactions are handled via `TransactionManager`.

## 5. Proposed 2D-2 API Contract
```http
POST /api/judge/assignments/:assignmentId/scores
Content-Type: application/json

{
  "scores": [
    { "criterionId": "cuid1", "value": 4 },
    { "criterionId": "cuid2", "value": 5 }
  ],
  "comment": "Optional judge comment",
  "status": "DRAFT" // or "SUBMITTED"
}
```

## 6. Proposed Request/Response Shapes
**Request (`SubmitScoreRequest`)**:
- `scores`: Array of `{ criterionId: string, value: number }`
- `comment`: string (optional)
- `status`: enum `DRAFT | SUBMITTED`

**Response (`ScoreResponse`)**:
- `id`: string
- `assignmentId`: string
- `projectId`: string
- `status`: string
- `criteria`: Record<string, number>
- `updatedAt`: string

## 7. Authorization Rules
- Must be an authenticated user.
- User must have the `JUDGE` role.
- The `judgeId` is implicitly derived from `request.auth.userId` (never trusted from payload).
- The requested `assignmentId` must belong to this exact judge.

## 8. Domain Validation Rules
- The assignment must exist.
- The project must exist and belong to the same event as the assignment.
- The assignment's `trackId` (if set) must match the project's `trackId`.
- The rubric must exist for the event.
- Every `criterionId` in the payload must exist in the active rubric.
- No duplicate `criterionId` in the payload.
- If `status === SUBMITTED`, ALL criteria in the rubric must be scored.
- Every score `value` must be an integer between 1 and 5.

## 9. State Transition Rules
- `PENDING` -> `IN_PROGRESS` (when draft score is first saved)
- `IN_PROGRESS` -> `IN_PROGRESS` (updating drafts)
- `IN_PROGRESS` -> `COMPLETED` (when submitted)
- `COMPLETED` -> Immutable (cannot be changed once submitted).

## 10. Idempotency / Concurrency Strategy
- Use `upsert` semantics for draft scores.
- Lock the `JudgeAssignment` row during the transaction (`SELECT ... FOR UPDATE` equivalent in Prisma or rely on optimistic concurrency) to prevent concurrent submissions.
- Check `assignment.status !== 'COMPLETED'` inside the transaction before applying changes.

## 11. Transaction Boundaries
The entire operation must be wrapped in `transactionManager.run()`:
1. Verify assignment status.
2. Upsert the `Score`.
3. Update `JudgeAssignment` status.

## 12. Audit Requirements
- The schema currently overwrites the `Score` row. If raw observations must be strictly auditable and immutable, we should consider append-only `ScoreAudit` logs or at least prevent ANY updates once `JudgeAssignment` is `COMPLETED`.

## 13. Edge Cases Addressed
1. **unauthenticated submission**: Rejected by `requireAuth` (401).
2. **participant submission**: Rejected by `requirePermission(JUDGE)` (403).
3. **organizer attempting judge-only score**: Rejected by `requirePermission(JUDGE)` or by checking assignment ownership.
4. **judge A attempting judge B's assignment**: Rejected (Assignment not found for `user.id`).
5. **nonexistent assignment**: Rejected (404).
6. **assignment for nonexistent project**: Rejected (Data integrity error / 404).
7. **project/event mismatch**: Rejected (409 Conflict).
8. **assignment/event mismatch**: Rejected (409 Conflict).
9. **assignment/track mismatch**: Rejected (409 Conflict).
10. **nonexistent rubric**: Rejected (400/404).
11. **rubric belonging to another event**: Rejected (409).
12. **unknown criterion**: Rejected (400 Bad Request).
13. **criterion from another rubric**: Rejected (400).
14. **missing criterion**: Allowed if `DRAFT`, rejected if `SUBMITTED` (400).
15. **duplicate criterion**: Rejected by payload schema validation (400).
16. **score below 1**: Rejected by schema validation (400).
17. **score above 5**: Rejected by schema validation (400).
18. **non-integer score**: Rejected by schema validation (400).
19. **malformed payload**: Rejected by `validateRequest` (400).
20. **empty score submission**: Allowed if `DRAFT`, rejected if `SUBMITTED`.
21. **partial criterion submission**: Allowed if `DRAFT`.
22. **repeated submission**: Rejected if already `COMPLETED` (409).
23. **update/resubmission**: Allowed if `DRAFT`.
24. **completed assignment resubmission**: Rejected (409).
25. **concurrent submissions**: Prevented by transaction row locks.
26. **transaction failure**: Rolls back gracefully, returns 500.
27. **deadline/event closure**: Rejected if `event.submissionsClose` < `now()`.
28. **assignment status transition integrity**: Handled in transaction (PENDING -> IN_PROGRESS -> COMPLETED).

## 14. Tests Required
- `judge can score own assignment` (200)
- `judge cannot score another judge's assignment` (403/404)
- `participant cannot score` (403)
- `invalid score rejected` (400)
- `unknown criterion rejected` (400)
- `wrong rubric rejected` (409)
- `wrong event/track rejected` (409)
- `missing criteria behavior verified` (200 Draft / 400 Submit)
- `duplicate submission behavior verified` (409)
- `transaction rollback verified` (500)
- `historical 126 fixture scores remain unchanged` (Seed integrity test)

## 15. Files That Would Need Modification
- `backend/src/contracts/judging.ts` (New schemas)
- `backend/src/core/repositories/score-repository.interface.ts` (New)
- `backend/src/infrastructure/database/repositories/prisma-score.repository.ts` (New)
- `backend/src/modules/judging/services/judging.service.ts` (New logic)
- `backend/src/modules/judging/routes.ts` (New endpoint)
- `backend/prisma/schema.prisma` (Pending schema tweaks)

## 16. Files That Must Remain Untouched
- `backend/src/core/authorization/project-resource-authorizer.ts`
- Normalization math files
- Gallery routes

## 17. Risks or Ambiguities
- **HIGH RISK**: Modifying the `Score` schema to include `rubricId` and changing `criteria` JSON keys to use UUIDs will break the existing `fixtures.json` seeding logic which currently uses string keys like `"functionality": 4`. The seed script must be updated simultaneously with the schema change.
- **AMBIGUITY**: Should draft scores be visible to organizers before submission? (Assuming no, until COMPLETED).

## 18. Exact Recommendation for Implementation Order
1. Update `schema.prisma` to add `rubricId` to `Score` (and optionally `status` if we don't strictly rely on `JudgeAssignment.status`).
2. Update `prisma/seed.ts` and `fixtures.json` to align with the new schema (using criterion IDs instead of string labels).
3. Implement `ScoreRepository`.
4. Implement `JudgingService.submitScore` with transaction and domain rules.
5. Implement HTTP endpoint in `modules/judging/routes.ts`.
6. Write integration tests.

---

### FINAL STATUS
- **TIER 1 STATUS:** PASS WITH NON-BLOCKING FINDINGS
- **TIER 2 STATUS:** PASS WITH NON-BLOCKING FINDINGS
- **2D-2 STATUS:** NOT READY (Requires schema update approval and fixture migration plan)
