# ACTUAL ROUTE INVENTORY (T1-T2)

## `GET /health`
- **Authentication**: None
- **Required Role**: None
- **Resource Ownership Rule**: None
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: N/A
- **Response Shape**: `{"status":"ok"}`

## `POST /api/auth/login`
- **Authentication**: None
- **Required Role**: None
- **Resource Ownership Rule**: None
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 401 Unauthorized (invalid credentials)
- **Response Shape**: `{"success": true, "data": {"user": {"id": "...", "role": "..."}}}`

## `POST /api/auth/logout`
- **Authentication**: None
- **Required Role**: None
- **Resource Ownership Rule**: None
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: N/A
- **Response Shape**: `{"success": true}`

## `GET /api/auth/me`
- **Authentication**: Required (`requireAuth`)
- **Required Role**: None (Any authenticated user)
- **Resource Ownership Rule**: Returns self
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 401 Unauthorized (missing/invalid session)
- **Response Shape**: `{"success": true, "data": {"user": {"id": "...", "role": "..."}}}`

## `POST /api/teams`
- **Authentication**: Required
- **Required Role**: Participant (`TEAM_CREATE` permission implies role checking in policy)
- **Resource Ownership Rule**: N/A (creation)
- **Expected Success Status**: 201 Created
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true, "data": {"id": "...", ...}}`

## `POST /api/teams/invite`
- **Authentication**: Required
- **Required Role**: Participant
- **Resource Ownership Rule**: Requester must be the Team Lead (validated via resource authorizer)
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true, "data": {"inviteToken": "..."}}`

## `POST /api/teams/join`
- **Authentication**: Required
- **Required Role**: Participant
- **Resource Ownership Rule**: N/A (invite token handles logic)
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true}`

## `POST /api/projects`
- **Authentication**: Required
- **Required Role**: Participant
- **Resource Ownership Rule**: Requester must be part of the designated team (`PROJECT_CREATE` policy)
- **Expected Success Status**: 201 Created
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true, "data": {"id": "...", ...}}`

## `GET /api/projects/:id`
- **Authentication**: Required
- **Required Role**: Participant / Judge / Organizer
- **Resource Ownership Rule**: Authorizer checks if user can view project (team member, assigned judge, organizer, or public gallery viewer)
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true, "data": {"id": "...", ...}}`

## `PUT /api/projects/:id`
- **Authentication**: Required
- **Required Role**: Participant
- **Resource Ownership Rule**: Requester must be a team member of the project
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 403 Forbidden, 401 Unauthorized
- **Response Shape**: `{"success": true, "data": {"id": "...", ...}}`

## `POST /api/projects/:id/submit`
- **Authentication**: Required
- **Required Role**: Participant
- **Resource Ownership Rule**: Requester must be a team member of the project
- **Expected Success Status**: 200 OK
- **Expected Denial Status**: 403 Forbidden (or 400 for deadline closed)
- **Response Shape**: `{"success": true, "data": {"id": "...", "status": "SUBMITTED", ...}}`

*Note: No `judging`, `rubric`, or `assignments` REST routes are currently registered in Fastify. The domain abstractions and Prisma repositories exist internally but are not yet exposed.*
