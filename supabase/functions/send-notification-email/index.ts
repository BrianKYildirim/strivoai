import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';

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

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "strivolife@gmail.com";
const APP_URL = Deno.env.get("APP_URL") || "https://strivoai.net";

interface EmailRequest {
  eventType: string;
  to?: string;
  data?: Record<string, any>;
}

function getSubject(eventType: string): string {
  switch (eventType) {
    case "admin_new_signup": return "New signup on Strivo";
    case "admin_upgrade_request": return "New Elite upgrade request";
    case "user_welcome": return "Welcome to Strivo — your first score is 60 seconds away";
    case "user_upgrade_received": return "Elite request received — we'll activate shortly";
    case "user_pro_granted": return "You're now Elite on Strivo";
    default: return "Strivo Update";
  }
}

function buildContent(eventType: string, data: Record<string, any> = {}): { headerLabel: string; bodyHtml: string; ctaText: string; ctaUrl: string } {
  switch (eventType) {
    case "user_welcome":
      return {
        headerLabel: 'Welcome',
        bodyHtml: `
          <p>You're in. Strivo will help you <strong>beat ATS filters</strong> and look strong to recruiters.</p>
          <p><strong>Next step:</strong> Upload your resume and get your first score + exact fixes.</p>
        `,
        ctaText: "Start your first analysis →",
        ctaUrl: `${APP_URL}/upload`,
      };
    case "admin_new_signup":
      return {
        headerLabel: 'Admin · New Signup',
        bodyHtml: `
          <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Email:</strong> ${data?.email || "Unknown"}</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Name:</strong> ${data?.full_name || "Not provided"}</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Time:</strong> ${new Date().toLocaleString()}</td></tr>
            </table>
          </div>
        `,
        ctaText: "View Admin Dashboard",
        ctaUrl: `${APP_URL}/admin/usage`,
      };
    case "admin_upgrade_request":
      return {
        headerLabel: 'Admin · Upgrade Request',
        bodyHtml: `
          <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Email:</strong> ${data?.email || "Unknown"}</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Payment:</strong> ${data?.payment_method || "Payment processor"}</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;"><strong style="color: ${BRAND.text};">Time:</strong> ${new Date().toLocaleString()}</td></tr>
            </table>
          </div>
          <p>Payment was confirmed by the current payment processor. The user's account has been automatically upgraded.</p>
        `,
        ctaText: "Review Requests",
        ctaUrl: `${APP_URL}/admin/usage`,
      };
    case "user_upgrade_received":
      return {
        headerLabel: 'Upgrade Request',
        bodyHtml: `
          <p>We've received your Elite upgrade request.</p>
          <p>Once payment is confirmed, we'll activate Elite <strong>instantly</strong>.</p>
          <p style="color: ${BRAND.textMuted};">If you've already paid, hang tight — your access will be upgraded soon.</p>
        `,
        ctaText: "Go to Dashboard",
        ctaUrl: `${APP_URL}/dashboard`,
      };
    case "user_pro_granted":
      return {
        headerLabel: 'Elite Activated',
        bodyHtml: `
          <p>Your Strivo Elite access is now <strong style="color: #059669;">active</strong>.</p>
          <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
            <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 10px;">What's unlocked:</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; 150 Merits per month</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Richest resume + LinkedIn insights</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Career Compass readiness breakdown</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Priority job matching</td></tr>
              <tr><td style="padding: 4px 0; color: ${BRAND.textSecondary}; font-size: 14px;">✓ &nbsp; Skills gap analysis</td></tr>
            </table>
          </div>
        `,
        ctaText: "Use Elite Now →",
        ctaUrl: `${APP_URL}/dashboard`,
      };
    default:
      return {
        headerLabel: 'Update',
        bodyHtml: `<p>You have a new update from Strivo.</p>`,
        ctaText: "Open Strivo",
        ctaUrl: APP_URL,
      };
  }
}

function buildEmail(headerLabel: string, bodyHtml: string, ctaText: string, ctaUrl: string): string {
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
      <!-- Header -->
      <div style="background: ${BRAND.header}; padding: 24px 32px; text-align: center;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px;">
          <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
        </h1>
        <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">${headerLabel}</p>
      </div>
      <!-- Body -->
      <div style="padding: 36px 32px 32px;">
        <div style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7;">
          ${bodyHtml}
        </div>
        ${ctaUrl ? `
        <div style="text-align: center; margin: 32px 0 8px;">
          <a href="${ctaUrl}" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
            ${ctaText}
          </a>
        </div>
        ` : ''}
      </div>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">Strivo AI · <a href="${APP_URL}" style="color: ${BRAND.accent}; text-decoration: none;">strivoai.net</a></p>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: 'user' });
  }

  const cors = corsHeaders({ type: 'user' });

  try {
    await requireAuth(req, { type: 'user' });

    const { eventType, to, data }: EmailRequest = await req.json();
    console.log(`Processing email: eventType=${eventType}, to=${to || 'admin'}`);

    if (!Deno.env.get("RESEND_API_KEY")) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let recipient = to;
    if (!recipient) {
      if (eventType.startsWith("admin_")) {
        recipient = ADMIN_EMAIL;
      } else {
        return new Response(JSON.stringify({ error: "No recipient specified" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    const { headerLabel, bodyHtml, ctaText, ctaUrl } = buildContent(eventType, data);
    const subject = getSubject(eventType);
    const html = buildEmail(headerLabel, bodyHtml, ctaText, ctaUrl);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Strivo <onboarding@resend.dev>", to: [recipient], subject, html }),
    });

    const emailData = await emailResponse.json();
    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify({ ok: true, result: emailData }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: any) {
    if (err instanceof Response) {
      const body = await err.clone().text();
      return new Response(body, { status: err.status, headers: { ...cors, "Content-Type": "application/json" } });
    }
    console.error("Error sending notification email:", err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};

serve((req) => withCors(req, 'user', () => handler(req)));
