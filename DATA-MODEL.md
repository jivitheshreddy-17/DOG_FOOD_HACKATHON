# Data Model

This repository implements the Tier 1 & Tier 2 Hackathon Management schema via Prisma + PostgreSQL.

## Core Entities
- **User**: Represents participants, judges, organizers, and admins.
- **Session**: Manages authentication tokens.
- **Event**: The core hackathon instance.
- **Track**: Categorizations of projects within an event.
- **Team**: A group of participants working together.
- **Project**: A team's submitted artifact for evaluation.

## Judging Entities
- **Rubric**: The scoring guide for an event, composed of multiple `RubricCriterion`.
- **RubricCriterion**: Specific dimensions evaluated (e.g. Design, Code, Presentation) with defined `weight` and `order`.
- **JudgeAssignment**: Links a Judge (`User`) to a `Project`. Source of truth for evaluation progress (`PENDING`, `IN_PROGRESS`, `COMPLETED`).
- **Score**: Represents a judge's assessment for a specific assignment against a specific rubric. Supports draft states (`submittedAt = null`).
- **ScoreCriterion**: The individual granular score values for each `RubricCriterion`.

## State & Lifecycle
1. `JudgeAssignment` is initially `PENDING`.
2. Saving a draft `Score` moves the assignment to `IN_PROGRESS`.
3. Submitting a final `Score` moves the assignment to `COMPLETED` and sets `Score.submittedAt`.

## Immutability & Concurrency
- `JudgeAssignment` uses an Optimistic Concurrency Control (OCC) `version` field to prevent simultaneous completion overwrites.
- Re-scoring or editing a `COMPLETED` assignment is blocked at the Service Layer.
