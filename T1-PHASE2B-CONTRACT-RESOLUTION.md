# Phase 2B Contract Resolution

## 1. TEAM MEMBER CONTRACT RESOLUTION

**Traced Usages:**
- `TeamMemberRecord.id`: Mapped to `TeamMemberDto.id` in `toTeamMemberDto()`. Returned to client on team creation/join.
- `TeamMemberRecord.eventId`: Passed to `TeamMemberRepository.findByEventAndUser()` to enforce the "one team per event" rule. Also saved during `create()`.
- `TeamMemberRecord.createdAt`: Mapped optionally to `TeamMemberDto.created_at`.
- `TeamMemberRecord.teamId` / `userId`: Used extensively for identity and joins.

**Resolutions:**
- `TeamMemberRecord.id`: **DERIVABLE**. Prisma uses a composite PK `[teamId, userId]`. The adapter can safely synthesize this by concatenating `${teamId}_${userId}` when mapping to the domain record.
- `TeamMemberRecord.createdAt`: **REQUIRED_SHAPE_ONLY**. It is mapped to an optional DTO field but never used in domain logic or sorting. Safe to return `undefined` from the adapter.
- `TeamMemberRecord.eventId`: **DERIVABLE**. While Prisma `TeamMember` lacks `eventId`, the `Team` model contains it. The Prisma adapter can derive it either by joining the `Team` table (`include: { team: true }`) or relying on the `teamId` constraint.

## 2. TEAM CONTRACT RESOLUTION

**Traced Usages:**
- `TeamRecord.inviteToken`: `findByInviteToken` is called as a fallback if `findByInviteTokenHash` fails (for backward compatibility).
- `TeamRecord.inviteTokenHash`: Used directly to look up teams securely. `TeamService.createInvite` hashes the token before passing it to the repository.
- `TeamRecord.createdAt` / `updatedAt`: `createdAt` is mapped to an optional string in `toTeamResponseDto`. `updatedAt` is never mapped or used.

**Resolutions:**
- `inviteToken` / `inviteTokenHash`: **REQUIRED_BEHAVIOR (Hash only)**. The `TeamService` actively hashes the invite token before persisting. The fallback to `findByInviteToken` is conditional. The adapter can simply implement `findByInviteTokenHash` and leave `findByInviteToken` as a no-op/unimplemented, safely satisfying the secure logic without persisting raw tokens.
- `createdAt`: **REQUIRED_SHAPE_ONLY**. Safe to return `undefined`.
- `updatedAt`: **UNUSED**.

## 3. PROJECT CONTRACT RESOLUTION

**Traced Usages:**
- `demoUrl`: Accepted in `CreateProjectRequest` and `UpdateProjectRequest`, validated by Zod schemas, assigned to domain entities in `ProjectService`, and explicitly returned in `toProjectDto()`. Tests actively assert that `demo_url` is properly saved, updated, and cleared.
- `description`: Handled as the primary text field for projects. Semantically identical to Prisma's `summary`.
- `repositoryUrl`: Handled as the source code link. Semantically identical to Prisma's `repoUrl`.

**Resolutions:**
- `description`: **DERIVABLE**. Adapter can map to Prisma's `summary`.
- `repositoryUrl`: **DERIVABLE**. Adapter can map to Prisma's `repoUrl`.
- `demoUrl`: **REQUIRED_BEHAVIOR**. It is fully utilized across the validation, service, and response layers. The Prisma schema lacks this field entirely. It CANNOT be silently dropped. This is a strict blocker.

## 4. TRACK CONTRACT RESOLUTION

**Traced Usages:**
- `description` and `createdAt` are returned by the repository interface but are never accessed by any Module 2 business logic. `ProjectService` only queries `track.eventId` and `track.id`.

**Resolutions:**
- `TrackRecord.description`: **UNUSED**.
- `TrackRecord.createdAt`: **UNUSED**.

## 5. EVENT CONTRACT RESOLUTION

**Traced Usages:**
- `submissionDeadline`: Directly used by `ProjectService.submitProject()` to enforce submission time constraints. It is semantically identical to Prisma's `submissionsClose`.
- `createdAt`: Never accessed by Module 2 business logic.

