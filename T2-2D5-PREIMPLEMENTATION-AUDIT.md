# Tier 2 — 2D-5 Pre-Implementation Audit: Normalization + Diagnostics

==================================================
## 1. CURRENT DATA MODEL AUDIT
==================================================

**Existing Models Inspected:**
- `Score`: Contains `assignmentId`, `judgeId`, `projectId`, `rubricId`, `submittedAt`.
- `ScoreCriterion`: Contains `scoreId`, `criterionId`, `value`.
- `JudgeAssignment`: Tracks `status` (`PENDING`, `IN_PROGRESS`, `COMPLETED`), `eventId`, `trackId`.
- `Rubric` & `RubricCriterion`: Defines the `weight`.
- `User`, `Event`, `Track`, `Project`: Standard metadata.

**Reconstruction of a Finalized Observation:**
A finalized observation can be perfectly reconstructed via Prisma:
```typescript
{
  judgeId: score.judgeId,
  projectId: score.projectId,
  criterionId: scoreCriterion.criterionId,
  value: scoreCriterion.value,
  rubricId: score.rubricId,
  assignmentId: score.assignmentId,
  submittedAt: score.submittedAt
}
```

**Immutability:**
Raw finalized criterion observations are immutable at the application layer. `JudgingService.submitScore` strictly guards against updates if `assignment.status === 'COMPLETED'`, returning a `ConflictError`. OCC (Optimistic Concurrency Control) via `assignment.version` guarantees this against race conditions.

**Blockers / Missing Fields:**
The current schema supports raw scoring perfectly. However, the database currently lacks models to store normalization state:
1. No `NormalizationRun` model to track the execution provenance and snapshot.
2. No `NormalizedResult` model to persist the output mathematically derived from the raw scores.
*(These models must be added during 2D-5).*

==================================================
## 2. NORMALIZATION INPUT CONTRACT
==================================================

**Input Boundary:**
The future normalization engine will consume a flat or grouped array of completed observations:
`(judgeId, projectId, criterionId, assignmentId) -> value (1-5) + weight`

**Missing-Assignment Semantics:**
- **A. Assignment exists but no completed score**: Incomplete coverage diagnostic.
- **B. Score exists but assignment missing**: Data integrity failure. Do not silently ignore.
- **C. Assignment exists but ScoreCriterion incomplete**: Partial observation. Exclude from finalized normalization. Generate diagnostic.
- **D. Assignment + complete finalized ScoreCriterion**: Eligible normalization observation.

**Data Retrieval Strategy:**
The engine will obtain these by querying Prisma for `Score` records where `assignment.status === 'COMPLETED'`. It will join `ScoreCriterion` (for the 1-5 value) and `RubricCriterion` (for the weight), filtering by `eventId`.

Only fully completed assignments will be included in the normalizer to guarantee no partial project evaluations skew the distributions.

==================================================
## 3. MATHEMATICAL ARCHITECTURE
==================================================

The agreed five-layer architecture is fully compatible with the current application state:

- **Layer 1 — Raw weighted scoring:** Simple algebraic sum of weighted values.
- **Layer 2 — Judge calibration:** Estimate overall judge severity $\alpha_j$. Where sufficient data exist, support criterion-specific behavior using shrinkage:
  - $\tilde{\alpha}_{jc} = \lambda_{jc} \alpha_{jc} + (1-\lambda_{jc}) \alpha_j$
  - $\lambda_{jc} = n_{jc} / (n_{jc} + \kappa)$
  *(Explicitly distinguishing: $\alpha_{jc}$ = raw criterion-specific judge estimate, $\alpha_j$ = overall judge severity, $\tilde{\alpha}_{jc}$ = shrunk criterion-specific estimate).*
- **Layer 3 — Ordinal normalization:** The core Logit model.
- **Layer 4 — Weighted aggregation:** Organizer-defined rubric weights applied to latent parameters.
- **Layer 5 — Downstream:** Ranking, diagnostics, and export.

