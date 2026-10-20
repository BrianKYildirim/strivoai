import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';

serve((req) => withCors(req, 'user', async () => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user' });
  }

  try {
    // Verify admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
      );
    }

    // Only allow admins or sending to own email
    const { email: targetEmail, featureType = 'resume', score = 85 } = await req.json();
    const sendTo = targetEmail || user.email;

    // Check if user is admin
    const serviceClient = getServiceClient();
    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    const isAdmin = !!roleData;
    
    // Non-admins can only send to their own email
    if (!isAdmin && sendTo !== user.email) {
      return new Response(
        JSON.stringify({ error: 'Can only send test email to your own address' }),
        { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending test email to:', sendTo, 'Feature:', featureType);

    const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';

    // Get user's profile for name
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Send test email via the send-feature-email function
    const emailPayload = {
      to: sendTo,
      userName: profile?.full_name || undefined,
      featureType,
      score,
      resultsUrl: `${APP_URL}/results/test-123`,
      summaryLine: 'This is a test email to verify your Strivo email notifications are working correctly.',
    };

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
      );
    }

    // Generate email HTML inline for test
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Email - Strivo AI</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; text-align: center;">
          <h1 style="color: white; font-size: 28px; font-weight: 700; margin: 0;">🧪 Test Email</h1>
          <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 8px 0 0 0;">Email Configuration Test</p>
        </div>
        
        <div style="padding: 32px;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">Hi${profile?.full_name ? ' ' + profile.full_name : ''},</p>
          <p style="color: #4b5563; font-size: 16px; margin: 0 0 24px 0;">
            ✅ Your Strivo AI email notifications are working correctly!
          </p>
          
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="color: #166534; font-size: 14px; margin: 0;">
              <strong>Test Details:</strong><br>
              • Feature Type: ${featureType}<br>
              • Sample Score: ${score}/100<br>
              • Sent from: support@strivoai.net<br>
              • Timestamp: ${new Date().toISOString()}
            </p>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 32px; border-radius: 8px;">
              Visit Strivo AI →
            </a>
          </div>
        </div>
        
        <div style="background: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px; margin: 0;">
            — Strivo AI · Smart resume analysis & career insights · 
            <a href="https://strivoai.net" style="color: #667eea; text-decoration: none;">strivoai.net</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "Strivo AI <support@strivoai.net>",
        reply_to: "support@strivoai.net",
        to: [sendTo],
        subject: "🧪 Test Email - Strivo AI Notifications",
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to send: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
      );
    }

    const resendData = await response.json();
    console.log('Test email sent successfully:', resendData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailId: resendData.id,
        sentTo: sendTo,
        message: `Test email sent successfully to ${sendTo}` 
      }),
      { status: 200, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in test-email:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send test email' }),
      { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
    );
  }
}));
