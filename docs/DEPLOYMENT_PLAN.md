# Deployment Plan — HomePro to Production

**Goal:** Deploy HomePro Manager to `homepro.gichiniwaruingi.com` as a secure,
mobile-friendly PWA accessible on Patrick's and Vivian's phones.

**Stack:** Vercel (frontend) + Render (backend, free tier) + Supabase (DB, free tier) + UptimeRobot (keep-alive, free)

---

## What's Already in Place

- CORS locked to `FRONTEND_URL` (not wildcard)
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`, `Cache-Control`
- `slowapi` rate limiter imported and wired
- JWT: access token (60 min) + refresh token (30 days), httpOnly cookies
- `/health/db` endpoint — live DB query, ready for UptimeRobot

---

## Phase 1 — Secure & Deploy

### Step 1 · Security Hardening `[ ]`
*Must be done before anything goes public.*

- [ ] Verify `slowapi` rate limiting is applied to `/api/auth/login` and `/api/auth/signup`
- [ ] Disable OpenAPI docs (`/docs`, `/redoc`, `/openapi.json`) when `DEBUG=False`
- [ ] Lock down user signup — private family app, no open registration
- [ ] Add `Content-Security-Policy` response header
- [ ] Confirm `DEBUG=False` is enforced in production env
- [ ] Run `pip audit` on backend dependencies
- [ ] Run `npm audit` on frontend dependencies
- [ ] Confirm no secrets committed to git (`.env`, `.env.local`)

### Step 2 · Production Environment Config `[ ]`

- [ ] Backend production env vars:
  - `DEBUG=False`
  - `FRONTEND_URL=https://homepro.gichiniwaruingi.com`
  - `JWT_SECRET_KEY=<new 128-char hex — regenerate, don't reuse dev key>`
  - `DATABASE_URL=<same Supabase transaction pooler URL>`
- [ ] Frontend production env var:
  - `NEXT_PUBLIC_API_URL=https://api.homepro.gichiniwaruingi.com`
    *(or the Render default URL if not using a custom API subdomain)*
- [ ] Confirm neither `.env` file is tracked by git

### Step 3 · Deploy Backend → Render `[ ]`

- [ ] Freeze dependencies: `pip freeze > requirements.txt` from venv
- [ ] Add `render.yaml` to `backend/` for one-click deploy config
- [ ] Configure on Render dashboard:
  - Build command: `pip install -r requirements.txt`
  - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - Set all env vars in Render dashboard (never in code)
- [ ] Run Alembic migrations against production DB after first deploy
- [ ] Verify `/health` and `/health/db` respond on the live Render URL

### Step 4 · Deploy Frontend → Vercel `[ ]`

- [ ] Connect GitHub repo to Vercel (auto-detects Next.js)
- [ ] Set `NEXT_PUBLIC_API_URL` in Vercel environment variables
- [ ] Confirm build passes and app loads on the Vercel preview URL
- [ ] Add custom domain `homepro.gichiniwaruingi.com` in Vercel dashboard

### Step 5 · DNS Setup `[ ]`

- [ ] `homepro.gichiniwaruingi.com` → CNAME to Vercel-provided value
- [ ] (Optional) `api.homepro.gichiniwaruingi.com` → CNAME to Render URL
- [ ] Wait for propagation, verify HTTPS is active on both

### Step 6 · UptimeRobot `[ ]`

- [ ] Create free account at uptimerobot.com
- [ ] Add HTTP monitor → `https://<render-url>/health/db`
- [ ] Set interval: every 5 minutes
- [ ] Verify first ping succeeds
- [ ] This keeps both Render (from sleeping) and Supabase (from pausing after 7 days) alive

---

## Phase 2 — Mobile & PWA

### Step 7 · Mobile UI `[ ]`
*Largest effort. Do before PWA.*

- [ ] Sidebar → slide-in drawer with hamburger toggle on small screens
- [ ] Budget Report — responsive column layouts
- [ ] Net Worth page — responsive hero grid and account cards
- [ ] Household page — filter chips, account grid, modals
- [ ] Dashboard — responsive card grid
- [ ] Minimum 44px touch targets across all interactive elements
- [ ] Test on Chrome DevTools mobile emulation throughout

### Step 8 · PWA Setup `[ ]`

- [ ] Install `@ducanh2912/next-pwa`
- [ ] Create `frontend/public/manifest.json`:
  - `name`, `short_name`, `start_url`, `display: standalone`
  - `theme_color`, `background_color`
  - Icon entries for 192×192 and 512×512
- [ ] Create app icons (PNG, transparent background):
  - `public/icons/icon-192.png`
  - `public/icons/icon-512.png`
- [ ] Configure `next-pwa` in `next.config.ts`
- [ ] Add `<link rel="manifest">` and theme-color meta to `layout.tsx`

### Step 9 · Real-Device Testing `[ ]`

- [ ] iOS Safari: Add to Home Screen → verify icon, splash, standalone mode
- [ ] Android Chrome: Install prompt → verify icon, app opens correctly
- [ ] Full walkthrough on both phones: login → dashboard → budget → net worth
- [ ] Verify no layout breakage on small screens (375px width minimum)
- [ ] Verify UptimeRobot pings are showing green

---

## Subdomain Decision

Using `homepro.gichiniwaruingi.com` for the frontend.
API options (pick one before Step 3):

| Option | URL | Trade-off |
|---|---|---|
| Render default | `homepro-api.onrender.com` | No DNS config needed |
| Custom subdomain | `api.homepro.gichiniwaruingi.com` | Cleaner, one extra DNS record |

Recommendation: use the Render default URL to start, switch to a custom subdomain later if desired.

---

## Progress Tracker

| Step | Status |
|---|---|
| 1. Security hardening | 🔲 Not started |
| 2. Production env config | 🔲 Not started |
| 3. Render deploy | 🔲 Not started |
| 4. Vercel deploy | 🔲 Not started |
| 5. DNS setup | 🔲 Not started |
| 6. UptimeRobot | 🔲 Not started |
| 7. Mobile UI | 🔲 Not started |
| 8. PWA setup | 🔲 Not started |
| 9. Device testing | 🔲 Not started |
