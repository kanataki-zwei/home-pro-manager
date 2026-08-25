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
│   │   ├── core/     # config.py, database.py, auth.py, security.py
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── routers/  # FastAPI route handlers (auth.py, users.py, households.py, budget.py)
│   │   └── schemas/  # Pydantic request/response schemas
│   ├── alembic/      # Migrations (env.py, versions/)
│   ├── venv/         # Python virtual environment
│   ├── .env          # Backend secrets (never commit)
│   └── main.py       # App entry point + lifespan hook
└── frontend/         # Next.js 16 App Router, TypeScript, shadcn/ui
    ├── src/
    │   ├── app/
    │   │   ├── (app)/    # Authenticated routes: dashboard, household, budget
    │   │   └── auth/     # Public routes: login, signup
    │   ├── components/
    │   ├── context/
    │   ├── proxy.ts      # Next.js 16 route protection (replaces middleware.ts)
    │   └── lib/          # api.ts, auth.ts
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
The backend is fully async (FastAPI + asyncpg). Bcrypt and JWT ops are fast enough to run
directly in async handlers; no thread executors needed for auth.

### JWT Verification
Auth is now local HS256. Token is read from the `access_token` httpOnly cookie.
`get_current_user` decodes it with `JWT_SECRET_KEY` using PyJWT.
See `backend/app/core/auth.py` and `backend/app/core/security.py`.

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
See `CONTEXT.md` for the full chain. Current HEAD: `i9j0k1l2m3n4` (`add_password_hash`).
When adding a new migration, set `down_revision` to `'i9j0k1l2m3n4'`.

### Frontend API Calls
All calls go through `src/lib/api.ts` (`apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`).
All fetches use `credentials: 'include'` — the browser sends httpOnly cookies automatically.
No Authorization header. On 401, `api.ts` auto-refreshes the access token and retries once.
Signup calls `POST /api/users/` on the backend.

### Proxy (route protection)
`frontend/src/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`; exports `proxy`
function, not `middleware`). Checks for `access_token` cookie; redirects unauthenticated
requests to `/auth/login` and logged-in users away from `/auth/*` routes.

---

## Environment Variables

**Backend (`backend/.env`)**:
```
APP_NAME=Home Pro Manager
DEBUG=True
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
JWT_SECRET_KEY=<128-char hex string — generate with: python -c "import secrets; print(secrets.token_hex(64))">
```

**Frontend (`frontend/.env.local`)**:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8002
```

---

## What Not To Do

- Do not import from `@supabase/ssr` or `@supabase/supabase-js` — Supabase Auth is removed
- Do not add an `Authorization: Bearer` header to API calls — auth is cookie-based
- Do not name the proxy file `middleware.ts` — Next.js 16 uses `proxy.ts` with a `proxy` export
- Do not use `config.set_main_option("sqlalchemy.url", ...)` in alembic env.py
- Do not add `drop_constraint` calls in migrations for FK constraints that don't exist in the schema
- Do not use the direct Supabase connection string (port 5432, `db.<ref>.supabase.co`) — it may be IPv6-only
- Do not set `pool_pre_ping=True` on the asyncpg engine — the ping uses a prepared statement that PgBouncer transaction mode drops, causing `InvalidSQLStatementNameError` (surfaces as a CORS error in the browser)
- Do not use `connect_args={"prepared_statement_cache_size": 0}` alone — always pair it with `"prepared_statement_name_func": lambda: ""` to use unnamed prepared statements (auto-discarded after each Execute)
