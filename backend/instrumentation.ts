/**
 * Next.js instrumentation file — runs once at server startup.
 *
 * active_games TTL cleanup is handled by a pg_cron job in Supabase
 * (jobid 2, schedule: '0 * * * *') which deletes rows older than 24 hours.
 * No application-level cleanup is needed.
 */
export async function register() {}
