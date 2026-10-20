import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './database.types.ts';

// Module-level singleton — created once per warm worker, reused across all
// requests on that worker. This avoids the overhead of re-initialising the
// client (URL parsing, auth setup, header config) on every invocation.
//
// Connection pooling note: supabase-js communicates with Supabase via HTTP
// (PostgREST / GoTrue / Storage). Postgres connection pooling at the
// infrastructure level is handled by Supabase's built-in PgBouncer.
// For any future direct Postgres access, set SUPABASE_DB_URL to the
// Transaction-mode pooler URL (port 6543).
let _serviceClient: SupabaseClient<Database> | null = null;

export function getServiceClient(): SupabaseClient<Database> {
  if (!_serviceClient) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    _serviceClient = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serviceClient;
}

/**
 * Returns the raw SUPABASE_URL string for constructing fetch() URLs
 * to other edge functions. Use getServiceClient() for database operations.
 */
export function getSupabaseUrl(): string {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new Error('SUPABASE_URL not configured');
  return url;
}

/**
 * Returns the raw SUPABASE_SERVICE_ROLE_KEY string for Authorization
 * headers in function-to-function calls. Use getServiceClient() for
 * database operations.
 */
export function getServiceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return key;
}