We will maintain strict boundaries between raw scores and normalized scores at the data layer.

==================================================
## 4. ASSIGNMENT GRAPH AUDIT
==================================================

**Structure:**
The judge $\leftrightarrow$ project assignment graph is bipartite.

**Diagnostic Requirements:**
- **Connected Graph:** Ideal. The model can seamlessly compare all projects.
- **Disconnected Graph:** The engine must identify components and normalize identifiable components where mathematically valid. It must mark global comparison as `NOT_IDENTIFIED` and never publish a single global normalized ranking across disconnected components. Component-level results may be persisted only with explicit component identity.
- **Weak Bridges:** High variance/uncertainty flags for edges connecting large clusters.
- **Insufficient Overlap:** Judges who review only 1 project, or projects that receive only 1 judge.

The engine must compute adjacency, connected components, and degree before attempting any Logit optimization.

==================================================
## 5. JUDGE CALIBRATION AUDIT
==================================================

**Expected Judge Diagnostics:**
- **Normal Judge:** Baseline variance, spread aligns with global average.
- **Strict / Lenient Judge:** Consistently low or high values. $\alpha_j$ shifts significantly.
- **Constant / Near-Constant Judge:** Values lack variance (e.g., all 5s). We MUST NOT use naive z-score normalization (which would divide by zero or inflate noise). Instead, we apply shrinkage to regularize these estimates.
- **Low-Observation Judge:** High uncertainty. Shrinkage forces their $\alpha_j$ close to 0.
- **Single Judge Evaluates All (Single Baseline):** Project comparisons within that judge remain possible. Independent judge severity is not identifiable. Do not claim cross-judge calibration. Emit `SINGLE_JUDGE_BASELINE` / `SINGLE_JUDGE_CALIBRATION_LIMIT`.

==================================================
## 6. ORDINAL MODEL AUDIT
==================================================

**Implementation Approach:**
- **Deterministic TypeScript Engine:** We will implement the normalization engine purely in TypeScript without Python/R dependencies. 
- **Solver Decision:** Do not yet implement a solver. However, implementation must first specify:
  - Exact likelihood/objective
  - Parameterization
  - Identifiability constraint
  - Initialization
  - Convergence criterion
  - Maximum iterations
  - Numerical safeguards
  - Failure state
- Do not casually switch to z-score normalization as production normalization.
- **Flow:** `DB Snapshot -> Pure TS Normalization Engine -> In-Memory Result -> DB Persistence`
- The engine will be highly testable with mocked input observations.

==================================================
## 7. NUMERICAL SAFETY AUDIT
==================================================

**Required Protections:**
- **Zero/Empty Observations:** Fast-fail or gracefully return empty sets.
- **Division by Zero / NaN / Infinity:** Guard all variance computations and log-odds ratios.
- **Non-Convergence:** The iterative solver must have a strict `maxIterations` cap.
- **Constant Judges:** Caught by variance checks to prevent singularity in the Hessian matrix.
- **Disconnected Graphs:** Isolated and handled separately to prevent matrix rank deficiency.

A failure in optimization will throw a structured `NormalizationError` resulting in a diagnostic failure state, never a silently published invalid ranking.

==================================================
## 8. NORMALIZATION RUN / REPRODUCIBILITY
==================================================

**Schema Requirements:**
The current schema lacks reproducibility structures. A timestamp alone is not sufficient reproducibility. We must define how a `NormalizationRun` identifies the exact input:
```prisma
model NormalizationRun {
  id                 String
  eventId            String
  rubricId           String
  rubricSnapshot     Json   // or snapshot hash
  inputSnapshot      Json   // finalized input snapshot or snapshot hash
  method             String
  parameters         Json
  diagnostics        Json
  status             String // SUCCESS, FAILED
  createdAt          DateTime
  // ...
}
```
A reproducible run requires an input snapshot (or a snapshot hash) to guarantee auditability.

==================================================
## 9. RUBRIC VERSIONING
==================================================

