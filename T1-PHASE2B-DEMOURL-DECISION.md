# Phase 2B Demo URL Architecture Decision

## 1. Evidence
- Module 2 source code actively consumes `demoUrl` (`project.service.ts`, contracts, mappers). Tests assert its presence.
- Module 1 Prisma schema (`backend/prisma/schema.prisma`) lacks a `demoUrl` field for `Project`.
- Module 1 `fixtures.json` and `seed.ts` do not provide or expect a `demoUrl` for projects.
- Module 3 gallery (`app/projects/page.tsx`) renders `title`, `description`, `teamName`, `trackName`, and `submittedAt`, but does NOT render a `demoUrl` or `repoUrl`.
- T1 Acceptance Spec (`DATA-MODEL.md` and `run.py`) does not check for or require `demoUrl`.

## 2. Current Module 1 Project persistence
- Models exactly: `id`, `title`, `summary` (Text), `repoUrl`, `submittedAt`, `teamId`, `trackId`, `status`, `createdAt`, `updatedAt`.
- There are no generic JSON fields, `ProjectMetadata` tables, or key-value models attached to the Project.

## 3. Current Module 2 demoUrl behavior
- `CreateProjectRequest` and `UpdateProjectRequest` accept an optional `demo_url`.
- `ProjectService` persists it to the domain `ProjectRecord`.
- `toProjectDto` maps it back to the client as `demo_url`.
- Tests actively assert the ability to set, update, and clear `demo_url`.

## 4. T1 requirement status
- **NOT REQUIRED**. `demoUrl` is entirely absent from `fixtures.json`, `seed.ts`, `DATA-MODEL.md`, and the T1 acceptance criteria. It is an implementation detail of Module 2 that exceeds the T1 spec.

## 5. Module 3 dependency status
- **NOT REQUIRED**. `T1_MODULE3_REVIEW/apps/web/src/app/projects/page.tsx` does not display or link to a `demoUrl`. 

## 6. Option A analysis (Add demoUrl to project persistence)
- **Schema change:** Add `demoUrl String?` to the `Project` model in `schema.prisma`.
- **Nullable vs required:** Must be nullable (`String?`) because the 41 existing fixture projects do not have it.
- **Migration/data-loss:** A safe, non-breaking migration. No data loss.
- **Seed implications:** None. `seed.ts` will continue to seed fixtures without `demoUrl` safely.
- **Compatibility with existing 41 fixture projects:** Full compatibility.
- **Impact on T1 acceptance:** None.
- **Impact on Module 3 gallery:** None.
- **Impact on future T2:** None.
- **Violates frozen requirement:** No. `schema.prisma` is actively modified in Phase 1 (e.g., `tokenHash`). Adding a field is safe and isolated.
- **Status:** VIABLE.

## 7. Option B analysis (Adapt Module 2 project contract/behavior)
- **Service behavior:** `ProjectService.createProject` and `updateProject` must drop all references to `demoUrl`.
- **DTO behavior:** Remove `demo_url` from `ProjectDto` and `ProjectResponse`.
- **Validation behavior:** Remove `demo_url` from `createProjectSchema` and `updateProjectSchema`.
- **Tests:** Remove all assertions regarding `demo_url` from `project-contracts.test.ts` and `mappers.test.ts`.
- **Actual product behavior loss:** Teams will no longer be able to attach a demo URL to their projects.
- **Module 3/T1 requirement:** Neither requires it.
- **Status:** VIABLE.

## 8. Option C analysis (Separate demoUrl persistence)
- The current Prisma schema contains no extension points, no JSON metadata fields on `Project`, no key-value stores, and no `ProjectSettings` relations.
- **Status:** INCOMPATIBLE.

## 9. Compatibility table

| Option | Preserves Module 1 behavior | Preserves Module 2 behavior | Schema impact | Data migration risk | T1 risk | T2 risk | Complexity |
|---|---|---|---|---|---|---|---|
| A (Add to schema) | Yes | Yes | `demoUrl String?` | None (nullable addition) | None | None | Low |
| B (Drop from Mod 2) | Yes | No (feature loss) | None | None | None | None | Medium (requires refactoring tests & domain) |
| C (Separate storage) | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## 10. Architectural decision required
Because multiple options remain viable, a:
**DECISION REQUIRED FROM TEAM**

## 11. Exact consequence of each decision
- **If Option A is chosen:** A non-breaking database migration will add `demoUrl String?` to `Project`. Module 2's feature set is fully preserved. The 41 fixture projects remain valid with null `demoUrl`s.
- **If Option B is chosen:** Module 2's contracts, validations, services, and tests will be refactored to permanently remove `demoUrl`. Teams lose the ability to submit a demo link, but the system perfectly aligns with the current frozen Prisma schema.
- **Option C cannot be chosen** because it would require inventing a new generic metadata system, which is explicitly forbidden.
