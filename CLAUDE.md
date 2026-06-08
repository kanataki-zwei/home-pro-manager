# Claude Instructions — Home Pro Manager

**Always read `CONTEXT.md` before writing any code or making any decisions.**
It contains architectural decisions, resolved bugs, and constraints that are
not visible from the code alone. Acting without it risks undoing deliberate choices.

---

## Project Layout

```
home-pro-manager/
├── backend/          # FastAPI, Python, SQLAlchemy async, Alembic
│   ├── app/
│   │   ├── core/     # config.py, database.py, auth.py
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── routers/  # FastAPI route handlers
│   │   └── schemas/  # Pydantic request/response schemas
│   ├── alembic/      # Migrations (env.py, versions/)
│   ├── venv/         # Python virtual environment
│   ├── .env          # Backend secrets (never commit)
│   └── main.py       # App entry point + lifespan hook
└── frontend/         # Next.js 14 App Router, TypeScript, shadcn/ui
    ├── src/
    │   ├── app/
    │   │   ├── (app)/    # Authenticated routes: dashboard, household, budget
    │   │   └── auth/     # Public routes: login, signup
    │   ├── components/
    │   ├── context/
    │   └── lib/          # api.ts, supabase.ts, auth.ts
    └── .env.local        # Frontend secrets (never commit)
```

---

## Running the App

**Backend** (from `backend/` directory):
```powershell
.\venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8002 --reload
```

**Frontend** (from `frontend/` directory):
```powershell
npm run dev
```

**Migrations** (from `backend/` directory):
```powershell
.\venv\Scripts\alembic.exe upgrade head
```

---

## Critical Patterns

### Async — never block the event loop
The backend is fully async (FastAPI + asyncpg). Any synchronous I/O **must** run in a thread:

```python
# Supabase Python client is synchronous
result = await asyncio.to_thread(supabase.auth.admin.some_method, args)

# PyJWKClient is synchronous
signing_key = await loop.run_in_executor(None, lambda: _jwks_client.get_signing_key_from_jwt(token))
```

Blocking the event loop on the first request causes the browser to time out before CORS
headers are sent — which Chrome reports as a CORS error, masking the real cause.

### JWT Verification
New Supabase projects use **ES256** (asymmetric), not HS256. Verification uses
`PyJWKClient` pointed at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
See `backend/app/core/auth.py`.

### DATABASE_URL
Uses the **transaction pooler** (port 6543, `aws-0-eu-west-1.pooler.supabase.com`),
not the direct connection. The asyncpg engine requires:
```python
connect_args={"prepared_statement_cache_size": 0}
```
Special characters in the password (`@`) must be URL-encoded (`%40`).
The `alembic/env.py` reads `DATABASE_URL` directly from the environment — do not
pass it through `config.set_main_option()`, which breaks on `%` characters.

### Alembic Migration Chain
```
b1c2d3e4f5a6_initial_schema.py   ← root (down_revision = None)
        ↓
a0857efd3031_add_budget_module.py
```
When adding a new migration, set `down_revision` to `a0857efd3031`.

### Frontend API Calls
All authenticated calls go through `src/lib/api.ts` (`apiGet`, `apiPost`, `apiPatch`,
`apiDelete`), which automatically attaches the Supabase session token as a Bearer header.
Signup calls `POST /api/users/` on the backend — it does **not** call Supabase directly.

### Startup Pre-warm
`backend/main.py` has a `lifespan` hook that pre-warms both the JWKS client and the
Supabase admin client at startup, so cold-start blocking never hits a real request.

---

## Environment Variables

**Backend (`backend/.env`)**:
```
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
SUPABASE_JWT_SECRET=<jwt_secret>   # kept in config but not used for verification
DEBUG=True
```

**Frontend (`frontend/.env.local`)**:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
NEXT_PUBLIC_API_URL=http://127.0.0.1:8002
```

---

## What Not To Do

- Do not call `supabase.auth.signUp()` from the frontend — signup goes through `POST /api/users/`
- Do not use `config.set_main_option("sqlalchemy.url", ...)` in alembic env.py
- Do not add `drop_constraint` calls in migrations for FK constraints that don't exist in the schema
- Do not use the direct Supabase connection string (port 5432, `db.<ref>.supabase.co`) — it may be IPv6-only
- Do not call synchronous I/O directly inside `async def` route handlers