**Current State:**
Tier 2 (2D-2) enforces a strict freeze on `RubricCriterion` weights if there are any `IN_PROGRESS` or `COMPLETED` assignments. This implicitly guarantees that the rubric is fixed during normalization. 

**Future State:**
The `NormalizationRun` will record the rubric weights at the time of the run via `rubricSnapshot` to ensure historical scores do not lose their meaning if the rubric is somehow mutated later.

==================================================
## 10. RESULT MODEL
==================================================

**Future Conceptual Structure:**
The future result model must preserve these separate concepts (do not collapse into one generic field):
```prisma
model NormalizedResult {
  id                               String
  normalizationRunId               String
  projectId                        String
  criterionId                      String? // null if aggregate
  rawScore                         Float
  rawWeightedScore                 Float
  normalizedCriterionScore         Float
  normalizedWeightedContribution   Float
  finalAggregate                   Float
  uncertainty                      Float
  diagnosticFlags                  Json
}
```

==================================================
## 11. SECURITY / RBAC AUDIT
==================================================

**Authorization Boundaries:**
- **Trigger/Rerun Normalization:** `ORGANIZER`, `ADMIN`
- **View Aggregate Rankings & Diagnostics:** `ORGANIZER`, `ADMIN`
- **View Own Raw Data:** `JUDGE` (Existing 2D-3 rules remain intact).
- **Participants:** Fully restricted (`403 Forbidden`).

The new normalization routes will reuse the strict session parsing and RBAC structures established in 2D-3.

==================================================
## 12. EXPORT AUDIT
==================================================

The existing CSV export functionality must be augmented to selectively include:
- `raw_score`
- `raw_weighted_score`
- `normalized_criterion_score`
- `normalized_weighted_contribution`
- `final_aggregate`
- `uncertainty`
- `diagnostic_flags`
- `normalizationRunId`

Access to the augmented export will remain heavily restricted to Organizers/Admins.

==================================================
## 13. EDGE-CASE MATRIX
==================================================

| Case | Expected Behavior | Diagnostic | Proceed? | Publish? |
|------|------------------|------------|----------|----------|
| Normal connected graph | Smooth optimization | `GRAPH_CONNECTED` | Yes | Yes |
| Disconnected graph | Identify components, normalize valid ones | `GRAPH_DISCONNECTED` / `NOT_IDENTIFIED` | Yes (per component) | No (Global) |
| Weak bridge | Flag high uncertainty | `WEAK_BRIDGE` | Yes | Yes |
| One judge evaluates all | Intra-judge comparisons valid. Independent severity not identifiable. Do not claim cross-judge calibration. | `SINGLE_JUDGE_BASELINE` / `SINGLE_JUDGE_CALIBRATION_LIMIT` | Yes | Component-only |
| Project has 1 eval | High uncertainty for project | `LOW_PROJECT_EVAL` | Yes | Yes |
| Constant judge (all 5s) | Shrinkage applied | `CONSTANT_JUDGE` | Yes | Yes |
| Near-constant judge | Shrinkage applied | `NEAR_CONSTANT_JUDGE` | Yes | Yes |
| Strict/Lenient judge | Severity $\alpha_j$ shifted | `SEVERITY_OUTLIER` | Yes | Yes |
| Assignment exists, no completed score | Incomplete coverage diagnostic | `INCOMPLETE_COVERAGE` | Yes | Yes |
| Score exists, assignment missing | Data integrity failure. Do not silently ignore. | `DATA_INTEGRITY_FAILURE` | No | No |
| Assignment exists, ScoreCriterion incomplete | Exclude from finalized normalization | `PARTIAL_OBSERVATION` | Yes (exclude) | Yes |
| Assignment + complete finalized ScoreCriterion | Eligible normalization observation | `ELIGIBLE_OBSERVATION` | Yes | Yes |
| Missing criterion observation | Exclude from finalized normalization | `PARTIAL_OBSERVATION` | Yes (exclude) | Yes |
| Unequal judge workloads | Optimization naturally weights appropriately | `UNEQUAL_WORKLOAD` | Yes | Yes |
| Low-variance criterion | Handle mathematically gracefully | `LOW_VARIANCE_CRITERION` | Yes | Yes |
| Outlier judge/project behavior | Model bounds parameter shifts | `OUTLIER_BEHAVIOR` | Yes | Yes |
| Zero total observations| Abort gracefully | `NO_DATA` | No | No |
| Invalid score | Abort gracefully | `INVALID_SCORE` | No | No |
| Invalid weight | Abort gracefully | `INVALID_WEIGHT` | No | No |
| Numerical overflow/underflow | Catch error, abort run | `NUMERICAL_ERROR` | No | No |
| Non-convergence | Abort run | `NON_CONVERGENCE` | No | No |
| Rubric mutation | Abort if snapshot mismatched | `RUBRIC_MUTATION` | No | No |
| Assignment mutation after norm. | Flag as stale | `STALE_RUN` | N/A | Organizer Choice |
| Judge removal | Flag as stale | `STALE_RUN` | N/A | Organizer Choice |
| Project removal | Flag as stale | `STALE_RUN` | N/A | Organizer Choice |
| New scores after normalization | Prior run becomes stale | `STALE_RUN` | N/A | Organizer Choice |
| Concurrent normalization runs | OCC handles race conditions | `CONCURRENT_RUNS` | Yes (one wins) | Yes |
| Deterministic rerun | Should produce identical output | `DETERMINISTIC_MATCH` | Yes | Yes |
| Rubric-version mismatch | Abort run | `VERSION_MISMATCH` | No | No |

