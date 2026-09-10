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
| 2 | Exam creation, syllabus tree, subject/topic CRUD, templates | ✅ Done |
| 3 | Four-state progress tracking and dashboard rollups | ✅ Done |
| 4 | Adaptive revision engine (1 → 3 → 7 → 15 → 30 days) | ✅ Done |
| 5 | Focus timer that logs sessions against topics | ✅ Done |
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

## Syllabus model

`exam -> subject -> topic`, where **topics nest into themselves** via
`parentTopicId`, so a syllabus can go Subject → Topic → Sub-topic to any depth
without a second table. Progress fields live on the topic row rather than a join
table, because a topic already belongs to exactly one user through its exam.

Prisma cannot express an arbitrary-depth self-relation in one query, so
`getExamTree` fetches a subject's topics **flat** and nests them in JavaScript.
One round trip, and depth-agnostic.

### Ownership

Every syllabus route runs through `assertExamOwned` / `assertSubjectOwned` /
`assertTopicOwned` in `server/src/utils/ownership.ts`, which re-derive the owner
by walking back to `exam.userId`. They return **404, not 403**, for a row owned
by someone else: a 403 would confirm the id exists and leak the shape of other
students' data.

### Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/templates` | Built-in syllabi with subject/topic counts |
| GET | `/api/exams` | Exam list with countdown and counts |
| POST | `/api/exams` | Create, optionally cloning a template |
| GET | `/api/exams/:examId` | Full subject/topic tree plus status stats |
| PATCH / DELETE | `/api/exams/:examId` | Update or delete an exam |
| POST | `/api/exams/:examId/subjects` | Add a subject |
| POST | `/api/exams/:examId/subjects/reorder` | Reorder subjects |
| PATCH / DELETE | `/api/subjects/:subjectId` | Update or delete a subject |
| POST | `/api/subjects/:subjectId/topics` | Add a topic or sub-topic |
| PATCH / DELETE | `/api/topics/:topicId` | Update or delete a topic |

Topic `status` is deliberately **not** patchable here. Marking a topic complete
has to seed the revision ladder, so that gets its own endpoint in Phase 4
instead of riding along on a generic update.

## Syllabus upload

A third way to build a syllabus, alongside the templates and manual entry:
upload the exam board's PDF, or a photo of a printed syllabus.

**The file is never stored.** Render's free filesystem is recreated on every
deploy, so a saved upload would vanish without warning. The upload is parsed in
memory with `multer.memoryStorage()` and discarded; what persists is the
**extracted text**, in `syllabus_imports`. That is the part with lasting value -
it can be re-parsed, searched, or handed to the AI layer in Phase 8 without
asking the student to upload the file again.

| Input | How text is recovered |
|-------|----------------------|
| PDF with a text layer | `unpdf`, instant |
| PNG / JPEG / WebP | `tesseract.js` OCR, a few seconds |
| Scanned PDF | Rejected with a message telling the student to photograph the page instead - a scan is an image wrapped in a PDF and has no text to read |

`parseSyllabus` then proposes a subject/topic tree. Two document shapes have to
work, and they are structurally different:

- **Bulleted** (SSC, Kerala PSC): one topic per line under a heading.
- **Prose** (GATE, UPSC): paragraphs of the form `Label: item, item. Label: item`,
  wrapped at the page margin.

The prose shape is the reason the parser rejoins lines before doing anything
else. A PDF breaks a sentence wherever the page runs out, so treating each
physical line as an item shreds one sentence into four topics and mistakes any
fragment ending in a colon - `Graphs:` - for a heading. A line of at least 60
characters is assumed to have wrapped and is joined to the next; deliberately
short lines (list items, headings) fall below that and stay separate.

After unwrapping:

1. `Section 1: ...`, `Paper II - ...` and ALL CAPS banners are subjects.
2. Inside a section, `Discrete Mathematics:` names a **topic**, and its comma
   list becomes that topic's **sub-topics**.
3. With no section above it, a label is the subject itself - so
   `Quantitative Aptitude: Number System, Percentage` still works standalone.
