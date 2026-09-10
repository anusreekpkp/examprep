# ExamPrep — Competitive Exam Preparation & Revision Management System

A decision-support tool for students preparing for PSC, SSC, UPSC, Banking and GATE.
It answers the question most study planners ignore: **"what should I study next?"**

Instead of a calendar the student has to fill in, every topic carries a live priority
score derived from exam weight, personal weakness, revision debt and days remaining.

---

## Tech stack

| Layer     | Choice                                              | Why |
|-----------|-----------------------------------------------------|-----|
| Language  | TypeScript everywhere                               | One language across the stack; the scoring engine and ~15 models are far safer typed |
| Frontend  | React 19 + Vite                                     | Fast dev server, tiny static build that Render hosts free |
| Styling   | Tailwind CSS v4                                     | CSS-first config, no separate config file to maintain |
| Data/state| TanStack Query + Zustand                            | Query owns server state and caching; Zustand only for the timer and UI state |
| Charts    | Recharts                                            | Declarative React charts for the analytics module |
| Backend   | Node + Express 5                                    | Minimal, well-understood, easy to explain in a viva |
| ORM       | Prisma 7 (pinned) + `pg` driver adapter             | `schema.prisma` doubles as the ER diagram for the project report |
| Database  | PostgreSQL on Neon                                  | Free tier that does not expire, unlike Render's 30-day free Postgres |
| Auth      | JWT access + refresh tokens, bcrypt hashing         | No third-party auth dependency to explain or pay for |
| Validation| Zod, shared shapes between client and server        | One source of truth for request shapes |
| AI        | Claude API (Phase 8)                                | Used only where it adds value; core logic stays rule-based |
| Hosting   | Render (web service + static site)                  | Blueprint in `render.yaml` provisions both from one repo |

**Deliberate choice:** the "intelligence" (priority scoring, spaced repetition, plan
generation) is **rule-based and deterministic**. No model training is required, and
every recommendation can be explained line by line. The LLM is added later, on top.

---

## Repository layout

```
examprep/
├── render.yaml           Render blueprint — provisions API + static site
├── package.json          npm workspace root
├── server/               Express + Prisma API
│   ├── prisma/schema.prisma
│   └── src/
│       ├── config/       env parsing and validation
│       ├── lib/          prisma client singleton
│       ├── middleware/   error handling, auth (Phase 1)
│       ├── modules/      one folder per feature: routes + service + schema
│       └── utils/        ApiError, asyncHandler
└── client/               React + Vite SPA
    └── src/
        ├── components/
        ├── lib/          axios instance, helpers
        └── pages/
```

Feature code lives in `server/src/modules/<feature>/` as a routes + service + schema
trio, so each phase adds a folder rather than editing shared files.

---

## Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Monorepo, TypeScript, Git, Render pipeline, health check | ✅ Done |
| 1 | 14-model Prisma schema, JWT auth with refresh rotation, protected routes | ✅ Done |
| 2 | Exam creation, syllabus tree, subject/topic CRUD, templates | |
| 3 | Four-state progress tracking and dashboard rollups | |
| 4 | Adaptive revision engine (1 → 3 → 7 → 15 → 30 days) | |
| 5 | Focus timer that logs sessions against topics | |
| 6 | Priority scoring — "your next 3 priorities" | |
| 7 | Daily planner, mock test tracker, analytics | |
| 8 | Topic notes, file uploads, AI planner and note generation | |

---

## Local development