==================================================
## 14. TEST PLAN
==================================================

**Future Test Strategy:**
1. **Pure Unit Tests:** Test the TS math engine using deterministic synthetic matrices (validating shrinkage, logit convergence, and zero-variance defenses).
2. **Graph Tests:** Pass known disconnected bipartite graphs and verify component isolation.
3. **Integration Tests:** Trigger a normalization run via the API and ensure DB persistence.
4. **RBAC Tests:** Assert Judges and Participants receive `403` on `/api/normalization/*`.
5. **Regression:** Run the 2D-2/2D-3/2D-4 suites to ensure raw judging flow is unaffected.

==================================================
## 15. IMPLEMENTATION BOUNDARY
==================================================

**WHAT 2D-5 WILL IMPLEMENT:**
- Pure TypeScript Normalization Engine (Math).
- `NormalizationRun` and `NormalizedResult` Prisma models.
- Graph analysis and Judge Calibration (Shrinkage + Logit).
- Diagnostics emission.
- API endpoints to trigger and fetch normalization runs.

**WHAT 2D-5 WILL NOT IMPLEMENT:**
- Pairwise ranking (e.g., Elo/Bradley-Terry UI flows).
- Python/R external microservices.
- Modifications to Tier 1 behaviors.
- Publicly visible leaderboards (only Organizer dashboards).

==================================================
## 16. FINAL AUDIT VERDICT
==================================================

**GO WITH CONDITIONS**

The repository requires the above schema expansions and normalization engine architecture to be implemented precisely as stated before enabling Tier 2 — 2D-5 features.

**Files Inspected:**
- `prisma/schema.prisma`
- `judging.service.ts`
- `prisma-score.repository.ts`
- `prisma-judge-assignment.repository.ts`
- `verify-2d2.ts`, `verify-2d3.ts`, `verify-2d4.ts`

**Recommended Implementation Order:**
1. Update `schema.prisma` with `NormalizationRun` and `NormalizedResult` matching the provenance requirements.
2. Build the pure TS math/graph engine (`core/domain/normalization`) with explicit solver constraints.
3. Build the `NormalizationService` to bridge Prisma and the engine.
4. Expose API routes with strict RBAC.
5. Create comprehensive tests for the engine and API.
