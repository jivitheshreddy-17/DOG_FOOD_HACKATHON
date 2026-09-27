import { PrismaClient } from '@prisma/client';
import { buildServer } from './src/index';

const prisma = new PrismaClient();

async function runTests() {
  const app = await buildServer();
  await app.ready();

  console.log('Starting 2D-6 HTTP Integration Tests...');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // Find users for test
  const organizer = await prisma.user.findFirst({ where: { role: 'ORGANIZER' } });
  const judges = await prisma.user.findMany({ where: { role: 'JUDGE' }, take: 2 });
  const participant = await prisma.user.findFirst({ where: { role: 'PARTICIPANT' } });
  const event = await prisma.event.findFirst();
  const project = await prisma.project.findFirst({ include: { track: true } });

  if (!organizer || judges.length < 2 || !participant || !event || !project) {
    console.error('Missing fixtures. Ensure db:seed is run.');
    process.exit(1);
  }

  const judgeA = judges[0];
  const judgeB = judges[1];

  async function request(sessionToken: string, method: 'GET'|'POST'|'PUT', url: string, body?: any) {
    return app.inject({
      method,
      url,
      payload: body,
      headers: { cookie: `session=${sessionToken}` }
    });
  }

  async function requestUnauth(method: 'GET'|'POST'|'PUT', url: string, body?: any) {
    return app.inject({
      method,
      url,
      payload: body,
    });
  }

  const orgSession = await prisma.session.findFirst({ where: { userId: organizer.id } });
  const pSession = await prisma.session.findFirst({ where: { userId: participant.id } });
  const jASession = await prisma.session.findFirst({ where: { userId: judgeA.id } });
  const jBSession = await prisma.session.findFirst({ where: { userId: judgeB.id } });

  if (!orgSession || !pSession || !jASession || !jBSession) {
      // In this setup, sessions might be raw token or hashes.
      // Usually the verify-2d2-http.ts just hardcoded cookie names like 'session=org_7f2a'
      console.error('Could not find existing sessions in DB. Trying fallback tokens.');
  }

  const tokenOrg = 'org_7f2a';
  const tokenJudgeA = 'jdg_a_91bc';
  const tokenJudgeB = 'jdg_b_44de';
  const tokenPrt = 'prt_2e88';

  // --- RUBRIC TESTS ---
  console.log('\n--- RUBRIC TESTS ---');
  
  // unauthenticated cannot create rubric
  let res = await requestUnauth('POST', '/api/judge/rubrics', { eventId: event.id, name: 'Test', criteria: [{name: 'C1', weight: 1, order: 1}] });
  assert(res.statusCode === 401, 'Unauthenticated cannot create rubric (401)');

  // judge cannot create rubric
  res = await request(tokenJudgeA, 'POST', '/api/judge/rubrics', { eventId: event.id, name: 'Test', criteria: [{name: 'C1', weight: 1, order: 1}] });
  assert(res.statusCode === 403, 'Judge cannot create rubric (403)');

  // participant cannot create rubric
  res = await request(tokenPrt, 'POST', '/api/judge/rubrics', { eventId: event.id, name: 'Test', criteria: [{name: 'C1', weight: 1, order: 1}] });
  assert(res.statusCode === 403, 'Participant cannot create rubric (403)');

  // organizer creates rubric (We need an event without a rubric to test create, or update the existing one)
  // Our event already has one, so we should get 409
  res = await request(tokenOrg, 'POST', '/api/judge/rubrics', { eventId: event.id, name: 'Test', criteria: [{name: 'C1', weight: 1, order: 1}] });
  assert(res.statusCode === 409, 'Organizer creating rubric for event that already has one gets 409 (existing)');

  const existingRubric = await prisma.rubric.findFirst({ where: { eventId: event.id } });
  
  // organizer reads rubric
  res = await request(tokenOrg, 'GET', `/api/judge/rubrics/${existingRubric!.id}`);
  assert(res.statusCode === 200, 'Organizer reads rubric');

  // rubric mutation after judging starts is rejected
  res = await request(tokenOrg, 'PUT', `/api/judge/rubrics/${existingRubric!.id}`, { eventId: event.id, name: 'Updated', criteria: [{name: 'C1', weight: 1, order: 1}] });
  assert(res.statusCode === 409, 'Rubric mutation after judging starts is rejected (409 Conflict)');


  // --- ASSIGNMENTS TESTS ---
  console.log('\n--- ASSIGNMENT TESTS ---');

  // participant cannot create assignment
  res = await request(tokenPrt, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeA.id, projectId: project.id });
  assert(res.statusCode === 403, 'Participant cannot create assignment (403)');

  // judge cannot create assignment
  res = await request(tokenJudgeA, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeA.id, projectId: project.id });
  assert(res.statusCode === 403, 'Judge cannot create assignment (403)');

  // find an unassigned project for Judge A
  const newProject = await prisma.project.findFirst({
      where: { judgeAssignments: { none: { judgeId: judgeA.id } } }
  });

  // organizer creates assignment
  res = await request(tokenOrg, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeA.id, projectId: newProject!.id });
  assert(res.statusCode === 201, 'Organizer creates assignment');
  const assignmentId = res.json().data.id;

  // duplicate assignment rejected
  res = await request(tokenOrg, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeA.id, projectId: newProject!.id });
  assert(res.statusCode === 409, 'Duplicate assignment rejected (409)');

  // organizer lists assignments
  res = await request(tokenOrg, 'GET', `/api/judge/assignments?eventId=${event.id}`);
  assert(res.statusCode === 200 && res.json().data.length > 0, 'Organizer lists assignments');

  // organizer reads assignment
  res = await request(tokenOrg, 'GET', `/api/judge/assignments/${assignmentId}`);
  assert(res.statusCode === 200, 'Organizer reads assignment');

  // invalid judge rejected
  res = await request(tokenOrg, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: participant.id, projectId: newProject!.id });
  assert(res.statusCode === 409, 'Invalid judge rejected (user is not JUDGE)');

  // invalid project rejected
  res = await request(tokenOrg, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeA.id, projectId: 'invalid-id' });
  assert(res.statusCode === 404, 'Invalid project rejected');


  // --- SECURITY TESTS ---
  console.log('\n--- SECURITY TESTS ---');

  // Judge A cannot access Judge B assignment
  // Let's create an assignment for Judge B
  const bProj = await prisma.project.findFirst({
      where: { judgeAssignments: { none: { judgeId: judgeB.id } } }
  });
  let bRes = await request(tokenOrg, 'POST', '/api/judge/assignments', { eventId: event.id, judgeId: judgeB.id, projectId: bProj!.id });
  let bAssignmentId = bRes.json().data.id;

  res = await request(tokenJudgeA, 'GET', `/api/judge/assignments/${bAssignmentId}`);
  assert(res.statusCode === 403, 'Judge A cannot access Judge B assignment (403)');

  // participant blocked
  res = await request(tokenPrt, 'GET', `/api/judge/assignments/${assignmentId}`);
  assert(res.statusCode === 403, 'Participant blocked from viewing assignment (403)');


  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
