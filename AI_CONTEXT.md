# TP Automation CRM — AI Context

> **Purpose:** give any AI/agent enough context to work on this repository confidently.
> The **UI language is Uzbek (Latin script)**. Code identifiers and comments are mixed
> Uzbek/English. Uzbek UI terms are glossed in parentheses below. Preserve the Uzbek UI
> convention when adding user-facing text.

---

## 1. What this project is

A CRM for **TP Automation** — a company that installs and rents **restaurant POS equipment**
(monoblocks, receipt printers, Wi‑Fi routers) and sells/supports POS software. The system is
used **internally** by the TP team: call **operators**, a **manager/boss**, and field
**installers** ("usta"). Core jobs it supports:

- Track clients, contracts, monthly payments, and installed equipment.
- Run a **daily calling workflow**: each operator gets a daily list of leads, calls them, records
  an outcome, and the lead automatically moves to the correct queue.
- Escalate problems to the boss, who assigns them to an **integrator/installer** ("usta").
- Collect payments (with a **mandatory receipt image**) and post them to a Telegram channel.
- Send in-app announcements, manage users, and keep a full audit trail.

There is **no public/customer-facing** surface — every page is behind authentication.

---

## 2. Tech stack

| Area | Choice |
|------|--------|
| Framework | **Next.js 15.5.19**, App Router, **React 19**, Server Actions |
| Language | **TypeScript 5.7** |
| ORM / DB | **Prisma 6** → **PostgreSQL** (status fields are plain strings, not DB enums) |
| Styling | **Tailwind CSS 3.4**, `darkMode: "class"` (persisted, no-FOUC inline script) |
| Auth | Custom JWT via **jose** (HS256) + **bcryptjs**. No NextAuth. |
| Telegram | **grammY** bot (`scripts/bot.ts`) + **node-cron** scheduled jobs |
| Reports | **pdf-lib** (PDF), **@resvg/resvg-js** (render SVG charts → PNG) |
| Validation | **zod** (`src/lib/validation.ts`; enums derived from `constants.ts`) |
| Tests | **Vitest** (unit) + **Playwright** (E2E) |
| Lint | **ESLint 9** flat config |
| Deploy | Multi-stage **Docker** + **Docker Compose**, AWS EC2, image in **GHCR** |

---

## 3. Quick start (local development)

```bash
# PostgreSQL runs in Docker on port 5433 (see .env DATABASE_URL).
npm ci
npx prisma generate
npx prisma migrate deploy        # or `npm run db:migrate` in dev
npm run db:seed                  # seeds demo users (all dev passwords: parol123)
npm run dev                      # → http://localhost:3100
npm run bot                      # (optional) Telegram worker + cron, separate process
```

- Dev server port: **3100**. Local DB: `postgresql://tp:***@localhost:5433/tp_automation`.
- Seed users include `admin` (ADMIN role) and operators; every password is `parol123` in dev.
- Required `.env` keys: `DATABASE_URL`, `SESSION_SECRET`, `POSTGRES_PASSWORD`.
  Optional: `TELEGRAM_*` (bot/channel), `COOKIE_SECURE`, `APP_PORT`, `TP_IMAGE`.

Useful scripts (`package.json`): `dev`, `build`, `start`, `test`, `test:e2e`, `lint`,
`db:deploy`, `db:migrate`, `db:seed`, `create-admin`, `bot`.

---

## 4. Directory map

