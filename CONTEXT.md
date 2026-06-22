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
| DB client (frontend) | @supabase/ssr (browser client singleton) |

---

## Architecture Decisions

### Auth flow
- Supabase Auth handles session management and token issuance.
- The frontend logs in via `supabase.auth.signInWithPassword()` (browser client).
- Every API call includes the Supabase JWT as a `Bearer` token.
- The backend verifies the JWT using `PyJWKClient` against the Supabase JWKS endpoint
  (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`). New Supabase projects use **ES256** (asymmetric), not HS256.
- **Signup goes through the backend** (`POST /api/users/`), not directly to Supabase.
  This ensures a `users` row exists before any authenticated endpoint is hit.

### Why transaction pooler, not direct connection?
New Supabase projects may only expose a direct connection over IPv6. The transaction pooler
(`aws-0-eu-west-1.pooler.supabase.com`, port 6543) is always IPv4-reachable. Tradeoffs:
- `prepared_statement_cache_size=0` required on the asyncpg engine
- `pool_pre_ping=True` must NOT be set (its ping uses a prepared statement that fails with PgBouncer transaction mode, causing `InvalidSQLStatementNameError` surfacing as a CORS error)
- Must pair `prepared_statement_cache_size=0` with `prepared_statement_name_func: lambda: ""` to use unnamed prepared statements

### Why asyncio.to_thread / run_in_executor?
Both the Supabase Python client and PyJWKClient use synchronous HTTP. Calling them inside
`async def` handlers blocks the event loop long enough that the browser times out before
CORS headers arrive — Chrome misreports this as a CORS error. All blocking calls run in a
thread pool. A lifespan startup hook pre-warms both clients at server boot.

---

## Database Schema

### Migration chain (current HEAD: `f6c7d8e9a0b1`)
```
b1c2d3e4f5a6  initial_schema
      ↓
a0857efd3031  add_budget_module
      ↓
c3f9e2b1a7d4  add_created_by_to_households
      ↓
d6e7f8a9b0c1  add_income_to_household_members
      ↓
e4a5b6c7d8e9  refactor_sessions_standalone
      ↓
f5b6c7d8e9f0  add_adhoc_session_items
      ↓
b3c4d5e6f7a8  expand_account_types
      ↓
c4d5e6f7a8b9  add_institution_type_revert_account_type
      ↓
d5e6f7a8b9c0  add_mobile_money_institution_type
      ↓
e6f7a8b9c0d1  add_direct_pay_institution_type
      ↓
f6c7d8e9a0b1  add_account_transactions           ← HEAD
```

When adding a new migration set `down_revision = 'f6c7d8e9a0b1'`.

### Tables

**Core**
- `users` — app user records, linked to Supabase Auth by UUID primary key
- `households` — a household entity (`created_by` = auth user UUID)
- `member_types` — e.g., Husband, Wife, Child (per household)
- `household_members` — members of a household, optionally linked to a `users` row;
  carry income fields: `contributes_income`, `income_amount`, `income_currency`, `income_cadence`
- `accounts` — financial accounts with:
  - `account_type`: `checking | savings | cash | investment | credit`
  - `institution_type` (nullable): `bank | money_market | mobile_money | direct_pay | insurance | govt_securities | stocks_shares`
  - `ownership`: `joint | individual`
  - `contributes_to_net_worth` (bool, default `true`) — whether balance counts toward household net worth
  - `current_balance` — updated in real-time by account transactions
- `account_transactions` — ledger of deposits and withdrawals per account:
  - `transaction_type`: `credit | debit`
  - `narration` — description of the entry
  - `session_item_id` (nullable) — set when auto-created from a budget session item being marked paid
  - Auto-created on paid, auto-reversed when un-paid (if linked to a net-worth account)

**Budget**
- `budget_templates` — reusable budget plans (schema exists, UI skipped)
- `budget_template_items` — line items within a template
- `budget_sessions` — a monthly budget run (`draft → active → closed`); standalone (no template required)
- `budget_session_items` — spending tracked against a session; status: `todo | paid | reserved | na`
  - `expense_id` nullable (NULL = ad-hoc item)
  - `ad_hoc_name`, `ad_hoc_amount` — set only for one-time session expenses
  - `notes` — required when status = `na`
  - `reference_number` — required for rent items and Education group items when marked paid
  - `paid_date`
- `expense_groups` — grouping of expenses (household or personal via `owner_id`)
- `expenses` — individual recurring expense definitions; carry `account_id` FK (source account)
- `expense_tags` — optional tags for expenses
- `expense_tag_assignments` — many-to-many: expenses ↔ tags

### Ownership / expense attribution model
Expenses carry `ownership_type`: `husband`, `wife`, or `joint`. Joint expenses split by
configurable percentages (`joint_split_husband`, `joint_split_wife`). `owner_id = null`
means household expense; `owner_id = user_id` means personal expense.

The member role is derived via `member_type.name.toLowerCase()` which must equal
`ownership_type` for household expense attribution. This mapping is load-bearing
throughout the budget tracker.

### Income normalisation
`income_cadence` values and monthly conversion: weekly × 52 / 12, annually ÷ 12.

---

## Known Constraints

- **No Alembic autogenerate against live DB for downgrade.** Review downgrade sections manually.
- **Single household per user (current).** Schema supports multiple, but UI and queries assume one active household per user.
- **No email verification flow.** Signup uses `email_confirm: True` — users are immediately confirmed. Add proper verification before production.
- **Password rotation needed.** Current DATABASE_URL password is a placeholder for production.
- **Decimal coercion.** The backend sends `Numeric` fields as strings (Pydantic serialises `Decimal`). Frontend must always wrap with `Number()` before arithmetic or formatting: `Number(e.monthly_amount)`.

---

## Pages & Features

### Sidebar navigation
`/dashboard` · `/household` · `/budget` · `/networth` · `/settings`

---

### Dashboard (`/dashboard`)
- Hero dark card: Total Balance (sum of net-worth accounts, respects All/Mine toggle) + Monthly Income (expandable to show contributors with name, member type, amount)
- 4 stat cards: **Members** (expandable to show name + member type), **Months Tracked**, **Budgeted / mo**, **Amount Not Budgeted**
- 2-col: Income Breakdown (stacked bar + contributor rows) | Expenses by Tag (stacked bar + tag rows)
- Budget vs Income allocation progress bar
- Accounts list with **All / Mine** toggle (Mine = individual accounts owned by current user + all joint accounts)
- Total Balance and account count only include `contributes_to_net_worth` accounts

---

### Household (`/household`)

**Members section**
- Member cards with member type badge, "You" badge on the logged-in user's card
- Income toggle per member: amount, currency, cadence
- SVG donut chart showing income share (pure stroke-dasharray, no library)
- Add/Edit member dialogs prefill name from selected system user

**Accounts section**
- **All / Mine** toggle
- Visual breakdowns: by ownership, by account type, by institution type (donut charts)
- Each account card shows:
  - Green **Net Worth** shield badge if `contributes_to_net_worth = true`
  - **+** button → "Add Entry" dialog (Deposit / Withdrawal + amount + narration)
  - **History** icon → expandable transaction log inline on the card (lazy-loaded)
  - Edit / Delete buttons (hover)
- Add Account / Edit Account dialogs include:
  - Account type, institution type, currency, ownership, member owner
  - **Contributes to Net Worth** toggle (styled pill, defaults on)
  - Dialogs are scrollable (`max-h-[90vh] overflow-y-auto`) so the footer Save button is always visible

---

### Budget (`/budget`)

#### Expense Library tab
- Tab-agnostic visuals (always visible, above tab toggle):
  - **Income Tracker**: household income vs total budgeted
  - **Expenses by Tag**: breakdown of all non-deleted expenses
- Expense groups with header showing: expense count · KES total/mo · % of total budgeted
- Per-expense rows show source account badge when set
- Tags pill bar: each tag shows pencil (inline edit: name + colour) and × (delete) on hover; dashed "+ Add tag" button at end of row opens a create dialog

#### Monthly Sessions tab
- 12 month tiles (3-col grid) for the current calendar year
- Session detail: items grouped by expense group, status pills (To Do / Paid / Reserved / N/A)
- N/A requires a note; reference number required for rent + Education group items on Paid
- Ad-hoc (one-time) items draw from freed-up N/A budget pool
- Status distribution bar: stacked (Paid / Reserved / To Do / N/A) + 4-col breakdown
- **Auto-credit**: when an item is marked Paid and its linked expense has a source account
  with `contributes_to_net_worth = true`, an `AccountTransaction` (credit) is auto-created
  and the account balance is incremented. Reversed automatically when un-paying.

#### Reports tab
- Scope toggle: All Household / Me
- Donut chart (recharts) — breakdown by group
- Horizontal bar chart (recharts) — per-member allocated expenses
- Detailed group list with proportional bars and ownership badges

---

### Net Worth (`/networth`)
- Hero card: Total Net Worth + Total Deposits + Total Withdrawals, proportional stacked bar
- 2-col: **Net Worth Accounts** (balance + % of total per account) | **Excluded Accounts** (not counted)
- **Transaction Log**: all account transactions across the household
  - Filter by source: All Sources / Manual / Session
  - Filter by type: All / Deposits / Withdrawals
  - Each row: date/time · narration · account name · source badge · signed amount
  - Footer: transaction count + running deposit/withdrawal totals for active filter

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
| 2026-06-21 | Household | "You" badge, member name prefill, income donut chart |
| 2026-06-21 | Budget | Per-member expense attribution with 3-bucket model |
| 2026-06-21 | Budget | Zero-budgeted callout; remaining clamped to 0 minimum |
| 2026-06-21 | Budget | Reports tab: recharts donut + bar charts, scope toggle |
| 2026-06-22 | Budget | Monthly Sessions: full implementation |
| 2026-06-22 | Budget | N/A notes + ad-hoc session items (migration f5b6c7d8e9f0) |
| 2026-06-22 | Budget | Freed-up budget pool: backend validation, stat cards, status distribution bar |
| 2026-06-22 | Budget | Payment ref required for rent + Education group items |
| 2026-06-22 | Accounts | `institution_type` supplementary field (migrations c4d5e6f7a8b9 → e6f7a8b9c0d1) |
| 2026-06-22 | Accounts | Visual breakdowns by ownership / type / institution on household page |
| 2026-06-22 | Accounts | All / Mine toggle on household and dashboard account sections |
| 2026-06-22 | Budget | Tab-agnostic income tracker + tag breakdown above tab toggle |
| 2026-06-22 | Budget | Group header shows total amount + % of total budgeted |
| 2026-06-22 | Budget | Tag edit + delete in tags manager; source account label on expense rows |
| 2026-06-22 | Dashboard | Overhaul: income breakdown, tag breakdown, expandable Members + Monthly Income cards |
| 2026-06-22 | Accounts | `contributes_to_net_worth` flag + `account_transactions` table (migration f6c7d8e9a0b1) |
| 2026-06-22 | Accounts | Manual deposit/withdrawal entries with narration; inline transaction history on card |
| 2026-06-22 | Budget | Auto-credit account balance on session item paid; reversed on un-pay |
| 2026-06-22 | Net Worth | New `/networth` page: net worth breakdown + full transaction log with filters |
| 2026-06-22 | Budget | Tags pill bar: inline edit/delete on hover; replaced hidden Manage Tags dialog |
