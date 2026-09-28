/**
 * DOGFOOD 2026 — Deterministic Seeder
 *
 * Ingests references/fixtures.json and seeds all fixture data.
 * Also creates four static session tokens that must match .dogfood.toml exactly.
 *
 * All writes are upserts — safe to run on every container restart.
 *
 * Static session mapping (frozen by the Tier-1 contract):
 *   org_7f2a    → organizer account (organizer@dogfood.local)
 *   jdg_a_91bc  → judge_a = jdg_08 (Marek Nowak) in fixtures
 *   jdg_b_44de  → judge_b = jdg_01 (Tomas Varga) in fixtures
 *   prt_2e88    → participant account (participant@dogfood.local)
 *
 * peer_scores route uses ?judge=jdg_08, so jdg_08 must be judge_a's fixture ID.
 */

import { PrismaClient, Role } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "node:crypto";

const prisma = new PrismaClient({ log: ["warn", "error"] });

// ── Static session tokens — MUST match .dogfood.toml exactly ─────────────────
const SESSIONS = {
  organizer:   "org_7f2a",
  judge_a:     "jdg_a_91bc",  // fixture ID: jdg_08 (Marek Nowak)
  judge_b:     "jdg_b_44de",  // fixture ID: jdg_01 (Tomas Varga)
  participant: "prt_2e88",
} as const;

// judge_a's fixture ID must match the ?judge= param in peer_scores route
const JUDGE_A_FIXTURE_ID = "jdg_08";
const JUDGE_B_FIXTURE_ID = "jdg_01";

// Sessions won't expire before the heat death of the universe
const FAR_FUTURE = new Date("2099-12-31T23:59:59Z");

// ── Fixture shape ─────────────────────────────────────────────────────────────
interface FixtureJudge {
  id: string;
  name: string;
  email: string;
  tracks: string[];
}

interface FixtureTeam {
  id: string;
  name: string;
  members: string[];
}

interface FixtureProject {
  id: string;
  team: string;
  track: string;
  title: string;
  summary: string;
  repo_url: string;
  submitted_at: string;
}

interface FixtureScore {
  judge: string;
  project: string;
  criteria: Record<string, number>;
  comment: string;
}

