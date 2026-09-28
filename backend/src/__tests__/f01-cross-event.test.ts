import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import { randomUUID, createHash } from 'crypto';
import { prisma } from '../infrastructure/database/prisma.client';
import { buildServer } from '../index';

describe('F-01 Cross-Event Ownership Verification', () => {
  let app: any;
  let orgA_id = randomUUID(), orgB_id = randomUUID(), admin_id = randomUUID(), judge_id = randomUUID(), participant_id = randomUUID();
  let eventA_id = randomUUID(), eventB_id = randomUUID();
  let trackA_id = randomUUID(), trackB_id = randomUUID();
  let teamA_id = randomUUID(), teamB_id = randomUUID();
  let projectA_id = randomUUID(), projectB_id = randomUUID();
  let rubricA_id = randomUUID(), rubricB_id = randomUUID();
  let sessionA_id = randomUUID(), sessionB_id = randomUUID(), sessionAdmin_id = randomUUID(), sessionJudge_id = randomUUID(), sessionParticipant_id = randomUUID();
  let normRunA_id = randomUUID(), normRunB_id = randomUUID();

  before(async () => {
    app = await buildServer();
    
    await prisma.user.createMany({ data: [
      { id: orgA_id, email: `orga_${orgA_id}@test.com`, role: 'ORGANIZER', name: 'Org A', passwordHash: 'hash' },
      { id: orgB_id, email: `orgb_${orgB_id}@test.com`, role: 'ORGANIZER', name: 'Org B', passwordHash: 'hash' },
      { id: admin_id, email: `admin_${admin_id}@test.com`, role: 'ADMIN', name: 'Admin', passwordHash: 'hash' },
      { id: judge_id, email: `judge_${judge_id}@test.com`, role: 'JUDGE', name: 'Judge', passwordHash: 'hash' },
      { id: participant_id, email: `part_${participant_id}@test.com`, role: 'PARTICIPANT', name: 'Part', passwordHash: 'hash' }
    ]});
    
    await prisma.event.createMany({ data: [
      { id: eventA_id, name: 'Event A', votingMode: 'DISABLED', organizerId: orgA_id, submissionsClose: new Date() },
      { id: eventB_id, name: 'Event B', votingMode: 'DISABLED', organizerId: orgB_id, submissionsClose: new Date() }
    ]});

    await prisma.track.createMany({ data: [
      { id: trackA_id, name: 'Track A', eventId: eventA_id },
      { id: trackB_id, name: 'Track B', eventId: eventB_id }
    ]});

    await prisma.team.createMany({ data: [
      { id: teamA_id, name: 'Team A', eventId: eventA_id, inviteTokenHash: randomUUID() },
      { id: teamB_id, name: 'Team B', eventId: eventB_id, inviteTokenHash: randomUUID() }
    ]});

    await prisma.project.createMany({ data: [
      { id: projectA_id, title: 'Proj A', summary: 'A', repoUrl: 'A', submittedAt: new Date(), teamId: teamA_id, trackId: trackA_id, status: 'submitted' },
      { id: projectB_id, title: 'Proj B', summary: 'B', repoUrl: 'B', submittedAt: new Date(), teamId: teamB_id, trackId: trackB_id, status: 'submitted' }
    ]});

    await prisma.rubric.createMany({ data: [
      { id: rubricA_id, name: 'Rubric A', eventId: eventA_id },
      { id: rubricB_id, name: 'Rubric B', eventId: eventB_id }
    ]});

    await prisma.normalizationRun.createMany({ data: [
      { id: normRunA_id, eventId: eventA_id, rubricId: rubricA_id, rubricSnapshot: {}, inputSnapshot: {}, method: 'minmax', parameters: {}, diagnostics: {}, status: 'COMPLETED' },
      { id: normRunB_id, eventId: eventB_id, rubricId: rubricB_id, rubricSnapshot: {}, inputSnapshot: {}, method: 'minmax', parameters: {}, diagnostics: {}, status: 'COMPLETED' }
    ]});
    
    const hash = (t: string) => createHash('sha256').update(t).digest('hex');
    await prisma.session.createMany({ data: [
      { id: sessionA_id, userId: orgA_id, expiresAt: new Date(Date.now() + 100000), tokenHash: hash(sessionA_id) },
      { id: sessionB_id, userId: orgB_id, expiresAt: new Date(Date.now() + 100000), tokenHash: hash(sessionB_id) },
      { id: sessionAdmin_id, userId: admin_id, expiresAt: new Date(Date.now() + 100000), tokenHash: hash(sessionAdmin_id) },
      { id: sessionJudge_id, userId: judge_id, expiresAt: new Date(Date.now() + 100000), tokenHash: hash(sessionJudge_id) },
      { id: sessionParticipant_id, userId: participant_id, expiresAt: new Date(Date.now() + 100000), tokenHash: hash(sessionParticipant_id) }
    ]});
  });

  after(async () => {
    if (app) await app.close();
  });

  const check = async (method: string, url: string, sessionId: string, payload?: any) => {
    const res = await app.inject({ method: method as any, url, headers: { cookie: `session=${sessionId}` }, payload });
    return res.statusCode;
  };

  test('Matrix: Cross-Event', async () => {
    // 1-6
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventA_id}/config`, sessionA_id, { votingMode: 'DISABLED' }), 200, 'Org A -> Event A');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventB_id}/config`, sessionA_id, { votingMode: 'DISABLED' }), 403, 'Org A -> Event B');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventB_id}/config`, sessionB_id, { votingMode: 'DISABLED' }), 200, 'Org B -> Event B');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventA_id}/config`, sessionB_id, { votingMode: 'DISABLED' }), 403, 'Org B -> Event A');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventA_id}/config`, sessionAdmin_id, { votingMode: 'DISABLED' }), 200, 'Admin -> Event A');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventB_id}/config`, sessionAdmin_id, { votingMode: 'DISABLED' }), 200, 'Admin -> Event B');
  });

  test('Matrix: Resource Chaining', async () => {
    // 7. Organizer A cannot modify Event B rubric while claiming Event A
    assert.strictEqual(await check('PUT', `/api/judge/rubrics/${rubricB_id}`, sessionA_id, { eventId: eventA_id, name: 'Hacked', criteria: [] }), 403, 'Org A -> Rubric B (claim Event A)');
    
    // 8. Organizer A cannot create/update an assignment whose target resource belongs to Event B while claiming Event A.
    assert.strictEqual(await check('POST', `/api/judge/assignments`, sessionA_id, { eventId: eventA_id, judgeId: judge_id, projectId: projectB_id }), 403, 'Org A -> Assignment targeting Project B');

    // 9. Organizer A cannot operate on a normalization resource belonging to Event B while supplying Event A
    assert.strictEqual(await check('GET', `/api/normalization/runs/${normRunB_id}/export.csv`, sessionA_id), 403, 'Org A -> Norm Run B');

    // 10. Organizer A cannot export Event B
    assert.strictEqual(await check('GET', `/api/export.csv?eventId=${eventB_id}`, sessionA_id), 403, 'Org A -> Export Event B');

    // 11-12. Judge and Participant denied from management endpoints
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventA_id}/config`, sessionJudge_id, { votingMode: 'DISABLED' }), 403, 'Judge -> Event A config');
    assert.strictEqual(await check('PUT', `/api/voting/events/${eventA_id}/config`, sessionParticipant_id, { votingMode: 'DISABLED' }), 403, 'Participant -> Event A config');
  });
});
