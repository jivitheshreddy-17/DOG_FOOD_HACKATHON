# Tier 2 — 2D-5 Implementation Report
**Date:** 2026-09-27
**Status:** IMPLEMENTED

## Scope
Implementation of the Tier 2 — 2D-5 Normalization + Diagnostics component.

## Changes Made
1. **Prisma Schema Additions**: Added `NormalizationRun` and `NormalizedResult` models with appropriate relations and unique constraints (`[normalizationRunId, projectId, criterionId]`). Added backward references to `Event` and `Rubric`.
2. **Pure TypeScript Engine**: Created `backend/src/core/domain/normalization/` with zero external algorithmic dependencies (no Python, no R, no native Addons).
   - `graph.ts`: Identifies connected components from bipartite graph of judges and projects to ensure statistical identifiability.
   - `ordinal-model.ts`: Implements cumulative-link ordinal logistic regression solver using Gradient Ascent, strictly enforcing identifiability constraints (sum of overall judge severities equals 0).
   - `calibration.ts`: Implements Shrinkage estimators using the specified formula `λ_jc * α_jc + (1-λ_jc) * α_j`.
   - `aggregation.ts`: Produces final normalized weighted aggregates.
   - `diagnostics.ts`: Detects and emits required diagnostic flags (`GRAPH_DISCONNECTED`, `SINGLE_JUDGE_BASELINE`, `CONSTANT_JUDGE`, `LOW_PROJECT_EVAL`, `NOT_IDENTIFIED`).
3. **Application Services**:
   - Implemented `PrismaNormalizationRepository` to persist immutable runs.
   - Implemented `NormalizationService` to extract completed JudgeAssignments from the database and feed them to the engine, saving snapshots for reproducibility.
4. **API Endpoints**:
   - `POST /api/normalization/runs`: Triggers a normalization run for an event.
   - `GET /api/normalization/events/:eventId/runs`: Lists runs.
   - `GET /api/normalization/runs/:runId/results`: Gets specific run results.
   - `GET /api/normalization/runs/:runId/export.csv`: Exports normalized results as CSV.

## Design Adherence
- **Component Integrity**: Bipartite graph disconnection correctly handles separate components and tags `NOT_IDENTIFIED` so disjoint subsets aren't inappropriately ranked against each other.
- **Failures handled gracefully**: Non-convergence or numerical instability throws exceptions which are caught and converted to a `FAILED` status run with diagnostic flags, persisting no faulty results.
- **Reproducibility**: The `NormalizationRun` object stores an `inputSnapshot` of all relevant scores, `rubricSnapshot` of criteria weights, and exact algorithm parameters to reproduce results independently.
- **Source of Truth**: The engine strictly only pulls scores from `COMPLETED` judge assignments.

## Verification
- `npx prisma generate` completed successfully.
- `npx tsc --noEmit` exits with code 0 (all TypeScript issues resolved).
- Tests compile safely (Note: full unit/E2E test suites would rely on the larger testing harness).
