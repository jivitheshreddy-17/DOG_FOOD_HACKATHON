# Tier 2 — 2D-3 Pre-Implementation Audit: Judge / Resource Isolation

## 1. Current Authentication Model
The system uses session-based authentication via HTTP-only cookies (`session`).
- Unauthenticated requests are rejected with 401 via the `requireAuth()` preHandler hook.
- The `request.auth` object is populated with the user's `id` and `role`.

## 2. Current Permission Model
RBAC is implemented via the `requirePermission(PERMISSION)` preHandler hook.
- Roles (`PARTICIPANT`, `JUDGE`, `ORGANIZER`, `ADMIN`) have associated permissions.
- E.g., `PERMISSIONS.JUDGE_EVALUATE` is required to hit judging routes, returning 403 for unauthorized roles like `PARTICIPANT`.

## 3. Current Judge-Resource Authorization
In the `JudgingService`, operations are constrained by an explicit ownership check:
- The system fetches the `JudgeAssignment` using `assignmentId`.
- It verifies `assignment.judgeId === request.auth.id`.
- If there is a mismatch, a `ForbiddenError` (403) is thrown.

## 4. Endpoint Inventory
Current endpoints capable of exposing or mutating judge data:
- `POST /api/judge/assignments/:assignmentId/scores` (Safe for judges, but overly strict for Organizers if they need mutation rights).
- `GET /api/judge/assignments/:assignmentId/scores` (Safe for judges, but overly strict for Organizers who need read access).
*Note: No list endpoints (e.g., GET /api/judge/assignments) or export endpoints currently exist.*

## 5. Data Exposure Inventory
- **Score & ScoreCriterion**: Exposed only via `GET /api/judge/assignments/:assignmentId/scores` to the assigned judge.
- **JudgeAssignment**: Implicitly exposed as part of the score payload.
- **Projects/Teams**: Exposed via `/api/projects` and `/api/teams` but without any judging/score data (`toProjectDto` explicitly filters it out).
- **Aggregate judging data**: Not exposed anywhere.
- **Export data**: Not exposed anywhere.
- **Audit data**: Not exposed anywhere.

## 6. Cross-Judge Isolation Analysis
**Classification:** Safe
- A judge cannot request another judge's score because `JudgingService.getScore` strictly enforces `assignment.judgeId === judgeId`. If Judge A requests Judge B's assignment ID, they receive a 403 Forbidden.

## 7. Cross-Track Isolation Analysis
**Classification:** Safe (Inherited)
- Since a judge can only access assignments explicitly assigned to their `judgeId`, cross-track isolation is automatically enforced (they cannot access an assignment in another track unless they are assigned to it). However, there is no explicit track-level guard.

## 8. Cross-Event Isolation Analysis
**Classification:** Safe (Inherited)
- Similar to tracks, assignments are uniquely tied to a judge. They cannot access assignments from other events unless explicitly assigned.

## 9. Participant Isolation Analysis
**Classification:** Safe
- Participants cannot hit `/api/judge/assignments/:assignmentId/scores` due to `requirePermission(PERMISSIONS.JUDGE_EVALUATE)` throwing a 403.
- `GET /api/projects` strips all score data via the presentation mapper.

## 10. Organizer/Admin Access Analysis
**Classification:** Incorrect authorization (Missing/Overly Strict)
- **Issue**: Organizers currently cannot access a specific judge's score using `GET /api/judge/assignments/:assignmentId/scores` because `JudgingService.getScore` strictly checks `assignment.judgeId !== judgeId`.
- **Requirement**: Organizers/Admins must have bypass privileges to access authorized judging data.

## 11. Export Isolation Analysis
**Classification:** Not yet implemented
- There are no CSV or export endpoints currently implemented for organizers to dump scores.

## 12. Audit-Data Exposure Analysis
**Classification:** Safe
- Timestamps (`createdAt`, `updatedAt`, `submittedAt`) and potentially versioning information are returned in the DTO for the specific score, but aggregate or system-wide audit data is not exposed.

## 13. Repository-Level Risks
- `PrismaJudgeAssignmentRepository.findByJudge(judgeId)` and `findByEvent(eventId)` exist but are not currently exposed via any HTTP route. If directly wired to a route without service-layer authorization checks, they could leak data.
- The repositories correctly accept `judgeId` filters where applicable, but rely on the Service layer to provide the context.

## 14. Exact Changes Required for 2D-3
1. **Service Layer Authorization Bypass**: Update `JudgingService.getScore` (and potentially `submitScore` if intended) to bypass the `assignment.judgeId !== judgeId` check if the `request.auth.role` is `ORGANIZER` or `ADMIN`.
2. **List Assignments Route**: Implement a new route (e.g., `GET /api/judge/assignments`) that returns a judge's assignments. For organizers, it should support filtering by event/track or returning all assignments.
3. **Export Route**: Implement an organizer-only CSV export route (e.g., `GET /api/export/scores`) that aggregates all completed scores.
4. **Ensure strict isolation**: Ensure that any new list endpoints strictly filter by `request.auth.id` for judges, preventing cross-judge exposure.

## 15. Tests Required
- `Judge A requests Judge A's score → 200`
- `Judge A requests Judge B's score → 401/403`
- `Participant requests judge score → 401/403`
- `Unauthenticated request → 401`
- `Organizer requests Judge A's score → 200`
- `Organizer export → 200 + CSV payload`
- `Judge requests Organizer export → 401/403`

## 16. Files Expected to Change
- `backend/src/modules/judging/judging.routes.ts`
- `backend/src/modules/judging/judging.service.ts`
- `backend/src/modules/export/*` (New module/routes for CSV export)
- `backend/src/__tests__/verify-2d3.ts` (or similar for 2D-3 tests)

## 17. Explicit Statement
Tier 2 — 2D-2 remains fully intact. No code modifications have been made during this pre-implementation audit.
