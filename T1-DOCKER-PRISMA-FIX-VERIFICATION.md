# MODULE-1_T1 Docker Prisma/OpenSSL Fix Verification

## 1. Root Cause
The backend Docker image uses `node:20-alpine` (Alpine Linux v3.23). By default, minimal Alpine base images do not include the `openssl` CLI package (`/usr/bin/openssl`).

When Prisma CLI and engines (`prisma` and `@prisma/client` v5.14.0) initialize, Prisma attempts to detect the installed OpenSSL/libssl version by querying the environment/binary. Because the `openssl` binary was absent in both the `builder` and `runner` stages:
1. Prisma printed the warning:
   `prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected. Defaulting to "openssl-1.1.x". Please manually install OpenSSL and try installing Prisma again.`
2. Prisma fell back to the `openssl-1.1.x` target engine (`schema-engine-linux-musl` / `libquery_engine-linux-musl`).
3. Modern Alpine Linux provides OpenSSL 3.x libraries (`libssl.so.3`, `libcrypto.so.3`) rather than legacy OpenSSL 1.1 (`libssl.so.1.1`).
4. At container startup, `npx prisma db push` failed to execute the schema engine due to unresolved OpenSSL 1.1 symbols (`SSL_state_string_long: symbol not found`, etc.).
5. The non-JSON error output from the crashed engine process caused the fatal parsing error:
   `Error: Could not parse schema engine response: SyntaxError: Unexpected token 'E', "Error load"... is not valid JSON`
6. The container entered a crash-restart loop and never passed its health check.

## 2. Exact File Changed
- [MODULE-1_T1/backend/Dockerfile](file:///C:/Users/jivit/Desktop/DOG_FOOD/MODULE-1_T1/backend/Dockerfile)

## 3. Exact Minimal Fix
Installed `openssl` via `apk add --no-cache openssl` in the `builder` stage and added `openssl` alongside `wget` in the `runner` stage:

```diff
--- a/backend/Dockerfile
+++ b/backend/Dockerfile
@@ -8,6 +8,9 @@
 
 WORKDIR /app
 
+# Install OpenSSL for Prisma engine compatibility
+RUN apk add --no-cache openssl
+
 # Copy package manifests first for layer caching
 COPY backend/package*.json ./
 
@@ -27,8 +27,8 @@
 
 WORKDIR /app
 
-# wget is used by the health check
-RUN apk add --no-cache wget
+# wget is used by the health check, openssl is required for Prisma engines
+RUN apk add --no-cache openssl wget
 
 ENV NODE_ENV=production
```

## 4. Verification Commands Executed
```bash
cd C:\Users\jivit\Desktop\DOG_FOOD\MODULE-1_T1

docker compose build --no-cache backend
docker compose up -d

docker compose ps
docker compose logs backend --tail=100
```

## 5. Resulting Container Health & Logs
### Container Status (`docker compose ps`):
```text
NAME                     IMAGE                  COMMAND                  SERVICE    STATUS                        PORTS
module-1_t1-backend-1    module-1_t1-backend    "docker-entrypoint.s…"   backend    Up About a minute (healthy)   3001/tcp
module-1_t1-frontend-1   module-1_t1-frontend   "docker-entrypoint.s…"   frontend   Up 56 seconds                 0.0.0.0:8080->3000/tcp
module-1_t1-postgres-1   postgres:16-alpine     "docker-entrypoint.s…"   postgres   Up 9 minutes (healthy)        5432/tcp
module-1_t1-redis-1      redis:7-alpine         "docker-entrypoint.s…"   redis      Up 9 minutes (healthy)        6379/tcp
```

### Backend Startup Logs (`docker compose logs backend --tail=100`):
```text
backend-1  | Prisma schema loaded from prisma/schema.prisma
backend-1  | Datasource "db": PostgreSQL database "dogfood", schema "public" at "postgres:5432"
backend-1  | 
backend-1  | 🚀  Your database is now in sync with your Prisma schema. Done in 346ms
backend-1  | 
backend-1  | Running generate... (Use --skip-generate to skip the generators)
backend-1  | Running generate... - Prisma Client
backend-1  | ✔ Generated Prisma Client (v5.22.0) to ./node_modules/@prisma/client in 260ms
backend-1  | 
backend-1  | [seed] loaded fixtures from /app/fixtures.json
backend-1  | [seed] event   → evt_01 "Sample Hack 2026"
backend-1  | [seed] tracks  → 8 records
backend-1  | [seed] judges  → 30 users
backend-1  | [seed] teams   → 40 teams
backend-1  | [seed] projects→ 41 records
backend-1  | [seed] scores  → 126 records
backend-1  | 
backend-1  | seeded. test logins:
backend-1  |   organizer    Cookie: session=org_7f2a
backend-1  |   judge_a      Cookie: session=jdg_a_91bc
backend-1  |   judge_b      Cookie: session=jdg_b_44de
backend-1  |   participant  Cookie: session=prt_2e88
backend-1  | 
backend-1  | {"level":30,"time":1790427846632,"pid":1,"hostname":"996d496a2362","msg":"Server listening at http://0.0.0.0:3001"}
backend-1  | [backend] listening on port 3001
backend-1  | {"level":30,"time":1790427851464,"pid":1,"hostname":"996d496a2362","reqId":"req-1","req":{"method":"GET","url":"/health","hostname":"localhost:3001","remoteAddress":"127.0.0.1","remotePort":40908},"msg":"incoming request"}
backend-1  | {"level":30,"time":1790427851554,"pid":1,"hostname":"996d496a2362","reqId":"req-1","res":{"statusCode":200},"responseTime":88.38293199997861,"msg":"request completed"}
```

- OpenSSL/libssl warnings eliminated completely.
- Prisma schema engine JSON parsing errors eliminated completely.
- Schema push and database seeding succeeded cleanly.
- Health checks return HTTP 200 and backend is `healthy`.

## 6. Confirmation of Untouched Files
- `prisma/schema.prisma` was **NOT modified**.
- `prisma/seed.ts` was **NOT modified**.
- `.dogfood.toml` was **NOT modified**.
- `docker-compose.yml` was **NOT modified**.
- Application source code was **NOT modified**.
- Database models and migrations were **NOT modified**.
- Frontend code was **NOT modified**.
