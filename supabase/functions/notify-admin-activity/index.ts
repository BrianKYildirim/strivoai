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

interface ActivityNotificationRequest {
  activityType: 'new_signup' | 'upgrade_request' | 'analysis_complete';
  userEmail: string;
  userName?: string;
  details?: Record<string, any>;
}

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'strivolife@gmail.com';

function buildAdminEmail(headerLabel: string, bodyHtml: string, ctaText: string, ctaUrl: string): string {
  return `
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
        <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">${headerLabel}</p>
      </div>
      <div style="padding: 36px 32px 32px;">
        <div style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7;">
          ${bodyHtml}
        </div>
        <div style="text-align: center; margin: 28px 0 8px;">
          <a href="${ctaUrl}" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
            ${ctaText}
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
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { activityType, userEmail, userName, details }: ActivityNotificationRequest = await req.json();
    console.log(`Processing ${activityType} notification for ${userEmail}`);

    const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';
    let subject = "";
    let headerLabel = "";
    let bodyHtml = "";
    let ctaText = "View Admin Panel";
    let ctaUrl = `${appUrl}/admin/usage`;

    const infoBox = (rows: string) => `
      <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
      </div>
    `;

    const row = (label: string, value: string) =>
      `<tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">${label}:</strong> ${value}</td></tr>`;

    switch (activityType) {
      case 'new_signup':
        subject = `New Strivo Signup: ${userEmail}`;
        headerLabel = 'Admin · New Signup';
        bodyHtml = `
          <p>A new user has signed up for Strivo:</p>
          ${infoBox(
            row('Email', userEmail) +
            (userName ? row('Name', userName) : '') +
            row('Time', new Date().toLocaleString())
          )}
          <p>They will receive a welcome email with onboarding information.</p>
        `;
        break;

      case 'upgrade_request':
        subject = `Upgrade Request: ${userEmail}`;
        headerLabel = 'Admin · Upgrade Request';
        bodyHtml = `
          <p>A user has requested an upgrade to Elite:</p>
          ${infoBox(
            row('Email', userEmail) +
            (userName ? row('Name', userName) : '') +
            row('Payment', details?.paymentMethod || 'Payment processor') +
            row('Time', new Date().toLocaleString())
          )}
          <p>Please verify their payment and approve the upgrade in the admin panel.</p>
        `;
        break;

      case 'analysis_complete':
        subject = `Analysis Complete: ${userEmail}`;
        headerLabel = 'Admin · Analysis Complete';
        bodyHtml = `
          <p>A user has completed an analysis:</p>
          ${infoBox(
            row('Email', userEmail) +
            row('Type', details?.analysisType || 'Resume Analysis') +
            (details?.score ? row('Score', details.score) : '') +
            row('Time', new Date().toLocaleString())
          )}
        `;
        break;

      default:
        throw new Error(`Unknown activity type: ${activityType}`);
    }

    const html = buildAdminEmail(headerLabel, bodyHtml, ctaText, ctaUrl);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: "Strivo <onboarding@resend.dev>", to: [ADMIN_EMAIL], subject, html }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ success: true, warning: 'Email not sent - domain verification required' }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Resend API error: ${response.status}`);
    }

    console.log("Admin notification sent successfully");
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("Error sending admin notification:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

serve(handler);
