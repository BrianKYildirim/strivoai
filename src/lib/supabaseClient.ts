import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Read Vite env vars (Vite exposes them on import.meta.env).
 * Do NOT throw here — return a safe mock if env is missing so the app can render.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

let _supabase: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient | null {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    try {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            /**
             * XDEV-04. The `storage` option is DELIBERATELY ABSENT. Do not add it back,
             * and do not replace it with a hand-rolled adapter.
             *
             * This file used to pass `storage: typeof window !== 'undefined' ? localStorage : undefined`.
             * That `typeof window` guard protects against SSR, not against RESTRICTED
             * STORAGE, and it did two kinds of damage at once:
             *
             *   1. The bare `localStorage` identifier was evaluated at MODULE SCOPE. In
             *      browsers where merely READING the property throws (`SecurityError` —
             *      Chrome with site data blocked, managed/enterprise profiles, some
             *      privacy extensions) the throw aborted the module graph before
             *      `main.tsx` ever rendered: a white screen, no error UI, nothing logged.
             *      Reproduced on 5/5 matrix engines by plan 03-05 (defect XD-01).
             *   2. A truthy `settings.storage` SHORT-CIRCUITS `@supabase/auth-js`. See
             *      `GoTrueClient.js` — `if (settings.storage) { ... } else if (supportsLocalStorage()) { ... } else { memoryLocalStorageAdapter(...) }`.
             *      Passing the option meant auth-js never ran its own memoized
             *      `supportsLocalStorage()` probe (which try/catches BOTH the property
             *      access AND a write-read round trip) and never installed
             *      `memoryLocalStorageAdapter`. Safari private browsing (quota ~0)
             *      therefore degraded into a logout loop / blank page instead of an
             *      in-memory session (defect XD-02).
             *
             * With the option gone, auth-js resolves storage itself and falls back to an
             * in-memory session when storage is unavailable. `src/lib/platform/storage-probe.ts`
             * observes the same condition for capability/diagnostics purposes ONLY — it is
             * never wired into this client.
             */
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            },
        });
    } catch {
        // Construction itself failed (a hostile environment, a throwing global). Fall
        // through to the mock in getSafeClient() rather than throwing during module
        // evaluation, which is the white-screen failure mode this plan exists to close.
        return null;
    }
}

/**
 * getSafeClient returns either a real Supabase client (if envs present)
 * or a minimal mock with safe no-op behaviours so the UI won't crash.
 */
function getSafeClient() {
    if (_supabase) return _supabase;
    const client = createSupabaseClient();
    if (client) {
        _supabase = client;
        return _supabase;
    }

    // Minimal mock: implement the methods your app uses (from, auth.getSession, auth.signInWithOtp).
    // These return shaped responses so callers don't crash.
    // If you need more methods later, add them here.
    // @ts-ignore
    return {
        from: () => ({
            select: async () => ({ data: [], error: new Error('Supabase not configured') }),
            insert: async () => ({ data: null, error: new Error('Supabase not configured') }),
        }),
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            signInWithOtp: async (opts: any) => ({ data: null, error: new Error('Supabase not configured') }),
            signOut: async () => ({ error: new Error('Supabase not configured') }),
        },
    } as unknown as SupabaseClient;
}

export const supabase = getSafeClient();

/** Helpful runtime debug log (will appear in browser console) */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // keep this small and safe — do NOT print the full anon key
    console.warn('Supabase not configured. Define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart Vite.');
} else {
    console.info('Supabase client initialized (partial key):', SUPABASE_ANON_KEY?.slice(0, 8) + '•••');
}