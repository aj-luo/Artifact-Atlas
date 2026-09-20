import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupabaseUrl } from './supabaseUrl.js';

test('cleans dashboard quoting before Realtime constructs its websocket URL', () => {
  const base = 'https://example.supabase.co';
  for (const value of [base, `${base}"`, `"${base}"`, ` '${base}/' `]) {
    assert.equal(normalizeSupabaseUrl(value), base);
  }
  assert.equal(normalizeSupabaseUrl('http://localhost:54321/'), 'http://localhost:54321');
});

test('rejects malformed configuration without exposing its value', () => {
  for (const value of [undefined, '', 'example.supabase.co', 'https://example.supabase.co"/realtime', 'ftp://example.com', 'https://user:secret@example.com']) {
    assert.throws(() => normalizeSupabaseUrl(value), { message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL. Check the deployment environment and rebuild.' });
  }
});
