-- T2-2D2 Fixture and Schema Verification Queries

-- D. FIXTURE COUNTS
SELECT 'D1: Score count (expect 126)' AS check_name, COUNT(*)::text AS value FROM scores;
SELECT 'D2: ScoreCriterion count (expect 378)' AS check_name, COUNT(*)::text AS value FROM score_criteria;
SELECT 'D3: Scores-with-not-3-criteria (expect 0)' AS check_name, COUNT(*)::text AS value FROM (
  SELECT s.id FROM scores s
  LEFT JOIN score_criteria sc ON sc."scoreId" = s.id
  WHERE s."submittedAt" = '1970-01-01 00:00:00+00'
  GROUP BY s.id
  HAVING COUNT(sc.id) != 3
) t;
SELECT 'D4: Non-epoch historical submittedAt (expect 0)' AS check_name, COUNT(*)::text AS value FROM scores
  WHERE "submittedAt" IS NOT NULL AND "submittedAt" != '1970-01-01 00:00:00+00';
SELECT 'D5: Criterion names deterministic' AS check_name,
  string_agg(name, ',' ORDER BY name) AS value FROM rubric_criteria;
SELECT 'D6: COMPLETED assignments (expect 126)' AS check_name, COUNT(*)::text AS value FROM judge_assignments WHERE status = 'COMPLETED';

-- C. SCHEMA: Detailed FK rules
SELECT 'C-FK: ' || kcu.column_name || ' delete_rule=' || rc.delete_rule AS check_name, 'INFO' AS value
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
WHERE tc.table_name IN ('scores', 'score_criteria')
ORDER BY tc.table_name, kcu.column_name;

-- C-CHECK: value constraint text
SELECT 'C-CHECK: ' || pg_get_constraintdef(oid) AS check_name, 'INFO' AS value
FROM pg_constraint
WHERE conrelid = 'score_criteria'::regclass AND contype = 'c';

-- C-UNIQUE: Score.assignmentId unique
SELECT 'C-UNIQUE: ' || indexname AS check_name, 'INFO' AS value
FROM pg_indexes WHERE tablename = 'scores' AND indexdef ILIKE '%unique%';

-- C-UNIQUE: ScoreCriterion
SELECT 'C-UNIQUE-SC: ' || indexname AS check_name, 'INFO' AS value
FROM pg_indexes WHERE tablename = 'score_criteria' AND indexdef ILIKE '%unique%';

-- L. NORMALIZATION BOUNDARY: sample finalized observation row
SELECT 'L1: Normalization fields sample' AS check_name,
  s.id AS "scoreId",
  s."judgeId",
  s."projectId",
  sc."criterionId",
  sc.value,
  s."rubricId",
  s."assignmentId",
  s."submittedAt"::text AS "submittedAt"
FROM scores s
JOIN score_criteria sc ON sc."scoreId" = s.id
WHERE s."submittedAt" IS NOT NULL
LIMIT 1;

-- K. DELETION SAFETY: try to delete a judgeAssignment with a score (should fail with FK error)
-- (We just verify the FK exists; actual deletion test done via service)
SELECT 'K: FK Score->Assignment' AS check_name,
  rc.delete_rule AS value
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'scores' AND rc.constraint_name ILIKE '%assignment%';

SELECT 'K: FK Score->Rubric' AS check_name,
  rc.delete_rule AS value
FROM information_schema.referential_constraints rc
JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'scores' AND rc.constraint_name ILIKE '%rubric%';
