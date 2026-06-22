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
b1c2d3e4f5a6_initial_schema            (root)
        ↓
a0857efd3031_add_budget_module
        ↓
c3f9e2b1a7d4_add_created_by_to_households
        ↓
d6e7f8a9b0c1_add_income_to_household_members
        ↓
e4a5b6c7d8e9_refactor_sessions_standalone
        ↓
f5b6c7d8e9f0_add_adhoc_session_items        ← current HEAD
```

### Tables (initial schema)
- `users` — app user records, linked to Supabase Auth by UUID primary key
- `households` — a household entity
- `member_types` — e.g., Husband, Wife, Child (per household)
- `household_members` — members of a household, optionally linked to a `users` row
- `accounts` — financial accounts (checking, savings, cash, investment, credit)

### Tables (budget module)
- `budget_templates` — reusable budget plans (skipped in UI for now)
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
`owner_id = null` means household expense; `owner_id = user_id` means personal expense.

The member role is derived via `member_type.name.toLowerCase()` which equals
`ownership_type` for household expense attribution. This mapping is load-bearing
throughout the budget tracker and reports.

### Income model (added d6e7f8a9b0c1)
`household_members` gained: `contributes_income`, `income_amount`, `income_currency`,
`income_cadence` (weekly / monthly / annually). Monthly normalisation:
weekly × 52 / 12, annually ÷ 12.

### Sessions refactor (e4a5b6c7d8e9)
`budget_sessions.budget_template_id` made nullable (sessions are standalone,
populated directly from the expense library). `budget_session_items.status` check
constraint changed from `pending/partial/paid/reserved/skipped` to `todo/paid/reserved/na`.

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

## UI Features Built

### Household page (`/household`)
- Member cards with member type badges and income display.
- "You" badge on the card of the member linked to the logged-in user (`user_id === currentUserId`).
- Add/Edit member dialogs prefill name from the selected system user.
- "Create new system user" dialog prefills the name already typed in the member form.
- Household income section: per-member income rows showing amount + member type + cadence,
  plus an SVG donut chart (pure stroke-dasharray technique, no library) showing income share.

### Budget page (`/budget`) — tabs:

**Expense Library tab**
- Expense groups (household or personal) + per-group expense list.
- Add/edit/delete expenses with: name, amount, frequency, ownership_type, joint splits,
  group, tags, account.
- Budget tracker (household tab): per-member income → allocated breakdown in three
  buckets per member: `HH · [Type]`, `HH · Joint share`, `Personal`.
- Budget tracker (personal tab): same three-bucket calculation for the logged-in user only.
- Remaining income clamped to zero minimum. "Zero budgeted" emerald badge when remaining = 0
  (this is the goal, not a warning).

**Reports tab**
- Scope toggle: All Household / Me.
- Summary cards: monthly total, expense count, active group count.
- Donut chart (recharts PieChart) — expense breakdown by group.
- Horizontal bar chart (recharts BarChart) — per-member allocated expenses (All scope only).
- Detailed group list with proportional bars and per-expense ownership badges.
- Joint expense in "Me" scope shows the user's percentage share.

**Monthly Sessions tab** ← COMPLETE

**Budget Templates tab** — placeholder, skipped for now.

---

## Monthly Sessions — Complete

**Spec implemented:**
- 12 month tiles (3-col grid) for the current calendar year.
- Future months: greyed out, not clickable.
- Past month with no session: shows "No budget" on tile, not clickable.
- Past month with session: clickable, opens read-only detail view.
- Current month without session: "Start this month's budget" button → `POST /sessions`.
- Current month with session: clickable, opens editable detail view.
- Session detail: items grouped by expense group, status pill buttons (To Do / Paid / Reserved / N/A).
- Status change calls `PATCH /sessions/{id}/items/{item_id}`.
- Past sessions render pills as disabled (read-only).
- `POST /sessions` filters expenses by user role: personal (`owner_id == user`) + HH owned (`ownership_type == role`) + joint.
- Session name auto-generated server-side (e.g. "June 2026").
- `total_paid` in summary and detail computed from items with `status == 'paid'` × `allocated_amount`.
- 4-card status bar above grid: Monthly Income / Budgeted / Paid / Remaining.
- Number formatting: `en-US` locale, compact format on tiles (KES 150K), full format in detail.
- Decimal API values coerced to `Number()` before formatting (Pydantic sends Decimal as string).

---

## N/A Notes + Ad-hoc Session Items — COMPLETE

- Migration `f5b6c7d8e9f0` run: `expense_id` nullable, `ad_hoc_name`, `ad_hoc_amount` columns added, check constraint in place.
- `models/budget.py` — `BudgetSessionItem` has `expense_id` nullable, `ad_hoc_name`, `ad_hoc_amount`, `notes`.
- `schemas/budget.py` — `BudgetSessionItemUpdate` has `notes`; `BudgetSessionItemResponse` has `expense_id`/`expense` Optional, `notes`, `ad_hoc_name`, `ad_hoc_amount`; `AdHocSessionItemCreate` schema added.
- `routers/budget.py` — `update_session_item` requires notes on N/A and clears notes on status change away from N/A; `POST /sessions/{id}/items` creates ad-hoc items; `DELETE /sessions/{id}/items/{item_id}` deletes ad-hoc items only.
- `MonthlySession.tsx` — N/A inline note flow, ad-hoc items section, add/delete one-time expenses.

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
| 2026-06-21 | Household | "You" badge, member name prefill from system user, income donut chart |
| 2026-06-21 | Budget | Per-member expense attribution with 3-bucket model (HH owned/joint/personal) |
| 2026-06-21 | Budget | Zero-budgeted callout; remaining clamped to 0 minimum |
| 2026-06-21 | Budget | Reports tab: recharts donut + horizontal bar charts, scope toggle (All/Me) |
| 2026-06-22 | Budget | Monthly Sessions: full implementation (migration, schema, router, UI) |
| 2026-06-22 | Budget | N/A notes + ad-hoc session items (migration f5b6c7d8e9f0, backend endpoints, frontend UI) |
