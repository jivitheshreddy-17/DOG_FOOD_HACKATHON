# Phase 2B-A Schema Verification Report

## 1. Decision
The team selected Option A: Add a nullable `demoUrl` field to the Prisma `Project` model. This explicitly preserves Module 2's functionality without breaking backward compatibility or losing product features.

## 2. Exact Schema Change
Modified `MODULE-1_T1/backend/prisma/schema.prisma`. 
Added exactly:
```prisma
  demoUrl     String?
```
All existing fields, relationships, and types (including `summary`, `repoUrl`, `status`, etc.) remain completely untouched.

## 3. Seed Impact
The seed script (`MODULE-1_T1/backend/prisma/seed.ts`) was inspected and explicitly **NOT MODIFIED**. Prisma's `upsert`/`create` commands automatically allow omission of nullable fields. The seed executed successfully with zero changes, maintaining exact fixture parity.

## 4. Prisma Validation Result
The schema was validated inside the `backend` Docker container.
- Command: `npx prisma validate`
- Output: `The schema at prisma/schema.prisma is valid 🚀`
- Generation (`npx prisma generate`) updated the client without errors.

## 5. Database Update Result
The schema update was applied in the Docker environment.
- Command: `npx prisma db push`
- Result: Successfully applied the schema update in 157ms. No data loss warnings or destructive operation prompts appeared.

## 6. Project Count Before/After
- Project Count: **41** (Unchanged).

## 7. demoUrl NULL Verification
Sample project (`prj_01`) correctly returned `demoUrl: null`.

## 8. Existing-field Integrity Verification
Sample output from `prj_01`:
```javascript
{
  id: 'prj_01',
  title: 'Glass Signal',
  summary: 'One line of what it does.',
  repoUrl: 'https://example.org/repo/01',
  demoUrl: null,
  submittedAt: 2026-02-27T04:08:00.000Z,
  teamId: 'tm_01',
  trackId: 'trk_04',
  status: 'submitted'
}
```
All fields exactly match their original fixture state.

## 9. Regression Verification
The following models were manually audited post-push and verified to have retained their exact schemas and data formats:
- **Session**: `tokenHash` intact and holds secure hashes.
- **Team**: `inviteTokenHash` intact.
- **User**: `fixtureId` intact and holds correct mapping (e.g. `jdg_03`).
- **Event**: `submissionsClose` intact.
- **Score**: `criteria` remains valid JSON (e.g. `{ quality: 5, innovation: 3, functionality: 2 }`).

## 10. Files Changed
- `MODULE-1_T1/backend/prisma/schema.prisma` (Added `demoUrl String?`)

## 11. Commands Executed
Inside `module-1_t1-backend-1` container:
- `docker cp backend/prisma/schema.prisma module-1_t1-backend-1:/app/prisma/schema.prisma`
- `npx prisma validate`
- `npx prisma generate`
- `npx prisma db push`
- `node verify.js` (Custom verification script)

## 12. Final Status
PASS
