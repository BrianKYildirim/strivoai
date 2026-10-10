import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';

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

interface ApprovalNotificationRequest {
  userEmail: string;
  userName?: string;
  newTier: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });
    const { userEmail, userName, newTier }: ApprovalNotificationRequest = await req.json();
    console.log("Sending upgrade approval notification to:", userEmail);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const tierDisplay = newTier.charAt(0).toUpperCase() + newTier.slice(1);
    const greeting = userName ? `Hi ${userName},` : 'Hi there,';
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
      <!-- Header -->
      <div style="background: ${BRAND.header}; padding: 24px 32px; text-align: center;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px;">
          <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
        </h1>
        <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">${tierDisplay} Activated</p>
      </div>
      <!-- Body -->
      <div style="padding: 36px 32px 32px;">
        <p style="color: ${BRAND.text}; font-size: 16px; font-weight: 500; margin: 0 0 16px;">${greeting}</p>
        <p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
          Your upgrade to <strong style="color: ${BRAND.text};">Strivo ${tierDisplay}</strong> has been approved and activated.
        </p>
        
        <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
          <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 10px;">What's unlocked:</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; 100 AI-powered analyses per month</td></tr>
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Unlimited resume uploads</td></tr>
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Advanced career insights</td></tr>
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Priority job matching</td></tr>
            <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Skills gap analysis</td></tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 32px 0 8px;">
          <a href="${appUrl}/dashboard" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
            Go to Dashboard →
          </a>
        </div>
        
        <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid ${BRAND.border};">
          <p style="color: ${BRAND.text}; font-size: 15px; margin: 0; font-weight: 500;">— The Strivo Team</p>
        </div>
      </div>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">Strivo AI · <a href="${appUrl}" style="color: ${BRAND.accent}; text-decoration: none;">strivoai.net</a></p>
    </div>
  </div>
</body>
</html>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Strivo <onboarding@resend.dev>",
        to: [userEmail],
        subject: `Welcome to Strivo ${tierDisplay}!`,
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log("Approval email sent:", emailData);

    return new Response(JSON.stringify({ success: true, emailData }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("Error sending approval notification:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

serve(handler);
