# Gemini CLI — Artifact Atlas Mandates

This document governs the behavior and engineering standards for Gemini CLI when working in the Artifact Atlas repository. These mandates take absolute precedence over general defaults.

## Project Architecture
- **Frontend (`/artifact-atlas`):** Next.js application (React 19). Focuses on UI and interactive components (Globe, Sliders).
- **Backend (`/backend`):** Next.js API-only application (TypeScript). Focuses on business logic, Prisma ORM, and database interactions.

## Core Engineering Standards (Senior-Developer Bar)
- **Minimal, Purposeful Diffs:** Change ONLY what the task requires. No "drive-by" refactors, unrelated formatting, or new dependencies without justification.
- **Read Before Write:** Always analyze existing patterns in `app/api`, naming conventions, error handling, and Prisma usage before implementation.
- **TypeScript First:** In the `/backend` directory, maintain strict type safety. Run `npx tsc --noEmit` after substantive edits.
- **Validation:** Every change must be verified. For bug fixes, reproduce the failure with a test case first. For features, add automated tests to ensure correctness.

## Database Safety (Non-Negotiable)
**You must NOT drop, truncate, or destroy existing database tables or bulk data.**
- No `DROP TABLE`, `TRUNCATE`, or destructive DDL.
- No `prisma migrate reset` on shared, staging, or production databases.
- No `prisma db push --accept-data-loss` without explicit human approval.
- No removing `model` blocks from `schema.prisma` as a shortcut; this can generate migrations that drop tables.
- **Preferred Approach:** Use additive, backward-compatible migrations (new tables/columns/indexes).

## Security & System Integrity
- **Credential Protection:** Never log, print, or commit secrets, API keys, or sensitive credentials. Rigorously protect `.env` files.
- **Source Control:** Do not stage or commit changes unless specifically requested by the user.

## Workflows
1. **Research:** Map the codebase and validate assumptions using `grep_search` and `read_file`.
2. **Strategy:** Share a concise summary of the implementation plan and testing strategy.
3. **Execution (Plan -> Act -> Validate):** Apply surgical changes and verify them immediately. Use project-specific tools like `prisma generate` or `tsc` as needed.

## Tech Stack Specifics
- **Next.js (App Router):** Route handlers in `app/api/**/route.ts`.
- **Prisma:** Client imported from `@/lib/db`.
- **Styling:** Adhere to existing Vanilla CSS or CSS Module patterns.
