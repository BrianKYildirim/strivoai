import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimitByKey, createRateLimitResponse } from '../_shared/rate-limiter.ts';

const BRAND = {
  header: '#111827',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  accent: '#4F46E5',
  border: '#E5E7EB',
  cardBg: '#F9FAFB',
  bg: '#F3F4F6',
  logoRed: '#DC2626',
};

interface UpgradeNotificationRequest {
  userEmail: string;
  userName?: string;
  paymentMethod: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'user' });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders({ type: 'user' }) } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders({ type: 'user' }) } });
    }

    // Rate limit: 10 per 15 minutes keyed by user email (D-03, D-05, RATE-05)
    const rl = await checkRateLimitByKey(`auth:${user.email}`, 10, 900);
    if (!rl.allowed) {
      return createRateLimitResponse(rl.retryAfterSeconds, 'user');
    }

    const { userEmail, userName, paymentMethod }: UpgradeNotificationRequest = await req.json();
    console.log("Sending upgrade notification for:", userEmail);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders({ type: 'user' }) } });
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'strivolife@gmail.com';
    const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: ${BRAND.text}; margin: 0; padding: 0; background-color: ${BRAND.bg}; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 580px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid ${BRAND.border};">
      <div style="background: ${BRAND.header}; padding: 24px 32px; text-align: center;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px;">
          <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
        </h1>
        <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">Admin · New Upgrade</p>
      </div>
      <div style="padding: 36px 32px 32px;">
        <p style="color: ${BRAND.textSecondary}; font-size: 15px; margin: 0 0 16px;">A user has upgraded their subscription:</p>
        <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Email:</strong> ${userEmail}</td></tr>
            ${userName ? `<tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Name:</strong> ${userName}</td></tr>` : ''}
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Payment:</strong> ${paymentMethod}</td></tr>
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Time:</strong> ${new Date().toLocaleString()}</td></tr>
          </table>
        </div>
        <p style="color: ${BRAND.textMuted}; font-size: 14px;">Payment was confirmed by the current payment processor. The account has been automatically upgraded.</p>
        <div style="text-align: center; margin: 28px 0 8px;">
          <a href="${appUrl}/admin/usage" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
            View Admin Panel
          </a>
        </div>
      </div>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">Strivo AI · Admin Notification</p>
    </div>
  </div>
</body>
</html>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Strivo <onboarding@resend.dev>",
        to: [adminEmail],
        subject: "New Upgrade Request - Strivo",
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, emailData }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders({ type: 'user' }) } });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders({ type: 'user' }) } });
  }
};

serve((req) => withCors(req, 'user', () => handler(req)));