```
src/
  app/(app)/            # authenticated pages
    layout.tsx          # requireSession() + AppShell (nav, unread-notification badge)
    page.tsx            # ADMIN dashboard
    lidlar/             # DAILY WORK board (the core operator screen; "lid" = lead)
    mijozlar/[id]/      # client detail: info, calls, tickets, payments, activity log
    toldirilmagan/      # "incomplete" clients (missing restaurant/phone/region)
    tolovlar/           # payments overview + search ("to'lov" = payment)
    muammolar/          # tickets/problems + integrator assignment ("muammo" = problem)
    eskalatsiya/        # boss queue: assign installer, revert lead
    qaytarish/          # equipment return queue ("qaytarish" = return)
    otkaz/              # refused/cancelled clients ("otkaz" = refusal)
    ombor/              # inventory/warehouse
    ustalar/            # installers (login-less contacts)
    foydalanuvchilar/   # user admin + password-reset approvals
    bildirishnomalar/   # notifications: compose + feed
    profil/             # self profile + password-reset request
    analitika/ tablo/   # live analytics + TV board (poll /api/analytics every 5s)
    hisobot/ audit/ import/
  app/login/            # login page (public)
  app/api/              # health, analytics, logout, report/pdf, protected receipt route
  actions/              # server actions: leads, clients, tickets, payments, users,
                        #   notifications, password-reset, distribution, equipment, usta, auth
  components/           # UI: lead-table, client-form, *-control, phone-copy, app-shell, ...
  lib/                  # constants, validation, auth, session, rbac, db, analytics,
                        #   telegram, reports, utils, access, audit, payment-status
prisma/                 # schema.prisma + migrations/ + seed.ts
scripts/                # bot.ts (worker), create-admin.ts, deploy-pull.sh
.github/workflows/      # ci.yml (lint/tsc/test/build + e2e), deploy.yml (build → GHCR)
```

---

## 5. Data model (Prisma — key models)

- **User** — `role` = `ADMIN | MANAGER | OPERATOR | INSTALLER`; `username` / `passwordHash`;
  `regions` (comma-separated list of covered provinces); `telegramId`; `dailyLeadTarget`.
  Installers ("usta") have role `INSTALLER` but are **login-blocked** (managed as contacts).
  Relations include assigned clients (as operator and as usta), callLogs, payments, tickets
  (as operator and as usta), notifications, passwordResets.
