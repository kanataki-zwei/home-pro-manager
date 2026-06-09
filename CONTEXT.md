# Project Context — Home Pro Manager

Household budgeting and management app for a single household (married couple +
dependants). Zero-based budgeting model. Currency: **KES** (Kenyan Shilling).

---

## Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI 0.129, Python 3.13 |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Migrations | Alembic |
| Auth provider | Supabase Auth |
| Database | Supabase PostgreSQL (hosted) |
| Frontend | Next.js 14 App Router, TypeScript |
| UI | shadcn/ui, Tailwind CSS, Lucide icons |
| Toasts | Sonner |
| Forms | react-hook-form + zod |
| DB client (frontend) | @supabase/ssr (browser client singleton) |

---

## Architecture Decisions

### Auth flow
- Supabase Auth handles session management and token issuance.
- The frontend logs in via `supabase.auth.signInWithPassword()` (browser client).
- Every API call includes the Supabase JWT as a `Bearer` token.
- The backend verifies the JWT using `PyJWKClient` against the Supabase JWKS endpoint
  (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`).
- **Signup goes through the backend** (`POST /api/users/`), not directly to Supabase.
  This ensures a corresponding record exists in the `users` table before the user
  ever tries to call an authenticated endpoint.

### Why signup through backend?
Supabase Auth and the app's `users` table are separate. If a user is created directly
in Supabase Auth (e.g., via the dashboard or `supabase.auth.signUp()`), no trigger
exists to create a `users` row. `get_current_user` queries the `users` table and
returns 401 "User not found" if the row is missing. The backend signup handler
creates the Auth user first, then inserts the `users` row atomically.

### Why transaction pooler, not direct connection?
New Supabase projects may only expose a direct connection over IPv6
(`db.<ref>.supabase.co`). The transaction pooler (`aws-0-eu-west-1.pooler.supabase.com`,
port 6543) is always IPv4-reachable. The tradeoff: transaction pooler does not support
prepared statements, so `prepared_statement_cache_size=0` is set on the asyncpg engine
and `pool_pre_ping` is NOT used (its internal ping also uses a prepared statement that
fails with PgBouncer transaction mode, causing `InvalidSQLStatementNameError` which
propagates as a CORS error in the browser).

### Why asyncio.to_thread / run_in_executor?
Both the Supabase Python client and PyJWKClient use synchronous HTTP (urllib / requests).
Calling them inside an `async def` handler blocks the event loop. On cold start this
takes long enough that the browser times out before CORS headers arrive — Chrome
misreports this as a CORS policy error. The fix is to run all blocking calls in a
thread pool. A lifespan startup hook pre-warms both clients at server boot.

---

## Database Schema

### Migration chain
```
b1c2d3e4f5a6_initial_schema   (root)
        ↓
a0857efd3031_add_budget_module
```

### Tables (initial schema)
- `users` — app user records, linked to Supabase Auth by UUID primary key
- `households` — a household entity
- `member_types` — e.g., Husband, Wife, Child (per household)
- `household_members` — members of a household, optionally linked to a `users` row
- `accounts` — financial accounts (checking, savings, cash, investment, credit)

### Tables (budget module)
- `budget_templates` — reusable budget plans
- `budget_template_items` — line items within a template
- `budget_sessions` — a monthly budget run (draft → active → closed)
- `budget_session_items` — actual spending tracked against a session
- `expense_groups` — grouping of expenses (e.g., Housing, Transport)
- `expenses` — individual recurring expense definitions
- `expense_tags` — optional tags for expenses
- `expense_tag_assignments` — many-to-many: expenses ↔ tags

### Ownership model
Expenses carry an `ownership_type`: `husband`, `wife`, or `joint`. Joint expenses
split by configurable percentages (`joint_split_husband`, `joint_split_wife`).

---

## Supabase Project Migration (completed 2026-06-08)

**Reason:** Old Supabase project had an unresolvable issue; migrated to a new project.

**What changed:**
- New Supabase project ref: `foikjbsfnzqvyrrcegol`
- Region: `eu-west-1`
- All env vars updated (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET,
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- New project uses **ES256** JWT algorithm (asymmetric ECDSA), not HS256.
  Auth.py was rewritten to use PyJWKClient instead of base64-decoded secret.
- Alembic initial schema migration created from scratch (old project had tables created
  directly in Supabase, not via Alembic). New project is fully Alembic-managed.
- Budget migration `down_revision` updated from `None` to `b1c2d3e4f5a6`.
- Two `drop_constraint` lines removed from budget migration downgrade — those FKs
  referenced `auth.users` which no longer exists in the new schema.

---

## Known Constraints

- **No Alembic autogenerate against live DB for downgrade.** The budget migration's
  downgrade function has manually trimmed `drop_constraint` calls. If generating new
  migrations, review the downgrade section carefully.
- **Password rotation needed.** The current test DATABASE_URL password is a placeholder
  that must be rotated before any production deployment.
- **Single household per user (current).** The schema supports multiple households
  but the UI and some queries assume one active household per user.
- **No email verification flow.** Signup uses `email_confirm: True` on the Supabase
  admin create call — users are immediately confirmed. A proper email verification
  flow should be added before production.

---

## Upgrade Log

| Date | Area | Change |
|---|---|---|
| 2026-06-08 | Auth | Switched from HS256+secret to ES256+JWKS (PyJWKClient) |
| 2026-06-08 | Auth | Wrapped JWKS and Supabase admin calls in thread executors |
| 2026-06-08 | Startup | Added lifespan hook to pre-warm blocking HTTP clients |
| 2026-06-08 | Signup | Moved signup from Supabase direct to `POST /api/users/` |
| 2026-06-08 | DB | Migrated to new Supabase project; full Alembic chain established |
| 2026-06-08 | DB | Transaction pooler (port 6543) + `prepared_statement_cache_size=0` |
| 2026-06-08 | Alembic | Fixed env.py to bypass configparser `%` interpolation on passwords |