interface Fixtures {
  event: { id: string; name: string; submissions_close: string };
  tracks: Array<{ id: string; name: string }>;
  judges: FixtureJudge[];
  teams: FixtureTeam[];
  projects: FixtureProject[];
  scores: FixtureScore[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadFixtures(): Fixtures {
  const candidates = [
    process.env.FIXTURES_PATH,
    path.join(__dirname, "..", "fixtures.json"),
    path.join(__dirname, "..", "..", "fixtures.json"),
    path.join(__dirname, "..", "..", "references", "fixtures.json"),
    path.join(__dirname, "..", "..", "..", "references", "fixtures.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      console.log(`[seed] loaded fixtures from ${p}`);
      return JSON.parse(raw) as Fixtures;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `fixtures.json not found. Searched: ${candidates.join(", ")}\n` +
    "Set FIXTURES_PATH env var or place fixtures.json at the repo root."
  );
}

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function upsertSession(token: string, userId: string) {
  const tokenHash = hashToken(token);
  await prisma.session.upsert({
    where:  { tokenHash },
    create: { tokenHash, userId, expiresAt: FAR_FUTURE },
    update: { userId, expiresAt: FAR_FUTURE },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const f = loadFixtures();

  // ── 0. Special accounts (organizer + test participant) ─────────────────────
  const organizer = await prisma.user.upsert({
    where:  { email: "organizer@dogfood.local" },
    create: {
      email:        "organizer@dogfood.local",
      name:         "Organizer",
      passwordHash: "seed-placeholder",
      role:         Role.ORGANIZER,
    },
    update: {},
  });

  const participant = await prisma.user.upsert({
    where:  { email: "participant@dogfood.local" },
    create: {
      email:        "participant@dogfood.local",
      name:         "Participant",
      passwordHash: "seed-placeholder",
      role:         Role.PARTICIPANT,
    },
    update: {},
  });

  // ── 1. Event ───────────────────────────────────────────────────────────────
  await prisma.event.upsert({
    where:  { id: f.event.id },
    create: {
      id:               f.event.id,
      name:             f.event.name,
      submissionsClose: new Date(f.event.submissions_close),
      organizerId:      organizer.id,
    },
    update: {
      name:             f.event.name,
      submissionsClose: new Date(f.event.submissions_close),
      organizerId:      organizer.id,
    },
  });
  console.log(`[seed] event   → ${f.event.id} "${f.event.name}"`);

  // ── 2. Tracks ──────────────────────────────────────────────────────────────
  for (const track of f.tracks) {
    await prisma.track.upsert({
      where:  { id: track.id },
      create: { id: track.id, name: track.name, eventId: f.event.id },
      update: { name: track.name },
    });
  }
  console.log(`[seed] tracks  → ${f.tracks.length} records`);

  // ── 3. Judge users ─────────────────────────────────────────────────────────
  // Map fixture judge ID → User DB ID (needed to link scores)
  const judgeUserMap: Record<string, string> = {};

  for (const judge of f.judges) {
    const user = await prisma.user.upsert({
      where:  { email: judge.email },
      create: {
        email:        judge.email,
        name:         judge.name,
        passwordHash: "seed-placeholder",
        role:         Role.JUDGE,
        fixtureId:    judge.id,
      },
      update: {
        name:      judge.name,
        fixtureId: judge.id,
      },
    });
    judgeUserMap[judge.id] = user.id;
  }
  console.log(`[seed] judges  → ${f.judges.length} users`);

  // ── 4. Teams & members ─────────────────────────────────────────────────────
  for (const team of f.teams) {
    await prisma.team.upsert({
      where:  { id: team.id },
      create: { id: team.id, name: team.name, eventId: f.event.id },
      update: { name: team.name },
    });

    for (const memberEmail of team.members) {
      // Create placeholder participant user if not already present
      let member = await prisma.user.findUnique({ where: { email: memberEmail } });
      if (!member) {
        member = await prisma.user.create({
          data: {
            email:        memberEmail,
            name:         memberEmail.split("@")[0],
            passwordHash: "seed-placeholder",
            role:         Role.PARTICIPANT,
          },
        });
      }

      await prisma.teamMember.upsert({
        where:  { teamId_userId: { teamId: team.id, userId: member.id } },
        create: { teamId: team.id, userId: member.id },
        update: {},
      });
    }
  }
  console.log(`[seed] teams   → ${f.teams.length} teams`);

  // ── 5. Projects ────────────────────────────────────────────────────────────
  // Note: prj_41 is a known duplicate submission from tm_07 — different ID,
  // same title/repo. We store it as-is; the unique key is the project ID.
  for (const project of f.projects) {
    await prisma.project.upsert({
      where:  { id: project.id },
      create: {
        id:          project.id,
        title:       project.title,
        summary:     project.summary,
        repoUrl:     project.repo_url,
        submittedAt: new Date(project.submitted_at),
        teamId:      project.team,
        trackId:     project.track,
        status:      "submitted",
      },
      update: {
        title:   project.title,
        summary: project.summary,
        repoUrl: project.repo_url,
      },
    });
  }
  console.log(`[seed] projects→ ${f.projects.length} records`);

  // ── 6. Rubric & Criteria ───────────────────────────────────────────────────
  const rubric = await prisma.rubric.upsert({
    where: { eventId: f.event.id },
    create: { eventId: f.event.id, name: "Default Event Rubric" },
    update: { name: "Default Event Rubric" },
  });

  const criteriaList = [
    { name: "functionality", description: "Does it work?", weight: 1, order: 1 },
    { name: "quality", description: "Is the code well-written?", weight: 1, order: 2 },
    { name: "innovation", description: "Is the idea novel?", weight: 1, order: 3 },
  ];

  const criterionLookup: Record<string, string> = {};
  for (const c of criteriaList) {
    const rc = await prisma.rubricCriterion.upsert({
      where: { rubricId_name: { rubricId: rubric.id, name: c.name } },
      create: {
        rubricId: rubric.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        order: c.order,
      },
      update: {
        description: c.description,
        weight: c.weight,
        order: c.order,
      },
    });
    criterionLookup[c.name] = rc.id;
  }
  console.log(`[seed] rubric  → 1 rubric, ${criteriaList.length} criteria`);

  // ── 7. Scores & Assignments ────────────────────────────────────────────────
  // Epoch timestamp explicitly signifies:
  // "fixture baseline imported without original judge submission timestamp metadata."
  const FIXTURE_IMPORT_METADATA_TIMESTAMP = new Date("1970-01-01T00:00:00.000Z");

  let scoreCount = 0;
  let assignmentCount = 0;
  let criterionScoreCount = 0;
  for (const score of f.scores) {
    const judgeUserId = judgeUserMap[score.judge];
    if (!judgeUserId) {
      console.warn(`[seed] unknown judge fixture ID "${score.judge}" — skipping`);
      continue;
    }

    // Implicitly, if a judge scored a project, they must have had an assignment
    const assignment = await prisma.judgeAssignment.upsert({
      where: { judgeId_projectId: { judgeId: judgeUserId, projectId: score.project } },
      create: {
        eventId: f.event.id,
        judgeId: judgeUserId,
        projectId: score.project,
        status: "COMPLETED",
        version: 1,
      },
      update: {
        status: "COMPLETED",
      },
    });
    assignmentCount++;

    const dbScore = await prisma.score.upsert({
      where:  { judgeId_projectId: { judgeId: judgeUserId, projectId: score.project } },
      create: {
        assignmentId: assignment.id,
        judgeId:   judgeUserId,
        projectId: score.project,
        rubricId:  rubric.id,
        comment:   score.comment ?? "",
        submittedAt: FIXTURE_IMPORT_METADATA_TIMESTAMP,
      },
      update: {
        assignmentId: assignment.id,
        rubricId:  rubric.id,
        comment:   score.comment ?? "",
        submittedAt: FIXTURE_IMPORT_METADATA_TIMESTAMP,
      },
    });
    scoreCount++;

    for (const [criterionName, val] of Object.entries(score.criteria)) {
      const criterionId = criterionLookup[criterionName];
      if (!criterionId) {
        throw new Error(`[seed] unknown criterion "${criterionName}" in fixture score`);
      }
      await prisma.scoreCriterion.upsert({
        where: {
          scoreId_criterionId: {
            scoreId: dbScore.id,
            criterionId,
          },
        },
        create: {
          scoreId: dbScore.id,
          criterionId,
          value: val,
        },
        update: {
          value: val,
        },
      });
      criterionScoreCount++;
    }
  }
  console.log(`[seed] assigns → ${assignmentCount} records`);
  console.log(`[seed] scores  → ${scoreCount} records (${criterionScoreCount} criteria)`);

  // ── 9. Static sessions (frozen by .dogfood.toml contract) ─────────────────
  const judgeAUserId = judgeUserMap[JUDGE_A_FIXTURE_ID];
  const judgeBUserId = judgeUserMap[JUDGE_B_FIXTURE_ID];

  if (!judgeAUserId) throw new Error(`judge_a fixture ID "${JUDGE_A_FIXTURE_ID}" not found`);
  if (!judgeBUserId) throw new Error(`judge_b fixture ID "${JUDGE_B_FIXTURE_ID}" not found`);

  await upsertSession(SESSIONS.organizer,   organizer.id);
  await upsertSession(SESSIONS.judge_a,     judgeAUserId);
  await upsertSession(SESSIONS.judge_b,     judgeBUserId);
  await upsertSession(SESSIONS.participant, participant.id);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("");
  console.log("seeded. test logins:");
  console.log(`  organizer    Cookie: session=${SESSIONS.organizer}`);
  console.log(`  judge_a      Cookie: session=${SESSIONS.judge_a}`);
  console.log(`  judge_b      Cookie: session=${SESSIONS.judge_b}`);
  console.log(`  participant  Cookie: session=${SESSIONS.participant}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error("[seed] FATAL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
