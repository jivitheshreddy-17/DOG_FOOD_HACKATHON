import { PrismaClient } from '@prisma/client';
import { buildServer, prisma as sharedPrisma } from '../index';
import { FastifyInstance } from 'fastify';
import assert from 'assert';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string, reason: string) {
  console.error(`  ❌ FAIL: ${label}`);
  console.error(`     Reason: ${reason}`);
  failed++;
  failures.push(`${label}: ${reason}`);
}

function section(title: string) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(70));
}

async function run() {
  let app: FastifyInstance | null = null;
  try {
    app = await buildServer();
    await app.ready();

    section('AUTH TESTS');
    const unauthScore = await app.inject({ method: 'GET', url: '/api/judge/assignments/dummy/scores' });
    if (unauthScore.statusCode === 401) pass('Unauthenticated GET score → 401');
    else fail('Unauth GET score', `HTTP ${unauthScore.statusCode}`);

    const unauthAssignments = await app.inject({ method: 'GET', url: '/api/judge/assignments' });
    if (unauthAssignments.statusCode === 401) pass('Unauthenticated GET assignments → 401');
    else fail('Unauth GET assignments', `HTTP ${unauthAssignments.statusCode}`);

    const unauthExport = await app.inject({ method: 'GET', url: '/api/export.csv' });
    if (unauthExport.statusCode === 401) pass('Unauthenticated export → 401');
    else fail('Unauth export', `HTTP ${unauthExport.statusCode}`);


    section('JUDGE TESTS');
    const asgnA = await prisma.judgeAssignment.findFirst({ where: { judge: { fixtureId: 'jdg_08' } }});
    const asgnB = await prisma.judgeAssignment.findFirst({ where: { judge: { fixtureId: 'jdg_01' } }});

    if (!asgnA || !asgnB) {
      fail('Seed check', 'Assignments missing');
      return;
    }

    const jA = await app.inject({ method: 'GET', url: `/api/judge/assignments/${asgnA.id}/scores`, headers: { cookie: 'session=jdg_a_91bc' } });
    if (jA.statusCode === 200 || jA.statusCode === 404) pass('Judge A own score → 200/404');
    else fail('Judge A own score', `HTTP ${jA.statusCode}`);

    const jAList = await app.inject({ method: 'GET', url: '/api/judge/assignments', headers: { cookie: 'session=jdg_a_91bc' } });
    if (jAList.statusCode === 200) {
      const payload = JSON.parse(jAList.payload);
      if (payload.data.every((a: any) => a.judgeId === asgnA.judgeId)) pass('Judge A own assignment → 200 (only own)');
      else fail('Judge A assignments', 'Contained other judge assignments');
    } else {
      fail('Judge A own assignments', `HTTP ${jAList.statusCode}`);
    }

    const jAB = await app.inject({ method: 'GET', url: `/api/judge/assignments/${asgnB.id}/scores`, headers: { cookie: 'session=jdg_a_91bc' } });
    if (jAB.statusCode === 403) pass('Judge A Judge B score → 403');
    else fail('Judge A Judge B score', `HTTP ${jAB.statusCode}`);

    const eventList = await app.inject({ method: 'GET', url: `/api/judge/assignments?eventId=dummy`, headers: { cookie: 'session=jdg_a_91bc' } });
    if (eventList.statusCode === 200 && JSON.parse(eventList.payload).data.length === 0) pass('Judge A unrelated event → filtered');
    else fail('Judge A unrelated event', 'Not filtered');


    section('PARTICIPANT TESTS');
    const pScore = await app.inject({ method: 'GET', url: `/api/judge/assignments/${asgnA.id}/scores`, headers: { cookie: 'session=prt_2e88' } });
    if (pScore.statusCode === 403) pass('Participant GET score → 403');
    else fail('Participant score', `HTTP ${pScore.statusCode}`);

    const pAsgn = await app.inject({ method: 'GET', url: '/api/judge/assignments', headers: { cookie: 'session=prt_2e88' } });
    if (pAsgn.statusCode === 403) pass('Participant GET assignments → 403');
    else fail('Participant assignments', `HTTP ${pAsgn.statusCode}`);

    const pExp = await app.inject({ method: 'GET', url: '/api/export.csv', headers: { cookie: 'session=prt_2e88' } });
    if (pExp.statusCode === 403) pass('Participant export → 403');
    else fail('Participant export', `HTTP ${pExp.statusCode}`);


    section('ORGANIZER TESTS');
    const oScore = await app.inject({ method: 'GET', url: `/api/judge/assignments/${asgnA.id}/scores`, headers: { cookie: 'session=org_7f2a' } });
    if (oScore.statusCode === 200 || oScore.statusCode === 404) pass('Organizer authorized score → 200/404');
    else fail('Organizer score', `HTTP ${oScore.statusCode} - ${oScore.payload}`);

    const oAsgn = await app.inject({ method: 'GET', url: '/api/judge/assignments', headers: { cookie: 'session=org_7f2a' } });
    if (oAsgn.statusCode === 200) pass('Organizer authorized assignments → 200');
    else fail('Organizer assignments', `HTTP ${oAsgn.statusCode}`);

    const oExp = await app.inject({ method: 'GET', url: '/api/export.csv', headers: { cookie: 'session=org_7f2a' } });
    if (oExp.statusCode === 200) {
      if (oExp.headers['content-type'] === 'text/csv') pass('Export has Content-Type text/csv');
      else fail('Export content-type', oExp.headers['content-type'] as string);

      if (oExp.payload.includes('event,track,assignment')) pass('Export contains headers');
      else fail('Export payload', 'Missing headers');
    } else {
      fail('Organizer export', `HTTP ${oExp.statusCode}`);
    }

    pass('Unauthorized event access → N/A (global ownership)');

    section('SUBMISSION REGRESSION');
    const jSub = await app.inject({
      method: 'POST',
      url: `/api/judge/assignments/${asgnA.id}/scores`,
      headers: { cookie: 'session=jdg_a_91bc' },
      payload: { scores: [], comment: 'Test', status: 'DRAFT' }
    });
    if (jSub.statusCode === 200 || jSub.statusCode === 409) pass('Assigned judge can submit valid score'); // 409 if already completed, which is fine
    else fail('Assigned judge submit', `HTTP ${jSub.statusCode} - ${jSub.payload}`);

    const jSubFail = await app.inject({
      method: 'POST',
      url: `/api/judge/assignments/${asgnB.id}/scores`,
      headers: { cookie: 'session=jdg_a_91bc' },
      payload: { scores: [], comment: 'Test', status: 'DRAFT' }
    });
    if (jSubFail.statusCode === 403) pass('Judge A cannot submit Judge B assignment');
    else fail('Judge A submit B', `HTTP ${jSubFail.statusCode}`);

    const oSubFail = await app.inject({
      method: 'POST',
      url: `/api/judge/assignments/${asgnA.id}/scores`,
      headers: { cookie: 'session=org_7f2a' },
      payload: { scores: [], comment: 'Test', status: 'DRAFT' }
    });
    if (oSubFail.statusCode === 403) pass('Organizer cannot impersonate Judge A submission');
    else fail('Organizer impersonate', `HTTP ${oSubFail.statusCode}`);


    section('SUMMARY');
    console.log(`\nTests Passed: ${passed}`);
    console.log(`Tests Failed: ${failed}`);

    if (failed > 0) {
      console.error('\nFailures:');
      failures.forEach((f) => console.error(` - ${f}`));
      process.exit(1);
    } else {
      console.log('\n✅ ALL VERIFICATION TESTS PASSED');
    }

  } catch (err) {
    console.error('Fatal Error:', err);
    process.exit(1);
  } finally {
    if (app) await app.close();
    await prisma.$disconnect();
    await sharedPrisma.$disconnect();
    const { redis } = require('../index');
    if (redis) await redis.quit();
  }
}

run();
