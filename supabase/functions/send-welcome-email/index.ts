import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

function generateWelcomeEmailHtml(name: string): string {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const APP_URL = Deno.env.get('APP_URL') || 'https://strivoai.net';

  const features = [
    { icon: '📄', title: 'Resume Analysis', desc: 'AI-powered scoring across 9 criteria with actionable improvements' },
    { icon: '💼', title: 'LinkedIn Grader', desc: 'Optimize your profile for recruiters with section-by-section feedback' },
    { icon: '🧭', title: 'Career Compass', desc: 'Personalized career path recommendations based on your background' },
    { icon: '🎯', title: 'Recruiting Lens', desc: 'AI-matched jobs tailored to your skills and experience' },
    { icon: '📊', title: 'Skills Gap Analysis', desc: 'Identify missing skills and get learning recommendations' },
  ];

  const featureRows = features.map(f => `
    <tr>
      <td style="padding: 14px 16px; border-bottom: 1px solid ${BRAND.border};">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="36" valign="top" style="font-size: 18px; padding-top: 2px;">${f.icon}</td>
            <td valign="top" style="padding-left: 12px;">
              <p style="color: ${BRAND.text}; font-size: 15px; font-weight: 600; margin: 0 0 2px;">${f.title}</p>
              <p style="color: ${BRAND.textSecondary}; font-size: 13px; margin: 0; line-height: 1.4;">${f.desc}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

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
        <div style="background: ${BRAND.header}; padding: 28px 32px; text-align: center;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px;">
            <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
          </h1>
          <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">Welcome</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 36px 32px 32px;">
          <p style="color: ${BRAND.text}; font-size: 16px; font-weight: 500; margin: 0 0 16px;">${greeting}</p>
          <p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
            Welcome to Strivo. We'll help you optimize your resume, strengthen your LinkedIn, and find the right career direction — all powered by AI.
          </p>
          
          <p style="color: ${BRAND.text}; font-size: 15px; font-weight: 600; margin: 0 0 12px;">What you can do now:</p>
          
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 10px; overflow: hidden;">
            ${featureRows}
          </table>
          
          <!-- CTA -->
          <div style="text-align: center; margin: 32px 0 8px;">
            <a href="${APP_URL}/dashboard" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
              Start Your First Analysis →
            </a>
          </div>
          
          <p style="color: ${BRAND.textMuted}; font-size: 13px; text-align: center; margin: 16px 0 0;">
            Have questions? Reply to this email — we're here to help.
          </p>
          
          <!-- Signature -->
          <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid ${BRAND.border};">
            <p style="color: ${BRAND.text}; font-size: 15px; margin: 0; font-weight: 500;">— Brian</p>
            <p style="color: ${BRAND.textMuted}; font-size: 13px; margin: 4px 0 0;">Founder, Strivo</p>
          </div>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 24px;">
        <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">You received this because you signed up for Strivo.</p>
        <p style="margin: 6px 0 0;"><a href="${APP_URL}" style="color: ${BRAND.accent}; text-decoration: none; font-size: 12px;">strivoai.net</a></p>
      </div>
    </div>
  </body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });

    const { email, name } = await req.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedName = name ? String(name).slice(0, 100) : '';
    console.log('Sending welcome email to:', email);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "Strivo AI <support@strivoai.net>",
        reply_to: "support@strivoai.net",
        to: [email],
        subject: "Welcome to Strivo — your career starts here",
        html: generateWelcomeEmailHtml(sanitizedName),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status);
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ success: true, warning: 'Email not sent - domain verification required' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Resend API error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Welcome email sent successfully:", data.id);

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("Error sending welcome email:", err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
