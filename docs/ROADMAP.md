# Home Pro Manager — Roadmap

> Living document. Update when decisions are made or phases complete.  
> For architecture details and constraints, see `CONTEXT.md`.  
> For coding rules, see `CLAUDE.md`.

---

## What's Built (as of 2026-08-25)

### Core App
| Area | Status | Notes |
|---|---|---|
| Authentication | Done | Local HS256 JWT, bcrypt, httpOnly cookies — fully Supabase-free |
| Household setup | Done | Create household, member types, members with income |
| Income history | Done | Append-only log with effective_from; historical income on budget sessions |
| Accounts | Done | Checking/savings/cash/investment/credit; deposits/withdrawals; net worth flag |
| FX rates | Done | Per-household rates to KES; used in net worth and account labels |
| Budget — Expense Library | Done | Groups, expenses, tags, source account per expense |
| Budget — Monthly Sessions | Done | Draft→active→closed; payday banner; 5-day grace period; drag-to-reorder |
| Budget — Variance | Done | Paid vs budgeted per group and item |
| Budget — Reports | Done | Scope toggle, donut + bar charts, per-member attribution |
| Net Worth | Done | Trajectory line chart; full transaction log with filters |
| Settings | Done | Profile, household name, budget calendar, FX rates, member types, Danger Zone |
| Danger Zone | Done | 4 clearance levels; password re-auth + "DELETE" confirmation; owner-only |

### Infrastructure
| Area | Status | Notes |
|---|---|---|
| FastAPI backend | Done | Fully async, asyncpg, rate limiting, security headers |
| Alembic migrations | Done | Chain of 10 migrations, HEAD: `i9j0k1l2m3n4` |
| Next.js 16 frontend | Done | App Router, proxy.ts for route protection, Next.js rewrites for same-origin cookies |
| Supabase decoupling | Done | Auth, frontend SDK, and backend SDK all removed |

---

## Next Steps — Ordered by Priority

### Phase 3 — Database Setup Wizard
> Goal: a new user can clone the repo, run the app, and go through a UI wizard
> to connect their database and create their admin account — no terminal commands.

This is the main remaining piece of the "database provider decoupling" decision made
on 2026-08-25. See **Open Decisions** below before starting.

**Backend work:**
1. `GET /api/setup/status` — returns `{ configured: bool, db_connected: bool, has_users: bool }`;
   reads from a config file (or env) to determine state; no auth required
2. `POST /api/setup/test-connection` — accepts `{ database_url: string }`; tries a `SELECT 1`;
   returns `{ ok: bool, error?: string }`; no auth required
3. `POST /api/setup/run-migrations` — runs Alembic `upgrade head` programmatically;
   returns progress as a stream or a simple `{ ok: bool }`; no auth required
4. `POST /api/setup/create-admin` — accepts `{ name, email, password }`; only works when
   `has_users = false`; creates the first user record; no auth required
5. Config persistence — decide how to save the chosen DATABASE_URL after setup
   (`.env` file write, `config.json`, or instruct user to set env var — see Open Decisions)
6. Lock setup endpoints once `has_users = true` (prevent re-running setup over existing data)

**Frontend work:**
1. `/setup` route — multi-step wizard, public (no auth redirect)
2. Update `proxy.ts` to redirect to `/setup` instead of `/auth/login` when `status.configured = false`
3. Step 1 — Database connection: input for connection string (or individual fields), Test Connection
   button, optional Docker button (see Open Decisions)
4. Step 2 — Run migrations: progress indicator, success/error state
5. Step 3 — Create admin account: name + email + password form
6. Step 4 — Done: redirect to `/auth/login`

---

### Phase 4 — Docker Self-Hosted PostgreSQL (Optional)
> Only if the "Docker button" decision in Open Decisions is Yes.

Adds a "Start with Docker" button to Step 1 of the wizard that:
1. Calls `POST /api/setup/docker/start` — backend checks if Docker is available,
   pulls `postgres:16-alpine`, starts a named container, returns the generated
   connection string