4. A bulleted or numbered line is always a topic, never a heading.
5. Parentheticals survive splitting: `(ARP, DHCP, ICMP)` stays one item.
6. Page furniture (`Page 2 of 5`, dotted contents leaders, `*Note:` footnotes)
   is discarded, and anything unplaced is reported rather than silently dropped.

The rules are heuristics, so the student **always reviews before anything is
written**. In the preview, one topic per line and two leading spaces makes a
line a sub-topic.

Applying an import **merges subjects by name**, case-insensitively, and skips
topics that already exist. Importing Paper 1 and Paper 2 separately would
otherwise split a shared subject in two.

> On Render's free tier the OCR language data is re-downloaded after a cold
> start, because the disk is ephemeral. The first image upload after the service
> wakes is therefore slower than later ones. PDFs are unaffected.

## Study timer

A session is a **server-side record**, not a browser timer. `POST /api/sessions`
stores `startedAt`; the page derives the countdown from it. Closing the tab or
reloading mid-session therefore loses nothing - `GET /api/sessions/active`
recovers it. A purely client-side timer would throw away forty minutes of work
on an accidental refresh.

Only one session can run at a time; starting a second returns 409 rather than
silently orphaning the first.

### Why the recorded duration is negotiated

The client reports the seconds it counted as focused, excluding pauses and
breaks. The server records `min(reported, actualElapsed, 6 hours)`.

That combination is deliberate. Trusting the client alone would make the figure
trivially inflatable. Trusting wall-clock elapsed alone would count a laptop
left open overnight as ten hours of study and poison every analytic built on it.
So the client can only ever revise the number **down** from real elapsed time,
and a forgotten session is capped rather than believed.

Pause and break state is intentionally client-local: it is lost on reload, and
the timer then resumes from true elapsed time. Persisting it would mean trusting
a client-reported pause across a session the server cannot observe.

### The link that makes it worth having

Finishing a session asks **"did you complete this topic?"**, and the answer
drives the rest of the app:

| Answer | Effect |
|--------|--------|
| Yes | Topic marked complete **and its five revisions seeded**, exactly as marking it complete in the syllabus does |
| Partially / Not yet | A `NOT_STARTED` topic becomes `Learning`; an already-finished topic is never demoted |
| (any) | Minutes added to `totalStudyMinutes`, `lastStudiedAt` stamped |

That is what separates this from a stopwatch: measured time lands on the
syllabus, and finishing a topic starts its revision ladder without a second
trip to another screen.

## Revision engine

Marking a topic **Revision due** seeds a ladder of five revisions at **1, 3, 7,
15 and 30 days**. Expanding gaps are the point of spaced repetition: each
successful recall buys a longer wait before the next attempt.

### What makes it adaptive

Rating a revision **Easy / Moderate / Difficult** rescheduses everything still
ahead, by scaling the *remaining gaps* rather than recomputing from scratch:

| Verdict | Multiplier | Ladder after rating stage 1 today |
|---------|-----------|-----------------------------------|
| Easy | ×1.5 | +3, +9, +21, +44 days |
| Moderate | ×1.0 | +2, +6, +14, +29 days |
| Difficult | ×0.5 | +1, +3, +7, +15 days |

Scaling the gaps keeps the ladder expanding, so rating one revision Difficult
pulls the next one closer without collapsing the schedule into a cluster of
same-day repeats. Every interval is floored at one day, so "Difficult" can never
schedule a revision for the day it was just done.

This is a single multiplier rather than a full SM-2 ease factor on purpose: the
student can be told in one sentence why a topic came back sooner, which matters
more here than a marginally better retention curve.

Two deliberate refusals to lose work:

- **Overdue revisions never expire.** A missed revision is exactly the thing the
  student most needs back, so it stays in the due list and reports how late it is.
- **Skip reschedules to tomorrow rather than deleting.** A skipped revision that
  vanished would quietly shorten the ladder.

Rating the **final** stage Difficult earns one more pass instead of graduating
the topic — finishing on the student's weakest note would be the wrong signal.
Only when nothing is left pending does the topic become **Well revised**.

### Dates are calendar days, not elapsed hours

