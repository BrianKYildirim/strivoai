import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';
import type { Json } from '../_shared/database.types.ts';

/** Narrows a jsonb column to a keyed object (mirrors the isRecord guard used in
 *  _shared/document-persistence.ts). Arrays and scalars are not objects here. */
function isJsonObject(value: Json | null): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'internal' });
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getServiceRoleKey();
  const supabase = getServiceClient();

  try {
    await requireAuth(req, { type: 'internal' });
    console.log('Processing scheduled emails...');

    // Get all pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .is('sent_at', null)
      .is('cancelled_at', null)
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching scheduled emails:', fetchError);
      throw fetchError;
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('No pending emails to process');
      return new Response(
        JSON.stringify({ processed: 0, message: 'No pending emails' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingEmails.length} emails to process`);

    let successCount = 0;
    let errorCount = 0;

    for (const email of pendingEmails) {
      try {
        // `metadata` is a jsonb column, so it is only structurally known to be
        // Json. Narrow to an object before reading fields, and read each field
        // through a typeof guard: a non-string value (or a metadata blob that is
        // an array/scalar) now degrades to `undefined` instead of being
        // interpolated into an email as e.g. "[object Object]".
        const metadata = isJsonObject(email.metadata) ? email.metadata : {};
        const userEmail = typeof metadata.email === 'string' ? metadata.email : undefined;
        const userName = typeof metadata.name === 'string' ? metadata.name : undefined;

        if (!userEmail) {
          console.warn(`No email in metadata for scheduled email ${email.id}, skipping`);
          continue;
        }

        // Build the results URL based on email type
        let resultsUrl: string | undefined;
        const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';
        
        const resumeId = typeof metadata.resume_id === 'string' ? metadata.resume_id : undefined;
        if (email.email_type === 'nudge_24hr' && resumeId) {
          resultsUrl = `${appUrl}/results?resumeId=${resumeId}`;
        } else if (email.email_type === 'career_compass_intro') {
          resultsUrl = `${appUrl}/career-compass`;
        }

        // Send the email using send-strivo-email function
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-strivo-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'x-internal-job-secret': Deno.env.get('INTERNAL_JOB_SECRET') || '',
          },
          body: JSON.stringify({
            to: userEmail,
            userName: userName,
            emailType: email.email_type,
            resultsUrl: resultsUrl,
            metadata: metadata,
          }),
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          console.error(`Failed to send email ${email.id}:`, errorText);
          errorCount++;
          continue;
        }

        const sendResult = await sendResponse.json();
        
        if (sendResult.success || sendResult.warning) {
          // Mark as sent
          const { error: updateError } = await supabase
            .from('scheduled_emails')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', email.id);

          if (updateError) {
            console.error(`Failed to mark email ${email.id} as sent:`, updateError);
          } else {
            console.log(`Successfully sent and marked email ${email.id} (${email.email_type})`);
            successCount++;
          }
        } else {
          console.error(`Email send failed for ${email.id}:`, sendResult.error);
          errorCount++;
        }

      } catch (emailError) {
        console.error(`Error processing email ${email.id}:`, emailError);
        errorCount++;
      }
    }

    console.log(`Processed ${successCount} emails successfully, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        processed: successCount, 
        errors: errorCount,
        total: pendingEmails.length 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error('Error in process-scheduled-emails:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
