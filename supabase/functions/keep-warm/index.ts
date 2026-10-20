import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { getSupabaseUrl } from '../_shared/supabase-client.ts';

// User-facing functions that benefit from staying warm.
// Email/webhook/admin functions are excluded — they're triggered by events,
// not user-facing latency-sensitive requests.
const WARM_FUNCTIONS = [
  'analyze-resume',
  'analyze-career',
  'grade-linkedin',
  'submit-resume-analysis-job',
  'submit-career-analysis-job',
  'get-analysis-job-status',
  'ocr-pdf',
  // Both sit on the onboarding submit critical path and were previously absent here, so
  // every onboarding paid their cold start. Measured in prod edge logs (quick 260805-8ni):
  // begin-feature-run preflight 1267ms cold vs 218ms warm; validate-document 976ms cold.
  // Warm preflights across this list sit at ~200-230ms.
  'validate-document',
  'begin-feature-run',
];

// keep-warm is a scheduler-only endpoint: its sole caller is the `keep-warm-ping`
// pg_cron job, which authenticates server-to-server with the Vault-stored
// internal_job_secret (x-internal-job-secret header) — NOT a browser/user JWT.
// It must therefore use internal auth (mirrors extract-analysis-structure and the
// reaper). Using type:'user' here made every cron ping 401 (missing-bearer), since
// pg_net never carries a Supabase user session. CORS is dropped (type:'internal'
// returns {}) because there is no browser origin to reflect.
serve((req) => withCors(req, 'internal', async () => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });
  } catch (err) {
    if (err instanceof Response) throw err;
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = getSupabaseUrl();

  const baseUrl = `${supabaseUrl}/functions/v1`;
  const results: Record<string, { status: number; ms: number } | { error: string; ms: number }> = {};

  // Fire all pings concurrently. Each ping sends an OPTIONS request which is
  // the cheapest way to wake the function without triggering any business logic.
  const pings = WARM_FUNCTIONS.map(async (fn) => {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/${fn}`, {
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' },
      });
      results[fn] = { status: res.status, ms: Date.now() - start };
    } catch (err) {
      results[fn] = { error: String(err), ms: Date.now() - start };
    }
  });

  await Promise.all(pings);

  const warmed = Object.keys(results).length;
  const failed = Object.values(results).filter((r) => 'error' in r).length;

  console.log(`keep-warm: pinged ${warmed} functions, ${failed} failed`, JSON.stringify(results));

  return new Response(
    JSON.stringify({ warmed, failed, results }),
    { status: 200, headers: { ...corsHeaders({ type: 'internal' }), 'Content-Type': 'application/json' } },
  );
}));