2. Frontend auto-fills the connection string and advances to Test Connection
3. `POST /api/setup/docker/status` — polls container health

---

### Phase 5 — Quality of Life

These are self-contained and can be picked up in any order:

| Feature | Scope | Notes |
|---|---|---|
| Change password | Backend + Settings UI | `PATCH /api/users/me/password` with current + new password; bcrypt re-hash |
| Budget templates UI | Frontend only | Schema already exists (`budget_templates`, `budget_template_items`); UI was skipped |
| Data export | Backend + frontend | `GET /api/households/{id}/export?format=csv\|json`; downloads a zip of sessions + accounts |
| Mobile layout | Frontend only | Sidebar collapses to bottom nav on small screens |

---

## Open Decisions

These must be answered before starting Phase 3.

---

### OD-1 — Database engine scope

**Question:** Which database engines should the setup wizard support?

| Option | Pros | Cons |
|---|---|---|
| **PostgreSQL only** | No extra code; current stack already asyncpg | Users must have Postgres |
| PostgreSQL + SQLite | Zero-install local dev (no Docker, no server) | asyncpg can't do SQLite; need aiosqlite + conditional engine; Alembic dialect differences |
| PostgreSQL + MySQL | Covers more self-hosters | Even more dialect work; MySQL async driver (aiomysql) |

**Recommendation:** PostgreSQL only for now. SQLite can be added later as a dedicated "dev mode" flag.

**Decision:** _______________

---

### OD-2 — Self-hosted definition

**Question:** In the setup wizard Step 1, what does "self-hosted" mean?

| Option | Description | Effort |
|---|---|---|
| **A — Credentials only** | Wizard asks for host/port/user/pass. User is responsible for having Postgres running. | Low — just a form |
| B — Docker button | Wizard has a "Start with Docker" button that pulls postgres:16-alpine and starts a container automatically. | Medium — backend needs Docker SDK (`docker-py`) |
| C — Both | Show credentials form; also show Docker button as a shortcut if Docker is detected. | Medium-high |

**Recommendation:** Option A first (fastest to ship), Phase 4 adds the Docker button.

**Decision:** _______________

---

### OD-3 — Config persistence after setup

**Question:** After the wizard runs, how should the app remember the database URL?

| Option | Notes |
|---|---|
| **Write to `.env`** | Simple; survives restarts; but file may not be writable in some deployments |
| Write to `config.json` | Cleaner separation from secrets; needs a config loader |
| Env var (user sets it) | Most portable; wizard just shows what to set; user must restart the app after |
| Database-backed config | Chicken-and-egg problem — can't store DB URL in the DB |

**Recommendation:** Write to `.env` for self-hosted / local. Show the generated line at the end of the wizard so the user can copy it if auto-write fails.

**Decision:** _______________

---

### OD-4 — Multi-user signup after setup

**Question:** Once the admin account is created, can other users sign up freely?

Currently: anyone who hits `POST /api/users/` can create an account.  
The household is then separate (each user creates or joins a household).

| Option | Notes |
|---|---|
| **Open signup** | Current behaviour; anyone with the URL can register |
| Invite-only | Admin generates an invite link/token; only invited emails can register |
| Admin creates all accounts | No self-signup; admin creates accounts for household members |

**Recommendation:** Open signup is fine for a private self-hosted app. Revisit if multi-household or shared hosting is ever added.

**Decision:** _______________

---

## Shelved / Future

- **Email verification** — no flow exists; signup auto-confirms. Needs an SMTP integration.
- **Forgot password** — no flow exists. Needs either SMTP (email reset link) or admin-reset endpoint.
- **Multi-household** — schema supports it; UI assumes one household per user.
- **Recurring transactions** — account auto-entries on a schedule.
- **Budget carry-over** — roll unspent budget forward to next month.
