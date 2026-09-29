export function normalizeSupabaseUrl(value) {
  // Deployment dashboards can preserve quotes pasted from a .env file.
  const cleaned = (value ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
  try {
    const url = new URL(cleaned);
    if (!['https:', 'http:'].includes(url.protocol) || /["'\s]/.test(cleaned) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL. Check the deployment environment and rebuild.');
  }
}
