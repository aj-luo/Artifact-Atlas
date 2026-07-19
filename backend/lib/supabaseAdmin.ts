import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — avoids reading env vars at module parse time (e.g. during next build).
// Uses the service role key so it can send broadcast messages server-side.
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client — no NEXT_PUBLIC_ prefix.
let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _admin;
}
