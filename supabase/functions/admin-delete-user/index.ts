import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
// TODO Phase 43: GDPR export should use readWithArchiveFallback when including archived AI response payloads
// import { readWithArchiveFallback } from '../_shared/archive-reader.ts';

const log = createLogger('admin-delete-user');

serve((req) => withCors(req, 'user', async () => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'user' });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const { userId: targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();

    // Validate caller
    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
    const caller = callerData?.user;
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    // Admin check (server-side)
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .limit(1);

    if (roleError || !roleRows || roleRows.length === 0) {
      return new Response(JSON.stringify({ error: "Admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    if (caller.id === targetUserId) {
      return new Response(JSON.stringify({ error: "You can't delete your own account" }), {
        status: 400,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    // ── Single converged deletion flow ─────────────────────────────────────────────
    // DB rows are removed by ON DELETE CASCADE FKs to auth.users (migration
    // 20260719120000) and Storage object METADATA is removed by the auth.users BEFORE
    // DELETE trigger (migration 20260719120001) -- BOTH fire from
    // auth.admin.deleteUser below, so the admin panel and the Supabase-Auth-dashboard
    // paths share one cleanup mechanism. The ONLY app-side step here is a best-effort
    // physical Storage byte sweep (byte reclamation, not correctness-critical): it is
    // log-and-continue and never blocks the delete.

    // Best-effort resume file byte sweep (by {user_id}/ path). Rows still exist here;
    // the cascade deletes them when auth.admin.deleteUser fires.
    try {
      const { data: resumeFiles } = await supabase
        .from("resumes")
        .select("file_path")
        .eq("user_id", targetUserId);

      if (resumeFiles?.length) {
        const paths = resumeFiles
          .map((r: any) => r.file_path)
          .filter(Boolean)
          .map((p: string) => (p.startsWith(`${targetUserId}/`) ? p : `${targetUserId}/${p}`));

        if (paths.length) {
          const { error: remErr } = await supabase.storage.from("resumes").remove(paths);
          if (remErr) log.warn('resumes-remove-failed', { error: remErr.message, user_id: targetUserId });
        }
      }
    } catch (e) {
      log.error('resumes-byte-sweep-failed', { error: String(e), user_id: targetUserId });
    }

    // Best-effort ai-archives byte sweep. Paginated list with offset loop until
    // data.length < pageSize. Tables that can have ai-archives objects match
    // lifecycle-archive-writer DATA_CLASSES.
    try {
      const tables = ['resumes', 'linkedin_grades', 'analysis_results', 'analysis_cache', 'interview_quizzes', 'interview_quiz_answers', 'profiles'];
      const allPaths: string[] = [];
      for (const tbl of tables) {
        let offset = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error: listErr } = await supabase.storage
            .from('ai-archives')
            .list(`${targetUserId}/${tbl}/`, { limit: pageSize, offset });
          if (listErr || !data || data.length === 0) break;
          allPaths.push(...data.map((f: { name: string }) => `${targetUserId}/${tbl}/${f.name}`));
          if (data.length < pageSize) break;
          offset += pageSize;
        }
      }
      if (allPaths.length > 0) {
        // Bulk remove in chunks of 1000 (Storage API limit per call)
        for (let i = 0; i < allPaths.length; i += 1000) {
          const chunk = allPaths.slice(i, i + 1000);
          const { error: remErr } = await supabase.storage.from('ai-archives').remove(chunk);
          if (remErr) log.warn('ai-archives-remove-batch-failed', { error: remErr.message, batchStart: i });
        }
      }
      log.info('ai-archives-cascade-completed', { user_id: targetUserId, objectsRemoved: allPaths.length });
    } catch (e) {
      // Decision: log + continue (do not block account deletion over Storage hiccup).
      // Orphan Storage objects are an acceptable risk vs. a permanently blocked delete.
      log.error('ai-archives-cascade-failed', { error: String(e), user_id: targetUserId });
    }

    // Convergence point: deleting the auth.users row fires the ON DELETE CASCADE FKs
    // (all user-owned rows) + the on_auth_user_deleted trigger (Storage metadata) --
    // the identical mechanism the Supabase-Auth-dashboard path uses.
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) {
      console.error("Failed deleting auth user:", deleteAuthError);
      return new Response(JSON.stringify({ error: "Failed to delete user" }), {
        status: 500,
        headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("admin-delete-user error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" },
    });
  }
}));
