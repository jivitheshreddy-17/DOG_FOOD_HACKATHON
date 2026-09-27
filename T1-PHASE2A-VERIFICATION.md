# MODULE-1_T1 Phase 2A Verification

## 1. Phase 2A Scope
The goal of Phase 2A is to verify that the database schema and seed script correctly implement deterministic fixture loading and properly hash sensitive tokens before persistence. Crucially, the schema must store `tokenHash` and `inviteTokenHash` rather than raw tokens, and the static session tokens defined in `.dogfood.toml` must be correctly seeded as SHA-256 hashes.

## 2. Schema Verification
Inspected `backend/prisma/schema.prisma` and confirmed:
- `Session.tokenHash` exists.
- `Team.inviteTokenHash` exists.
- `Session.token` does NOT exist.
- `Team.inviteToken` does NOT exist.
- Static sessions are stored using opaque token hashes.

## 3. Seed Verification
The `backend/prisma/seed.ts` script was successfully executed within the running Docker backend container using `docker compose exec backend npx tsx prisma/seed.ts`. It deterministically parsed `fixtures.json` and populated the database without generating extraneous records or undefined team invite tokens.

## 4. Hash Verification
We verified the static session tokens against the database contents by passing the canonical raw tokens from `.dogfood.toml` through a `sha256` hashing function.
- The raw tokens (`org_7f2a`, `jdg_a_91bc`, `jdg_b_44de`, `prt_2e88`) were confirmed **NOT** to be present in `Session.tokenHash`.
- The database correctly stores the SHA-256 hashes of these raw tokens.
- All mapped tokens resolved to the correct accounts.

## 5. Relationship Verification
The seeded sessions validly relate to their respective user accounts:
- `org_7f2a` maps to `organizer@dogfood.local` (Role: `ORGANIZER`)
- `jdg_a_91bc` maps to `marek.nowak@example.org` (Role: `JUDGE`)
- `jdg_b_44de` maps to `tomas.varga@example.org` (Role: `JUDGE`)
- `prt_2e88` maps to `participant@dogfood.local` (Role: `PARTICIPANT`)

All `Session.userId` foreign key relationships are valid.

## 6. Fixture Count Verification
Database counts perfectly matched the expected fixture counts:
- **Events**: 1 (Expected: 1, `evt_01` exists)
- **Tracks**: 8 (Expected: 8)
- **Judges**: 30 (Expected: 30)
- **Teams**: 40 (Expected: 40)
- **Projects**: 41 (Expected: 41)
- **Scores**: 126 (Expected: 126)
- **Total Users**: 123

## 7. Seed Idempotency Verification
The seed script was executed a second time. Record counts did not increase unexpectedly, and the canonical fixture records remained stable, confirming the upsert-based idempotency.

## 8. Unchanged-File Verification
Confirmed via file modification timestamps that the following files remained completely unchanged during Phase 2A:
- `.dogfood.toml`
- `docker-compose.yml`
- `frontend/next.config.js`

## 9. Commands Executed
```bash
docker compose ps
docker compose exec backend npx prisma validate
docker compose exec backend npx prisma db push --accept-data-loss
docker compose exec backend npx prisma generate
docker compose exec backend npx tsx prisma/seed.ts

# Wrote and executed an inline verification script inside the backend container to confirm hash logic, relationships, and counts
docker cp backend/verify.ts module-1_t1-backend-1:/app/verify.ts
docker compose exec backend npx tsx verify.ts

# Re-ran the seed script for idempotency check
docker compose exec backend npx tsx prisma/seed.ts
docker compose exec backend npx tsx verify.ts
```

## 10. Final Status
PASS
