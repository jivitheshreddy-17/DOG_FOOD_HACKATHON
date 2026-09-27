import { PrismaClient } from '@prisma/client';
import { PrismaRubricRepository } from '../infrastructure/database/repositories/prisma-rubric.repository';
import { PrismaJudgeAssignmentRepository } from '../infrastructure/database/repositories/prisma-judge-assignment.repository';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function runTests() {
  console.log('Starting Phase 2D-1 Judging Integration Tests...');
  const rubricRepo = new PrismaRubricRepository(prisma);
  const assignRepo = new PrismaJudgeAssignmentRepository(prisma);

  try {
    // 1. Get an existing event
    const event = await prisma.event.findFirst();
    if (!event) throw new Error('No event found in DB to test against');
    const eventId = event.id;

    // 2. Get an existing judge
    const judge = await prisma.user.findFirst({ where: { role: 'JUDGE' } });
    if (!judge) throw new Error('No judge found in DB');

    // 3. Get an existing project that this judge is NOT assigned to
    const project = await prisma.project.findFirst({
      where: { judgeAssignments: { none: { judgeId: judge.id } } }
    });
    if (!project) throw new Error('No unassigned project found in DB');

    // 4. Test Rubric retrieval (seeded)
    const seededRubric = await rubricRepo.findByEventId(eventId);
    if (!seededRubric) throw new Error('Seeded rubric not found');
    console.log('✅ Rubric retrieved successfully');

    // 5. Test Rubric update
    const updatedCriteria = [
      ...seededRubric.criteria.filter((c: any) => !c.name.startsWith('TestCriterion')),
      { id: randomUUID(), name: `TestCriterion-${Date.now()}`, weight: 5, order: 99, description: 'Added via test' }
    ];
    await rubricRepo.save({
      ...seededRubric,
      name: 'Updated Rubric Name',
      criteria: updatedCriteria,
    });
    
    const retrievedRubric = await rubricRepo.findById(seededRubric.id);
    if (!retrievedRubric || retrievedRubric.name !== 'Updated Rubric Name' || retrievedRubric.criteria.length !== 4) {
      throw new Error('Failed to update rubric or criteria length mismatch');
    }
    console.log('✅ Rubric updated successfully');

    // 6. Test Judge Assignment creation
    const assignId = randomUUID();
    await assignRepo.create({
      id: assignId,
      eventId: eventId,
      judgeId: judge.id,
      projectId: project.id,
      trackId: project.trackId,
      status: 'PENDING',
    });
    console.log('✅ Judge assignment created successfully');

    // 7. Test Assignment retrieval and update
    const retrievedAssign = await assignRepo.findById(assignId);
    if (!retrievedAssign || retrievedAssign.status !== 'PENDING') {
      throw new Error('Failed to retrieve assignment or wrong status');
    }

    await assignRepo.updateStatus(assignId, 'IN_PROGRESS');
    const updatedAssign = await assignRepo.findById(assignId);
    if (!updatedAssign || updatedAssign.status !== 'IN_PROGRESS') {
      throw new Error('Failed to update assignment status');
    }
    console.log('✅ Judge assignment updated successfully');

    // 8. Test Duplicate Assignment
    try {
      await assignRepo.create({
        id: randomUUID(),
        eventId: eventId,
        judgeId: judge.id,
        projectId: project.id,
        trackId: project.trackId,
        status: 'PENDING',
      });
      throw new Error('Should have failed to create duplicate assignment');
    } catch (e: any) {
      if (e.message.includes('Should have failed')) throw e;
      console.log('✅ Duplicate assignment correctly blocked by DB constraint');
    }

    // 9. Test Track Mismatch (Application level - DB allows it, so we document it)
    // Here we just test that the DB *does* allow it if not validated by application, 
    // confirming our documentation that DB cannot enforce it natively without triggers.
    const unassignedProject2 = await prisma.project.findFirst({ 
      where: { 
        id: { not: project.id }, 
        judgeAssignments: { none: { judgeId: judge.id } } 
      } 
    });
    if (!unassignedProject2) throw new Error('Could not find a second unassigned project');
    const realWrongTrack = await prisma.track.findFirst({ where: { id: { not: unassignedProject2.trackId ?? '' } } });
    const wrongTrackId = realWrongTrack ? realWrongTrack.id : unassignedProject2.trackId;
    const badAssignId = randomUUID();
    await assignRepo.create({
      id: badAssignId,
      eventId: eventId,
      judgeId: judge.id,
      projectId: unassignedProject2.id,
      trackId: wrongTrackId,
      status: 'PENDING',
    });
    console.log('✅ DB permits denormalized track mismatch (to be enforced by application layer)');
    await prisma.judgeAssignment.delete({ where: { id: badAssignId } });

    // 10. Test Assignment without score
    // The previous test (Step 6) created an assignment, updated to IN_PROGRESS, but no Score was inserted.
    // It works perfectly. Let's just assert that there is no score for it.
    const scoreForAssign = await prisma.score.findUnique({
      where: { judgeId_projectId: { judgeId: judge.id, projectId: project.id } }
    });
    if (scoreForAssign) {
      // It might exist from fixtures. Let's create an assignment for a project they haven't scored.
      const unscoredProject = await prisma.project.findFirst({
        where: {
          scores: { none: { judgeId: judge.id } }
        }
      });
      if (unscoredProject) {
        const unscoredAssignId = randomUUID();
        await assignRepo.create({
          id: unscoredAssignId,
          eventId,
          judgeId: judge.id,
          projectId: unscoredProject.id,
          status: 'PENDING'
        });
        const scoreCheck = await prisma.score.findUnique({
          where: { judgeId_projectId: { judgeId: judge.id, projectId: unscoredProject.id } }
        });
        if (scoreCheck) throw new Error('Score magically appeared');
        console.log('✅ Assignment authorization state works independent of Score existence');
        await prisma.judgeAssignment.delete({ where: { id: unscoredAssignId } });
      }
    } else {
      console.log('✅ Assignment authorization state works independent of Score existence');
    }

    // 11. Fixture Safety Verifications
    const projectCount = await prisma.project.count();
    const judgeCount = await prisma.user.count({ where: { role: 'JUDGE' } });
    const trackCount = await prisma.track.count();
    const scoreCount = await prisma.score.count();
    
    if (projectCount !== 41) throw new Error(`Project count mismatch: ${projectCount}`);
    if (judgeCount !== 30) throw new Error(`Judge count mismatch: ${judgeCount}`);
    if (trackCount !== 8) throw new Error(`Track count mismatch: ${trackCount}`);
    if (scoreCount !== 126) throw new Error(`Score count mismatch: ${scoreCount}`);
    console.log('✅ Fixture safety verified (41 projects, 30 judges, 8 tracks, 126 scores)');

    // 12. Cleanup test data
    await prisma.judgeAssignment.delete({ where: { id: assignId } });
    console.log('✅ Test data cleaned up successfully');

    console.log('Tests finished running without error.');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