- **Client** — the central entity. `status` = `ACTIVE | INACTIVE | PENDING`; `stage` (lead
  workflow, §6); `pendingStage` (chosen outcome's target, applied at day-end); `assignedToId`
  (today's operator); `assignedUstaId` + `ustaStatus` (escalation); `specialNote`;
  `nextContactDate`; `nextPaymentDate`; `monthlyAmount` / `currency`; `missedCallCount`; `notes`.
  Has `phones[]`, `callLogs[]`, `payments[]`, `tickets[]`, `equipmentItems[]`, `returnRequests[]`.
- **CallLog** — `result` (a LEAD_OUTCOME or CALL_RESULT), `note`, `operatorId`, `calledAt`.
  **Source of truth for "who talked to the client".**
- **Ticket** (problem) — `type` / `status` / `priority`, `assignedToId` (operator who tracks it),
  `assignedUstaId` (**integrator = an installer/usta**), `resolutionNote`.
- **Payment** — `amount` / `currency`, `receiptPath` (mandatory receipt image), `recordedById`.
- **Warehouse**: `EquipmentType`, `InventoryStock`, `ClientEquipment`, `EquipmentMovement`,
  `EquipmentReturnRequest` (PENDING → APPROVED → DONE).
- **Notification** + **NotificationRecipient** (per-user read tracking).
- **PasswordResetRequest** — PENDING → APPROVED/REJECTED.
- **AuditLog** — `entity`, `entityId`, `userId`/`userName`, `action`, `detail`, `createdAt`
  (the client detail page shows entries where `entityId = clientId`).
- **DailyLeadGrant** — per-operator daily lead quota adjustments.

---

## 6. Core domain: the lead workflow

All status enums live in **`src/lib/constants.ts`** (single source of truth). `validation.ts`
derives Zod enums from them, and `*Label()` helpers provide Uzbek display strings. **Statuses are
plain strings**, not DB enums — add a new value in `constants.ts` and the Zod enum + labels update
automatically.

- **LEAD_OUTCOME** (what the operator selects in the daily-board dropdown): `NO_ANSWER,
  PHONE_OFF, BUSY, CALL_LATER, WILL_PAY, WILL_PAY_TOMORROW, PAYMENT_REMINDED, FORWARDED,
  HAS_ISSUE, NO_PROBLEM, PAID, RESOLVED, RETURN_EQUIPMENT, REFUSED, DEACTIVATED`.
- **LEAD_STAGE** (the lead's current queue): `NEW, NO_ANSWER, LATER, AWAITING_PAYMENT, ESCALATED,
  FORWARDED, RETURNING, RESOLVED, REFUSED, DEACTIVATED`.
- **OUTCOME_TO_STAGE** maps an outcome to its target stage.
- **ACTIVE_STAGES** = `[NEW, NO_ANSWER, LATER, AWAITING_PAYMENT]` — only these appear on the
  daily board.

**Flow — do not break this contract:**
1. The operator picks an outcome on `/lidlar` → `saveLeadCell()` writes a **CallLog** and sets
   `pendingStage` (**not** `stage`). The lead **stays on the board** (the query keeps rows where
   `pendingStage != null`). Choosing an outcome must **not** make the lead disappear.
2. The operator clicks **"Kunni yakunlash"** (Finish the day) → `finishDay()` applies
   `stage = pendingStage` and sets `nextContactDate` based on the stage. Only now does the lead
   move to its section.
3. Outcome side effects (in `saveLeadCell` / `recordLeadOutcome`):
   - `RETURN_EQUIPMENT` → creates an `EquipmentReturnRequest` (→ `/qaytarish`).
   - `HAS_ISSUE` → auto-creates a **Ticket** carrying the operator's note (→ `/muammolar`).
   - 3+ consecutive missed calls → auto-escalate to `FORWARDED`.

**Daily distribution** — `redistributeLeads()` (`actions/distribution.ts`, run by cron or a boss
button) randomly assigns due, ACTIVE-stage leads to active operators via `assignedToId`. Ownership
is **daily/rotating**, not permanent; "who talked" always comes from CallLog, not from assignment.

**Escalation** (`/eskalatsiya`, ADMIN/MANAGER) — ESCALATED leads: the boss assigns an installer
(`assignUsta`) → stage becomes FORWARDED → boss tracks `ustaStatus`. `revertLead()` sends a
wrongly-escalated lead back into the daily flow.

**Refusals** (`/otkaz`) — outcome `REFUSED` → stage `REFUSED`; the boss can revert if the client
returns.

**Analytics "talked" metric** — the live dashboard/TV board counts a client as "talked" when a
CallLog result is in **`TALKED_RESULTS`** (every outcome except the missed ones `NO_ANSWER /
PHONE_OFF / BUSY`, plus the manual `TALKED`). So when an operator changes a lead's status to any
real conversation outcome, the "talked clients" counter increments.

---

## 7. Auth, RBAC, and conventions

- **Session** — JWT (jose HS256) stored in the `tp_session` cookie; signed with `SESSION_SECRET`.
  `createSession()` in `lib/auth.ts` sets the cookie `secure` flag from `x-forwarded-proto`
  (works over plain HTTP with no TLS, and becomes Secure automatically behind an HTTPS proxy;
  can be forced via the `COOKIE_SECURE` env var).
- **RBAC — three layers**:
  1. `middleware.ts` + `lib/rbac.ts` `ROUTE_ROLES` gate page access.
  2. Pages call `requireRole([...])`.
  3. Server actions call `guardRole([...])`, and `canMutateClient()` enforces ownership
     (operators are limited to their assigned clients). **Exception:** `quickCompleteClient`
     (used on `/toldirilmagan`) is intentionally open to **any** staff member, but still audited.
- **Installers ("usta")** — role `INSTALLER`, login blocked, managed as contacts in `/ustalar`.
  They act as both field installers and as **integrators** on problem tickets.
- **Conventions**:
  - Never hardcode status strings — use `constants.ts`. New enum values go there.
  - Match existing Uzbek UI wording and the enum labels.
  - Phones display via `formatPhone()` (`+998 90 123 45 67`); the copy button
    (`PhoneCopyButton`) copies the canonical, space-free form `+998901234567`.

---

## 8. Deployment (production)

- **Host** — AWS EC2 (region `eu-central-1` / Frankfurt), Ubuntu, Docker Compose. Reached via a
  stable **Elastic IP: `63.186.96.174`**. Currently **HTTP only**; HTTPS is pending a real domain
  (planned: domain A-record → Elastic IP → **Caddy** for automatic TLS, which also makes cookies
  Secure automatically).
- **Registry-based deploy (current model)** — `.github/workflows/deploy.yml` builds the Docker
  image on every push to `main` and pushes it to **`ghcr.io/abdulloh1623/tp_automation:latest`**.
  `docker-compose.yml` references the **image** (not `build:`), so the **server only pulls** — it
  never builds. Server deploy = `scripts/deploy-pull.sh` (`git pull` config, then
  `docker compose pull && up -d`), run by a cron every ~3 minutes.
  *Reason:* running `next build` on the small 2 GB server caused **out-of-memory freezes**.
- **Services** (one image serves all app code): `postgres`; `migrate` (runs
  `prisma migrate deploy` once); `app` (Next.js, published as `${APP_PORT:-80}:3100`);
  `worker` (`npm run bot`). Volumes: `pgdata`, `uploads` (receipts — PII), `backups`.
- **Migrations** apply automatically via the `migrate` service on each `up -d`. To add a schema
  change: edit `prisma/schema.prisma`, add `prisma/migrations/<timestamp>_<name>/migration.sql`
  (hand-written SQL matching Prisma's format is fine), run `prisma generate`, and commit.
- **Create the first admin**: `docker compose run --rm app npm run create-admin`.
- **Backups** — the worker's cron runs `pg_dump` (gzip) → local `/app/backups` + Telegram.

---

## 9. CI/CD and contribution workflow

- **`.github/workflows/ci.yml`** (Node 22, two jobs):
  1. `build-and-test`: `npm ci` → `prisma generate` → ESLint → `tsc --noEmit` → Vitest → build.
  2. `e2e`: PostgreSQL service → migrate → seed → Playwright.
  ⚠️ Do **not** set `NODE_ENV=production` in the workflow env — it makes `npm ci` skip devDeps.
- **`.github/workflows/deploy.yml`** — builds & pushes the GHCR image on push to `main`.
- **Workflow**: create a feature branch → open a PR → wait for CI green → merge into `main`.
  Never push directly to `main`. PRs are created/merged via the **GitHub REST API** (the `gh` CLI
  is not installed); the token is obtained via `git credential fill`.
- **ESLint**: `react/no-unescaped-entities` is disabled (Uzbek apostrophes). ~15 pre-existing
  warnings are acceptable; the gate is **0 errors**.

---

## 10. Gotchas / hard-won lessons

- **Never run `next build` on the prod server** (2 GB RAM → OOM freeze requiring a stop/start).
  Use the GHCR image and pull. A 2 GB swapfile is configured as a safety net.
- **HTTP + Secure cookies** — Secure cookies are dropped over plain HTTP, causing an infinite
  login loop. Fixed by the protocol-aware `secure` flag (§7). Do not revert to
  `secure: NODE_ENV === 'production'`.
- **Imported CallLogs are back-dated** (`2025-01-01`) so historical imports don't inflate the live
  "talked today" board (analytics only reads current-month CallLogs).
- **Client data is PII** — `_import/`, `uploads/`, `backups/`, `.env`, and DB dumps are
  git-ignored. Never commit them.
- The repo is currently **public** (was needed for an earlier clone; also fine for public GHCR
  pulls). If it is made private, the GHCR pull and any host `git pull` will need auth tokens.

---

## 11. Current production data state

- ~**361 clients** imported from the client's spreadsheets. The chosen source was the Tex
  padderjka "Tolov" sheet (the cleanest — it has person names plus operator attribution).
  Duplicate rows (the same client under two phone numbers) were merged.
- Operator attribution came from `A. / J. / B.` comment prefixes → operators **Abdulla,
  Javohir, Biloliddin**. These operator users must exist for CallLog attribution to link.
- Clients added from the "Klient baza" spreadsheet arrive incomplete (no restaurant/region) and
  appear under **/toldirilmagan** for staff to complete.

---
*The business and UI are Uzbek. When unsure about wording or workflow, match existing pages
(e.g. `/lidlar`, `/eskalatsiya`) and the enum labels in `src/lib/constants.ts`.*
