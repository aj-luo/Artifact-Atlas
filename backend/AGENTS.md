# Agent instructions — Artifact Atlas backend

This document governs **AI coding agents** working in this repository. Treat the codebase as maintained by **senior engineers**: prioritize correctness, security, clarity, and **data safety** over speed or clever shortcuts.

## Senior-developer bar

- **Minimal, purposeful diffs.** Change only what the task requires. No drive-by refactors, no unrelated formatting sweeps, no new dependencies without strong justification.
- **Read before you write.** Match existing patterns in `app/api`, naming, error handling, and Prisma usage.
- **Own the consequences of schema and API changes.** Migrations and public HTTP contracts affect other clients and environments; document breaking changes when they are unavoidable.
- **Verify when you can.** Run `npx tsc --noEmit` after substantive TypeScript edits. Prefer failing fast with clear HTTP status codes and messages over silent corruption.

## Environment

- Copy `.env.example` to `.env.local` and fill Supabase / Postgres values. Never commit secrets.
- Prisma uses `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) as in `.env.example`.

## Stack (orientation)

- **Next.js** (App Router) — HTTP handlers live under `app/api/**/route.ts`.
- **Prisma** — `prisma/schema.prisma`, client imported from `@/lib/db`.
- **PostgreSQL** — typically Supabase-hosted; connection strings in env.

---

## Database safety — non-negotiable

**You must not drop, truncate, or destroy existing database tables or bulk data** unless a human explicitly instructs that operation for a specific maintenance window **and** you have confirmed backups and scope.

This includes, without exception:

- No **`DROP TABLE`**, **`TRUNCATE`**, or destructive DDL aimed at removing live tables.
- No **`prisma migrate reset`** against any database that is shared, staging, or production (it drops the database).
- No **`prisma db push --accept-data-loss`** (or equivalent flags) without explicit human approval.
- No removing Prisma **`model`** blocks from `schema.prisma` as a shortcut to “clean up” — that can generate migrations that **drop** underlying tables and **delete data**.

**Preferred approach:** additive, backward-compatible migrations (new tables/columns/indexes, nullable columns first, backfill, then tighten). If a model or table appears unused, **flag it for humans**; do not unilaterally delete schema or data.

### Tables represented in `prisma/schema.prisma` (do not casually remove)

These models map to PostgreSQL tables. Treat them as **persistent assets** unless product owners sign off on a formal deprecation and migration plan:

| Model | Notes |
|--------|--------|
| `DistMatrix` | Composite key `iso_o` + `iso_d`; distance / language / colonial attrs. |
| `MetObjects` | Museum object metadata; relates to `game_status`. |
| `game_status` | Game result rows; FK to `MetObjects`. |
| `iso_code_mapping` | ISO / region metadata. |
| `country_city_locations` | Marked `@@ignore` in Prisma; table may still exist — **do not assume it is safe to drop.** |

**Application tables (used by `app/api`):** Route handlers call `db.artifact` and `db.gameSession`. Whatever PostgreSQL tables back those models (naming may follow Prisma defaults such as `Artifact` / `GameSession`) **must not be dropped** as part of cleanup or schema churn. Keep `schema.prisma` aligned with reality; do not delete models to “fix” drift if that would generate a migration that drops live tables.

If additional models appear in `schema.prisma` over time, the same rules apply: **never drop those tables from migrations** without explicit human instruction.

---

## API routes

Handlers are colocated with their path: e.g. `app/api/game/new/route.ts` → `POST /api/game/new`. Discover endpoints by listing `app/api/**/route.ts` or searching for `export async function GET|POST|…`.

---

## Prisma workflow (safe defaults)

1. After editing `schema.prisma`, prefer **`prisma migrate dev`** in development with a migration name that describes the **additive** change.
2. Do not commit migrations that only exist to **delete** tables/columns unless that deletion is an approved, documented step.
3. Regenerate the client when needed: `npm run db:generate`.

---

## Related material

- Optional Postgres / Supabase guidance may live under `.agents/skills/` in this repo; use it when relevant, but **this file’s database rules override** generic suggestions that imply destructive resets.