**Resolutions:**
- `submissionDeadline`: **DERIVABLE**. Map directly to `submissionsClose`.
- `createdAt`: **UNUSED**.

## 6. TRANSACTION MANAGER

**Expected Semantics:**
- **Requires transaction-bound repositories?** Yes. The `AppRepositories` instance passed to the callback must execute operations within the transaction boundary.
- **Multiple operations?** Yes. `TeamService` creates a team and team member atomically. `ProjectService` reads project status and updates it atomically.
- **Nested?** No nested transactions are used.
- **Prisma leaks?** No Prisma types leak into the domain.

**Adapter boundary:** The adapter must implement `PrismaTransactionManager` wrapping `prisma.$transaction`. Inside the callback, it will instantiate Prisma-backed repository adapters injected with the transaction client (`tx`) and pass them to the domain operation.

## 7. TYPESCRIPT / MODULE SYSTEM

**Module System Inspection:**
Despite `tsconfig.json` specifying `NodeNext`, Module 2 source code heavily utilizes extensionless imports (e.g., `import { healthRoute } from './health.route';`). It relies on build tools (`tsx`/`vitest`) for resolution rather than strict NodeNext ESM runtime constraints.

**Resolution:**
Module 2's domain code can be safely integrated into Module 1's CommonJS backend without altering the module system. Extensionless imports natively align with `moduleResolution: "node"` in CommonJS.

## 8. COMPOSITION ROOT

**Integration Boundary:**
The smallest integration boundary is the `AppRepositories` interface. 
- **Keep:** `resolveDependencies()` factory in `dependencies.ts`.
- **Replace:** `createPlaceholderRepositories()` with Prisma adapters.
- **Action:** Instantiate Prisma adapters (e.g. `new PrismaUserRepository(prisma)`) and inject them via the `overrides` argument of `resolveDependencies()`. 

## 9. CONTRACT DECISION TABLE

| Contract | Field | Actual consumer | Classification | Adapter action | Safe? |
|---|---|---|---|---|---|
| TeamMember | `id` | `toTeamMemberDto` | DERIVABLE | Synthesize `${teamId}_${userId}` | Yes |
| TeamMember | `eventId` | `findByEventAndUser` | DERIVABLE | Join `Team` to extract `eventId` | Yes |
| TeamMember | `createdAt` | `toTeamMemberDto` | REQUIRED_SHAPE_ONLY | Return `undefined` | Yes |
| Team | `createdAt` | `toTeamResponseDto` | REQUIRED_SHAPE_ONLY | Return `undefined` | Yes |
| Team | `updatedAt` | None | UNUSED | Ignore | Yes |
| Team | `inviteToken` | `joinTeam` (fallback) | UNUSED | Omit implementation (hash only) | Yes |
| Team | `inviteTokenHash`| `joinTeam` | REQUIRED_BEHAVIOR | Persist directly to DB | Yes |
| Project | `description` | `toProjectDto` / Service | DERIVABLE | Alias to `summary` | Yes |
| Project | `repositoryUrl` | `toProjectDto` / Service | DERIVABLE | Alias to `repoUrl` | Yes |
| Project | `demoUrl` | Validations, Service, DTOs | REQUIRED_BEHAVIOR | **None available** | **NO** |
| Track | `description` | None | UNUSED | Ignore | Yes |
| Track | `createdAt` | None | UNUSED | Ignore | Yes |
| Event | `submissionDeadline` | `submitProject` | DERIVABLE | Alias to `submissionsClose` | Yes |
| Event | `createdAt` | None | UNUSED | Ignore | Yes |

## 10. PHASE 2B BLOCKER DECISION

**BLOCKED**

**Remaining Blockers:**
1. **Data Loss on `demoUrl`**: The Module 2 application layer actively validates, manages, and exposes a `demoUrl` for projects. The Module 1 Prisma schema lacks this field entirely. Because silent data loss is strictly prohibited and the Prisma schema is frozen, the integration cannot proceed until this contract disparity is resolved at an architectural level.
2. **Score Model Incompatibility**: As identified in the previous audit, Module 3 requires a scalar `score` integer, whereas Module 1 uses a `criteria` JSON schema. While Module 2 does not implement Score persistence, this overarching data model mismatch remains a future integration blocker.
