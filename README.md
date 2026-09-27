# DOGFOOD 2026 — Hackathon Platform

Self-hostable, air-gapped hackathon submission and judging platform.
Tier claims: **T1 + T2**.

---

## Quick Start

```bash
docker compose up
```

The stack boots, migrates the database, seeds all fixture data, and exposes
the portal at **http://localhost:8080**. No internet connection required.

Seeded test credentials are printed to the backend log:

```
seeded. test logins:
  organizer    Cookie: session=org_7f2a
  judge_a      Cookie: session=jdg_a_91bc
  judge_b      Cookie: session=jdg_b_44de
  participant  Cookie: session=prt_2e88
```

---

## Run the acceptance checker

```bash
cd MODULE-1_T1
python3 ../references/run.py .dogfood.toml > acceptance-report.txt
cat acceptance-report.txt
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Docker Compose (isolated network — no internet required) │
│                                                           │
│  localhost:8080                                           │
│       │                                                   │
│  ┌────▼──────────┐      ┌─────────────────┐              │
│  │  Next.js 14   │─────▶│  Fastify 4       │              │
│  │  (App Router) │      │  (TypeScript)    │              │
│  │  port 3000    │      │  port 3001       │              │
│  └───────────────┘      └────────┬────────┘              │
│                                  │                        │
│                     ┌────────────▼────────────┐          │
│                     │      PostgreSQL 16        │          │
│                     │  (Prisma ORM + migrations)│          │
│                     └──────────────────────────┘          │
│                                  │                        │
│                     ┌────────────▼────────────┐          │
│                     │      Redis 7             │          │
│                     │  (session store)         │          │
│                     └──────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

| Layer       | Technology             | Version |
|-------------|------------------------|---------|
| Frontend    | Next.js (App Router)   | 14.2.5  |
| Backend     | Fastify + TypeScript   | 4.x     |
| ORM         | Prisma                 | 5.x     |
| Database    | PostgreSQL             | 16      |
| Cache       | Redis                  | 7       |
| Runtime     | Node.js LTS            | 20      |

---

## Project Structure

```
MODULE-1_T1/
├── .dogfood.toml          ← acceptance harness configuration
├── .env.example           ← env var template (copy to .env for local dev)
├── docker-compose.yml     ← single-command orchestration
├── LICENSE                ← MIT
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma  ← data model (User, Session, Event, Track, Team, Project, Score)
│   │   └── seed.ts        ← deterministic seeder (ingests fixtures.json)
│   └── src/
│       └── index.ts       ← Fastify entry point
│
└── frontend/
    ├── Dockerfile
    ├── next.config.js     ← standalone output + /api/* proxy to backend
    ├── package.json
    ├── tsconfig.json
    └── app/
        ├── layout.tsx
        ├── page.tsx        ← redirects → /projects
        └── projects/
            └── page.tsx    ← SSR gallery (Module 3)
```

---

## Data Model

See [`../references/DATA-MODEL.md`](../references/DATA-MODEL.md) for the
full narrative spec and fixture schema description.

Key design decisions:
- All fixture IDs (`evt_01`, `trk_01`, `jdg_08`, etc.) are used as natural
  primary keys — no UUID translation needed.
- `User.fixtureId` correlates judge users to their fixture `jdg_XX` IDs.
- `Score.criteria` is a `Json` column — holds the flexible criteria map from
  fixtures without a rigid schema.
- Sessions are opaque tokens stored in PostgreSQL and cached in Redis.

---

## Tier Coverage

### T1 — Core (Mandatory Floor)

| Check | Status | Notes |
|---|---|---|
| gallery is public | ✅ Module 3 | GET /projects → 200, SSR fixture titles |
| project from fixtures shown | ✅ Module 3 | Titles in initial HTML |
| closed event refuses submissions | ✅ Module 2 | Deadline guard on POST /projects/new |

### T2 — Judging

| Check | Status | Notes |
|---|---|---|
| judge sees own scores | ✅ Module 3 | GET /api/judge/scores → 200 |
| judge cannot see peer scores | ✅ Module 2+3 | Backend-enforced, not UI-only |
| participant blocked | ✅ Module 2 | RBAC pre-handler |
| csv export works | ✅ Module 3 | GET /api/export.csv → CSV with comma header |

---

## Development

### Local (without Docker)

```bash
# 1. Start postgres + redis
docker compose up postgres redis -d

# 2. Copy env
cp .env.example .env

# 3. Backend
cd backend
npm install
npm run db:push
npm run db:seed
npm run dev

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Acceptance check (local)

```bash
python3 ../references/run.py .dogfood.toml
```

---

## License

MIT — see [LICENSE](./LICENSE).
