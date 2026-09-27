# Judging Guide

## Overview
The judging subsystem allows organizers to define structured rubrics, assign projects to judges, and securely collect evaluation data.

## Process Flow
1. **Rubric Setup**: Organizers (`ORGANIZER`, `ADMIN`) define a `Rubric` comprising multiple weighted criteria (e.g. Design, Technical, Originality).
   - *Constraint*: Rubrics are frozen once judging begins.
2. **Assignment Configuration**: Organizers assign specific `User` (role = `JUDGE`) to evaluate specific `Project`.
   - *Output*: A `JudgeAssignment` (status = `PENDING`).
3. **Execution**: Judges submit assessments.
   - Drafts: Can save incrementally (status transitions to `IN_PROGRESS`).
   - Final Submission: Locks the score (status transitions to `COMPLETED`).
4. **Monitoring**: Organizers/Judges query `/api/judge/progress` to view assignment completion rates.

## Resource Isolation
Judging data is strictly isolated to prevent bias and ensure privacy:
- A Judge cannot access another Judge's assignments or scores.
- A Participant cannot access any assignments or scores.
- Global aggregate data and diagnostic information are hidden from Judges.
- Only Organizers have full visibility into assignment distribution.

## Normalization (Layer 2)
To handle discrepancies in judge severity (some judges grade universally harsher/lighter), the system employs mathematical normalization (shrinkage estimators and partial proportionality mapping).
- Disconnected judge/project graphs are correctly handled.
- Normalized scores are stored securely and exposed only where authorized.