**Prerequisites:** Node 20+, a free [Neon](https://neon.tech) Postgres database.

```bash
npm install
cp .env.example server/.env    # then paste your Neon connection string
npm run db:generate
npm run db:migrate
npm run dev
```

### Two pinned-dependency gotchas

Both are already handled in the repo; they are recorded here because they will
bite anyone who upgrades casually.

1. **`prisma` is pinned to an exact `7.10.0`.** npm's `latest` tag for `prisma`
   currently points at `8.0.0-rc.13`, a prerelease whose CLI is an entirely
   different product with no `generate` command. Do not run
   `npm i prisma@latest` until 8.0 is actually stable.
2. **npm 11 blocks dependency install scripts by default.** Prisma downloads its
   schema engine in a `postinstall`, so the root `package.json` carries an
   `allowScripts` block approving `prisma`, `@prisma/engines`, `@prisma/client`
   and `esbuild`. Without it `prisma generate` fails with a missing-engine error.
   Adding a dependency that needs install scripts means running
   `npm approve-scripts <pkg>` and committing the change.

### Prisma 7 differences worth knowing

- The connection URL is **not** in `schema.prisma` any more. It lives in
  `server/prisma.config.ts`, which is also where `.env` gets loaded — Prisma 7
  dropped automatic dotenv loading.
- `PrismaClient` connects through the `@prisma/adapter-pg` driver adapter
  instead of a bundled query engine (see `server/src/lib/prisma.ts`).
- The client is generated into `server/src/generated/prisma`, which is
  gitignored and recreated by `prisma generate` on every build.

### Connection string

Use Neon's **pooled** host (the one containing `-pooler`) and prefer
`sslmode=verify-full` over Neon's default `sslmode=require`. With `node-postgres`
today both verify the certificate, but `pg` v9 will redefine `require` to the
weaker libpq meaning, which skips verification. `verify-full` is explicit and
already verified to work against Neon.

- API → http://localhost:4000 (health check at `/api/health`)
- Web → http://localhost:5173

The Vite dev server proxies `/api` to port 4000, so there is no CORS setup in dev.

### Useful scripts

| Command | Effect |
|---------|--------|
| `npm run dev` | Runs API and web together |
| `npm run dev:server` / `npm run dev:client` | Run one side only |
| `npm run typecheck` | Type-checks both workspaces |
| `npm run db:migrate` | Creates and applies a migration locally |
| `npm run db:studio` | Opens Prisma Studio to browse the database |

---

## Authentication design

Worth understanding before Phase 2 builds on it.

- **Access token** - a JWT, 7 day expiry, returned in the response body and held
  only in memory on the client. Never written to `localStorage`, which any
  injected script can read.
- **Refresh token** - an opaque 48-byte random string, not a JWT, because it has
  to be revocable. Only its SHA-256 hash is stored, so a database leak yields no
  usable tokens. It travels in an `httpOnly` cookie scoped to `/api/auth`.
- **Rotation with reuse detection** - every refresh issues a new token and
  revokes the old one. Tokens from one login share a `familyId`; presenting an
  already-rotated token means a replay or a stolen cookie, so the whole family is
  revoked and every device has to sign in again.
- **Timing-safe login** - a bcrypt comparison runs even when the email does not
  exist, so response time cannot be used to enumerate registered accounts.
- **Rate limiting** - credential endpoints allow 10 attempts per 15 minutes in
  production, which stops the login route being an open guessing oracle.

In production the API and the web app are separate `onrender.com` hosts. Because
`onrender.com` is on the Public Suffix List those count as different sites, so
the refresh cookie is issued with `SameSite=None; Secure`.

### Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/register` | - | Create an account, returns tokens |
| POST | `/api/auth/login` | - | Sign in |
| POST | `/api/auth/refresh` | cookie | Rotate tokens, get a new access token |
| POST | `/api/auth/logout` | cookie | Revoke the whole token family |
| GET | `/api/auth/me` | bearer | Current profile |
| PATCH | `/api/auth/me` | bearer | Update name / timezone |

## Deploying to Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, select the repo. `render.yaml` creates
   `examprep-api` (web service) and `examprep-web` (static site).
3. On `examprep-api`, set `DATABASE_URL` to your Neon **pooled** connection string.
   `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are generated by Render automatically.
4. After the static site gets its URL, set `CORS_ORIGIN` on the API to that URL
   and redeploy the API.

Migrations run automatically on every deploy via `prisma migrate deploy` in the
start command, so schema changes ship with the code that needs them.

> The Render free tier spins the API down after 15 minutes of inactivity. The first
> request afterwards takes ~30 seconds. Worth mentioning before a live demo.

### Why the build command carries `--include=dev`

The API sets `NODE_ENV=production`, and Render applies service environment
variables during the **build** as well as at runtime. npm reads `NODE_ENV` and
silently switches to `--omit=dev`, which strips 183 packages here - `typescript`,
`prisma`, `tsx` and `vite` among them - so `npm ci && npm run build` fails with
missing binaries. `npm ci --include=dev` restores them. Keep the flag if you ever
rewrite these commands.
