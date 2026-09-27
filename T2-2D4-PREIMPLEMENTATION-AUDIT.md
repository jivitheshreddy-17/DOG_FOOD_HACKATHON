# Tier 2 — 2D-4: Live Judging Progress Pre-Implementation Audit

## 1. Current Architecture
* **Backend:** Node.js, Fastify REST API, Prisma ORM, PostgreSQL.
* **Frontend:** Next.js (App Router).
* **Communication:** Standard HTTP request/response.

## 2. Data Model Analysis
The authoritative source of truth for judging progress is the `status` field on the `JudgeAssignment` table.
* **total assignments:** `COUNT(*)` of `JudgeAssignment` rows.
* **pending:** `COUNT(*)` where `status == 'PENDING'`.
* **in progress:** `COUNT(*)` where `status == 'IN_PROGRESS'`.
* **completed:** `COUNT(*)` where `status == 'COMPLETED'`.
* **completion percentage:** Calculated mathematically as `(completed / total) * 100`.
* **track-level progress:** Calculated using Prisma's `groupBy` on `trackId` and `status`.
* **judge-level progress:** Calculated using Prisma's `groupBy` on `judgeId` and `status`.

## 3. Current Endpoint Analysis
Current judging routes in `backend/src/modules/judging/judging.routes.ts`:
* `POST /api/judge/assignments/:assignmentId/scores` (reusable: transitions assignment state)
* `GET /api/judge/assignments` (reusable: lists assignments)
* `GET /api/judge/assignments/:assignmentId/scores` (reusable: fetches individual score)

Current export routes:
* `GET /api/export.csv` (unsafe for progress use: dumps full sensitive data)

**Conclusion:** A dedicated progress dashboard endpoint is **missing** and needs to be created.

## 4. Authorization / Isolation Analysis
* **JUDGE:** May access progress exclusively for their own assignments. The backend must enforce `where: { judgeId: auth.id }` and prevent the response from containing the `byJudge` aggregate breakdown to avoid leaking sibling judge workloads.
* **ORGANIZER / ADMIN:** May access overall event-level progress, including cross-track and cross-judge aggregate breakdowns.
* **PARTICIPANT / UNAUTHENTICATED:** Must be entirely blocked (`403 Forbidden` / `401 Unauthorized`).

## 5. Live-State Semantics
* **State Transitions:** 
  * New assignments begin as `PENDING`.
  * Saving a draft transitions the assignment to `IN_PROGRESS`.
  * Fully submitting a score transitions the assignment to `COMPLETED`.
* **Live Mechanism:** Given the current DOGFOOD architecture (Fastify REST APIs), client-side **polling** (e.g., fetching every 5-10 seconds) is perfectly sufficient to meet the "live" requirement. We do not need to introduce WebSockets or Server-Sent Events (SSE) unless explicitly requested, as it would unnecessarily complicate the deployment and architecture.

## 6. API Proposal
**New Endpoint:** `GET /api/judge/progress`

**Request:** 
* Query parameters: `eventId` (string)

**Authorization:**
* `requireAuth()`
* `requirePermission(PERMISSIONS.JUDGE_VIEW)`

**Response DTO:**
```typescript
{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionPercentage: number;
  byTrack?: Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }>;
  // byJudge is only returned if the user is an ORGANIZER or ADMIN
  byJudge?: Record<string, { total: number; pending: number; inProgress: number; completed: number; percentage: number }>;
}
```

## 7. Frontend Proposal
Currently, the `frontend/app` directory does not contain any judging-specific views (e.g., no `/judge` route exists). 
To consume this new backend capability, the frontend would eventually need a new page component (e.g., `frontend/app/judge/dashboard/page.tsx`) that implements polling via SWR, React Query, or `setInterval` with `fetch()`.

## 8. Performance Approach
Progress calculations will rely on database-level aggregations using Prisma:
* `prisma.judgeAssignment.aggregate({ _count: true, where: { ... } })`
* `prisma.judgeAssignment.groupBy({ by: ['status', ...], _count: true })`

We will **not** load raw `Score` or `ScoreCriterion` records into memory. Furthermore, PostgreSQL effortlessly handles aggregate groupings for tens of thousands of rows. We will **not** implement Redis caching prematurely.

## 9. Edge Cases
* **Zero assignments:** Prevent `NaN` or `Infinity` by explicitly checking `total === 0` and returning `0%`.
* **Deterministic Rounding:** Enforce `Math.round((completed / total) * 100)` for percentages.
* **Mixed States:** Validation that partial/draft submissions correctly reflect in `inProgress`.
* **Empty Tracks/Judges:** Tracks/judges with 0 assignments will either be excluded from the dictionary or mapped to zeros safely.

## 10. Test Plan
We will create `src/__tests__/verify-2d4.ts` covering:
* **AUTH:** Unauthenticated (401), Participant (403).
* **ISOLATION:** Judge sees only own aggregate progress and NO `byJudge` map. Organizer sees everything.
* **STATE:** Verify initial state (all PENDING). Simulate a draft score and verify it increments `IN_PROGRESS`. Simulate a submit and verify it increments `COMPLETED`.
* **MATH:** Validate 0 assignments gracefully returns 0%. Validate exact 50% / 100% boundary calculations.
* **REGRESSION:** Ensure `verify-2d2.ts` and `verify-2d3.ts` continue to pass without modifications.

## 11. Exact Files Expected to Change
* `backend/src/modules/judging/judging.routes.ts`
* `backend/src/modules/judging/judging.service.ts`
* `backend/src/core/repositories/judge-assignment-repository.interface.ts`
* `backend/src/infrastructure/database/repositories/prisma-judge-assignment.repository.ts`
* `backend/src/__tests__/verify-2d4.ts` (New file)

## 12. Risks / Limitations
* High-frequency polling across thousands of concurrent clients could cause DB strain, though standard hackathon scale typically handles this gracefully without caching.
* The response payload relies entirely on `JudgeAssignment.status` being correctly synced during score operations.

## 13. Confirmation
The implementation of this read-only aggregation layer will not mutate underlying judging states, ensuring that **Tier 2 — 2D-2 (immutability/constraints)** and **Tier 2 — 2D-3 (authorization isolation)** remain fully intact.
