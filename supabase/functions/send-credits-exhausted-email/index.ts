import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getServiceRoleKey();
    const supabase = getServiceClient();

    // Get user info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if we already sent this email recently (within 24 hours)
    const { data: recentEmail } = await supabase
      .from('scheduled_emails')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'credits_exhausted')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recentEmail && recentEmail.length > 0) {
      console.log('Credits exhausted email already sent within 24 hours, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Already sent within 24 hours' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send the email
    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-strivo-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') || '',
      },
      body: JSON.stringify({
        to: profile.email,
        userName: profile.full_name,
        emailType: 'credits_exhausted',
      }),
    });

    const sendResult = await sendResponse.json();

    if (sendResult.success || sendResult.warning) {
      // Record that we sent this email
      await supabase
        .from('scheduled_emails')
        .insert({
          user_id: userId,
          email_type: 'credits_exhausted',
          scheduled_for: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          metadata: { email: profile.email, name: profile.full_name },
        });

      console.log('Credits exhausted email sent to:', profile.email);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: sendResult.emailId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error('Error sending credits exhausted email:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