A revision due "tomorrow" means the student's tomorrow. Every scheduled date is
stored as UTC midnight of the target calendar day and compared against the
student's local day (`user.timezone`, default `Asia/Kolkata`). Storing a
wall-clock instant would make revisions arrive on the wrong side of midnight for
anyone east of UTC, which is everyone this app is built for.

### Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/revisions/due` | Due today or overdue, across exams |
| GET | `/api/exams/:examId/revisions/upcoming` | Workload for the next N days |
| POST | `/api/revisions/:id/complete` | Record a verdict and reschedule |
| POST | `/api/revisions/:id/skip` | Push to tomorrow |

## Progress model

Topic status is deliberately **not** binary. Each state carries partial credit:

| Status | Weight |
|--------|--------|
| Not started | 0 |
| Learning | 0.5 |
| Completed - revision due | 0.8 |
| Well revised | 1.0 |

Done/not-done would report a student who has *learned every topic but revised
none* as 0%, which is both wrong and demoralising. Partial credit makes the
number move as work happens, and makes revision visibly worth doing: finishing
the ladder is the difference between 0.8 and 1. The table lives in
`server/src/modules/progress/statusWeight.ts`, shared by the syllabus tree and
the rollups so neither can drift.

Two percentages are reported, and they answer different questions:

- **`completionPercent`** - how much of the syllabus is covered, topic by topic.
- **`weightedReadiness`** - the same, weighted by each subject's share of the
  paper. A student can be 70% through the syllabus while weak on the subject
  carrying half the marks, and only this number shows it.

Status changes go through `PATCH /api/topics/:id/status` rather than the generic
topic update, because a transition has side effects: it stamps `completedAt`,
`lastStudiedAt` and `lastRevisedAt`, and Phase 4 will seed the revision ladder
from the same place. Re-marking an already-completed topic preserves the
original `completedAt`, so revision does not rewrite history.

`GET /api/exams/:examId/progress` returns per-subject rollups plus the pace
figures the dashboard turns into plain sentences: how many topics remain, how
many were completed but never revised, how many are marked difficult, and
whether the student's stated daily hours are enough for the days left.

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

> The Render free tier spins the API down after ~15 minutes of inactivity. The
> first request afterwards took **52.9 seconds** when measured. Warm the API up
> before a live demo or viva by opening its `/api/health` URL.

### `VITE_API_BASE_URL` and Render's `property: host`

Render's blueprint spec offers `fromService.property: host`, and despite the
name it resolves to just the **service name** - `examprep-api-t3p8` - not a
hostname. Prefixing a scheme gives `https://examprep-api-t3p8`, which fails DNS
and reaches the app as a response-less network error: indistinguishable from the
API being down, while the API is in fact perfectly healthy.

`normaliseBaseURL` in `client/src/lib/api.ts` therefore appends `.onrender.com`
to any dotless hostname, and logs the resolution in development. If you ever put
the API behind a custom domain, drop the `fromService` block and set
`VITE_API_BASE_URL` to the full URL instead.

### Cold starts and CORS

This one is worth understanding, because the symptom lies. While a free instance
wakes, Render answers with its own holding response, which carries **no CORS
headers**. The browser blocks it, and the browser then reports a CORS failure to
JavaScript as an indistinguishable network error - no status code at all. So a
sleeping API looks exactly like a dead API, and `/api/health` opened directly in
a tab still works fine, because a top-level navigation is not subject to CORS.

The client handles it rather than blaming the server: `client/src/lib/api.ts`
retries response-less failures on a 2s / 5s / 10s / 15s ladder, and
`WakingBanner` explains the wait. Only after all retries fail does it report a
real error.

### Why the build command carries `--include=dev`

The API sets `NODE_ENV=production`, and Render applies service environment
variables during the **build** as well as at runtime. npm reads `NODE_ENV` and
silently switches to `--omit=dev`, which strips 183 packages here - `typescript`,
`prisma`, `tsx` and `vite` among them - so `npm ci && npm run build` fails with
missing binaries. `npm ci --include=dev` restores them. Keep the flag if you ever
rewrite these commands.
