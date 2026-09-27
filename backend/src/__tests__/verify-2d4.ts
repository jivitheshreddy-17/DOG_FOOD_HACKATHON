import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

async function verify2d4() {
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log('  TIER 2 — 2D-4 VERIFICATION: LIVE JUDGING PROGRESS');
  console.log('──────────────────────────────────────────────────────────────────────');

  const { buildServer, prisma: sharedPrisma } = require('../index');
  const server: FastifyInstance = await buildServer();
  const prisma: PrismaClient = sharedPrisma;
  
  await server.ready();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ ${message}`);
      failed++;
    }
  }

  try {
    const prismaClient = prisma as PrismaClient;

    // We'll test against the known seeded event/users from module 1 fixtures
    // Judge 1: "jdg_a_91bc" -> hash: 003f801046b25e0fa45c09bbfadedd542d4ce121577825c1ea1f32a4d0d9c469 (User 'marek.nowak')
    // Participant: tokenHash: 2b8a9235e12... (User 'anna.kowalska')
    // Organizer: tokenHash: b5b8f44d5c0e18987ec856bc6936d50ffc17df3029f6b4cc58cde3e6e8e04b49 (User 'jan.kowalski')

    const JUDGE_A_COOKIE = 'session=jdg_a_91bc';
    const PARTICIPANT_COOKIE = 'session=prt_2e88';
    const ORGANIZER_COOKIE = 'session=org_7f2a';

    // ──────────────────────────────────────────────────────────────────────
    // 1. AUTH & ISOLATION
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────────────────────────────');
    console.log('  AUTH & ISOLATION TESTS');
    console.log('──────────────────────────────────────────────────────────────────────');

    const unauthRes = await server.inject({
      method: 'GET',
      url: '/api/judge/progress',
    });
    assert(unauthRes.statusCode === 401, 'Unauthenticated access returns 401');

    const participantRes = await server.inject({
      method: 'GET',
      url: '/api/judge/progress',
      headers: { cookie: PARTICIPANT_COOKIE },
    });
    assert(participantRes.statusCode === 403, 'Participant access returns 403');

    const judgeRes = await server.inject({
      method: 'GET',
      url: '/api/judge/progress',
      headers: { cookie: JUDGE_A_COOKIE },
    });
    assert(judgeRes.statusCode === 200, 'Judge access returns 200');
    
    const judgeData = judgeRes.json().data;
    assert(judgeData.byJudge === undefined, 'Judge does not see byJudge breakdown');
    assert(judgeData.total > 0, 'Judge sees their total assignments');
    assert(typeof judgeData.completionPercentage === 'number', 'completionPercentage is a number');

    const organizerRes = await server.inject({
      method: 'GET',
      url: '/api/judge/progress',
      headers: { cookie: ORGANIZER_COOKIE },
    });
    assert(organizerRes.statusCode === 200, 'Organizer access returns 200');
    const organizerData = organizerRes.json().data;
    assert(organizerData.byJudge !== undefined, 'Organizer sees byJudge breakdown');
    assert(organizerData.total >= judgeData.total, 'Organizer sees all assignments');

    // ──────────────────────────────────────────────────────────────────────
    // 2. STATE & MATH TESTS
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────────────────────────────');
    console.log('  STATE & MATH TESTS');
    console.log('──────────────────────────────────────────────────────────────────────');

    assert(
      organizerData.total === organizerData.pending + organizerData.inProgress + organizerData.completed,
      'Total equals pending + inProgress + completed'
    );
    
    const calculatedPercentage = organizerData.total === 0 ? 0 : Math.round((organizerData.completed / organizerData.total) * 100);
    assert(
      organizerData.completionPercentage === calculatedPercentage,
      'Percentage is mathematically correct and rounded'
    );
    assert(
      !Number.isNaN(organizerData.completionPercentage) && Number.isFinite(organizerData.completionPercentage),
      'Percentage is not NaN or Infinity'
    );

    // Track math
    if (Object.keys(organizerData.byTrack || {}).length > 0) {
      const trackId = Object.keys(organizerData.byTrack)[0];
      const track = organizerData.byTrack[trackId];
      const trackCalc = track.total === 0 ? 0 : Math.round((track.completed / track.total) * 100);
      assert(track.percentage === trackCalc, 'Track percentage is mathematically correct');
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. LIVE SEMANTICS (Draft -> In Progress -> Submit -> Completed)
    // ──────────────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────────────────────────────');
    console.log('  LIVE SEMANTICS TESTS');
    console.log('──────────────────────────────────────────────────────────────────────');

    // Find a pending assignment for Judge A
    const pendingAssignment = await prismaClient.judgeAssignment.findFirst({
      where: {
        judge: { email: 'marek.nowak@example.com' },
        status: 'PENDING',
      }
    });

    if (!pendingAssignment) {
      console.log('  ⚠️ No pending assignment found for Judge A, skipping live semantics test.');
    } else {
      const initialJudgeRes = await server.inject({
        method: 'GET',
        url: '/api/judge/progress',
        headers: { cookie: JUDGE_A_COOKIE },
      });
      const initialInProgress = initialJudgeRes.json().data.inProgress;
      const initialPending = initialJudgeRes.json().data.pending;
      const initialCompleted = initialJudgeRes.json().data.completed;

      // Make a DRAFT submission to move it to IN_PROGRESS
      const draftPayload = {
        status: 'DRAFT',
        scores: [
          { criterionId: 'dummy', value: 3 } // We might get a 404 for criterion, but let's actually fetch the rubric
        ]
      };

      const rubric = await prismaClient.rubric.findUnique({
        where: { eventId: pendingAssignment.eventId },
        include: { criteria: true }
      });

      if (rubric && rubric.criteria.length > 0) {
        draftPayload.scores[0].criterionId = rubric.criteria[0].id;
        
        const draftRes = await server.inject({
          method: 'POST',
          url: `/api/judge/assignments/${pendingAssignment.id}/scores`,
          headers: { cookie: JUDGE_A_COOKIE },
          payload: draftPayload,
        });
        
        assert(draftRes.statusCode === 202, 'Draft submission successful (202)');

        const midJudgeRes = await server.inject({
          method: 'GET',
          url: '/api/judge/progress',
          headers: { cookie: JUDGE_A_COOKIE },
        });
        const midData = midJudgeRes.json().data;
        assert(midData.inProgress === initialInProgress + 1, 'Draft changes PENDING to IN_PROGRESS');
        assert(midData.pending === initialPending - 1, 'Draft decrements PENDING count');

        // Now submit it!
        const submitPayload = {
          status: 'SUBMITTED',
          scores: rubric.criteria.map(c => ({ criterionId: c.id, value: 5 }))
        };

        const submitRes = await server.inject({
          method: 'POST',
          url: `/api/judge/assignments/${pendingAssignment.id}/scores`,
          headers: { cookie: JUDGE_A_COOKIE },
          payload: submitPayload,
        });

        assert(submitRes.statusCode === 200, 'Final submission successful (200)');

        const finalJudgeRes = await server.inject({
          method: 'GET',
          url: '/api/judge/progress',
          headers: { cookie: JUDGE_A_COOKIE },
        });
        const finalData = finalJudgeRes.json().data;
        assert(finalData.completed === initialCompleted + 1, 'Submit changes IN_PROGRESS to COMPLETED');
        assert(finalData.inProgress === midData.inProgress - 1, 'Submit decrements IN_PROGRESS count');
      } else {
         console.log('  ⚠️ No rubric criteria found, skipping live semantics.');
      }
    }


    console.log('\n──────────────────────────────────────────────────────────────────────');
    console.log('  SUMMARY');
    console.log('──────────────────────────────────────────────────────────────────────');
    console.log(`\nTests Passed: ${passed}`);
    console.log(`Tests Failed: ${failed}\n`);

    if (failed > 0) {
      console.error('❌ VERIFICATION FAILED');
      process.exit(1);
    } else {
      console.log('✅ ALL VERIFICATION TESTS PASSED');
    }

  } finally {
    if (server) await server.close();
    const { redis } = require('../index');
    if (redis) await redis.quit();
  }
}

verify2d4().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
