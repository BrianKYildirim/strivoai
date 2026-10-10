import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';

// Unified Strivo Design Tokens — Institutional Intelligence
const BRAND = {
  header: '#111827',        // Dark charcoal header
  headerBorder: '#1F2937',
  body: '#FFFFFF',
  bg: '#F3F4F6',            // Page background
  text: '#111827',          // Primary text
  textSecondary: '#6B7280', // Secondary text
  textMuted: '#9CA3AF',     // Muted / footnotes
  accent: '#4F46E5',        // Indigo — primary action
  accentHover: '#4338CA',
  accentLight: '#EEF2FF',   // Indigo-50 for highlight boxes
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  border: '#E5E7EB',
  cardBg: '#F9FAFB',
  logoRed: '#DC2626',       // Red reserved for logo "ivo" only
};

type EmailType =
  | 'resume_analysis'
  | 'nudge_24hr'
  | 'career_compass_intro'
  | 'credits_exhausted'
  | 'founder_checkin'
  | 'linkedin_analysis'
  | 'career_analysis'
  | 'recruiting_lens'
  | 'shop_receipt';

interface EmailRequest {
  to: string;
  userName?: string;
  emailType: EmailType;
  score?: number;
  resultsUrl?: string;
  metadata?: Record<string, any>;
}

interface EmailContent {
  subject: string;
  html: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return BRAND.success;
  if (score >= 60) return BRAND.warning;
  return BRAND.error;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent — you\'re ahead of most candidates.';
  if (score >= 60) return 'Solid foundation — a few improvements will help.';
  return 'Room to grow — check your priority fixes below.';
}

function getEmailContent(params: EmailRequest): EmailContent {
  const { userName, emailType, score, resultsUrl } = params;
  const firstName = userName?.split(' ')[0] || 'there';
  const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';

  switch (emailType) {
    case 'resume_analysis':
      return {
        subject: `${firstName}, your resume score is ready`,
        html: buildEmail({
          headerLabel: 'Resume Analysis',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Your resume has been analyzed using the same criteria that recruiters and ATS systems evaluate.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">Here's what you'll find:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; Where your resume stands out</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; What's holding it back from callbacks</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; Priority fixes ranked by impact</td></tr>
              </table>
            </div>
          `,
          ctaText: 'View My Results',
          ctaUrl: resultsUrl || `${appUrl}/results`,
          score,
          footnote: 'Every insight is tailored to your background and goals — not generic advice.',
        }),
      };

    case 'nudge_24hr':
      return {
        subject: 'A quick fix that could land more interviews',
        html: buildEmail({
          headerLabel: 'Resume Insight',
          greeting: `Hi ${firstName},`,
          body: `
            <p>You haven't checked your full analysis yet — and there's one thing worth seeing.</p>
            <div style="background: #FFFBEB; border-left: 3px solid ${BRAND.warning}; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0;">
              <p style="margin: 0; color: ${BRAND.text}; font-size: 15px;">
                <strong>Most candidates at your stage</strong> get filtered out before a human reads their resume. Your analysis shows exactly where that's happening — and how to fix it in under 10 minutes.
              </p>
            </div>
          `,
          ctaText: 'See What to Fix',
          ctaUrl: resultsUrl || `${appUrl}/results`,
          footnote: 'Small changes here make a real difference in callbacks.',
        }),
      };

    case 'career_compass_intro':
      return {
        subject: 'The roles you\'re actually competitive for',
        html: buildEmail({
          headerLabel: 'Career Compass',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Strivo doesn't just score your resume — it maps where you're most competitive <em>right now</em>.</p>
            <div style="background: ${BRAND.accentLight}; border: 1px solid #C7D2FE; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">Based on your profile:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">→ Career paths where your background aligns best</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">→ Roles you're close to, with specific gaps</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">→ The direction with highest ROI on your effort</td></tr>
              </table>
            </div>
          `,
          ctaText: 'Open Career Compass',
          ctaUrl: `${appUrl}/career-compass`,
          footnote: 'Think of this as clarity, not pressure. Know where to aim before you apply.',
        }),
      };

    case 'credits_exhausted':
      return {
        subject: 'Your free credits are used up',
        html: buildEmail({
          headerLabel: 'Account Update',
          greeting: `Hi ${firstName},`,
          body: `
            <p>You've used all your free Strivo credits — which means you've been putting in the work.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">With an upgrade you can:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• Analyze updated resume versions</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• Compare different role targets</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• Track your score improvements over time</td></tr>
              </table>
            </div>
          `,
          ctaText: 'View Plans',
          ctaUrl: `${appUrl}/pricing`,
          footnote: 'Unlock when you need it — no pressure.',
        }),
      };

    case 'founder_checkin':
      return {
        subject: 'Quick question from Strivo\'s founder',
        html: buildEmail({
          headerLabel: 'From the Founder',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Quick question — did Strivo help you understand why your resume gets the outcomes it does?</p>
            <p>I'm constantly improving the product, and hearing directly from users helps more than any dashboard ever could.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0; text-align: center;">
              <p style="margin: 0; color: ${BRAND.text}; font-size: 15px;">
                <strong>Hit reply</strong> and let me know — I read every response personally.
              </p>
            </div>
          `,
          ctaText: null,
          ctaUrl: null,
          footnote: 'Even one sentence helps. Thanks for being part of this.',
        }),
      };

    case 'linkedin_analysis':
      return {
        subject: `${firstName}, your LinkedIn profile score is ready`,
        html: buildEmail({
          headerLabel: 'LinkedIn Analysis',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Your LinkedIn profile has been analyzed the way recruiters and hiring managers actually see it.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">Your breakdown includes:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; Headline & summary effectiveness</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; Experience section optimization</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">✓ &nbsp; Skills & endorsements strategy</td></tr>
              </table>
            </div>
          `,
          ctaText: 'View LinkedIn Analysis',
          ctaUrl: resultsUrl || `${appUrl}/linkedin-grader`,
          score,
          footnote: 'Your LinkedIn is often the first impression — let\'s make it count.',
        }),
      };

    case 'career_analysis':
      return {
        subject: `${firstName}, your career roadmap is ready`,
        html: buildEmail({
          headerLabel: 'Career Compass',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Your skills and experience have been mapped against real market data to show you exactly where you're most competitive.</p>
            <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">Inside your Career Compass:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• Role readiness scores</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• Specific skill gaps to close</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">• 12-month career roadmap</td></tr>
              </table>
            </div>
          `,
          ctaText: 'View Career Compass',
          ctaUrl: resultsUrl || `${appUrl}/career-compass`,
          score,
          footnote: 'Strategic clarity beats spray-and-pray every time.',
        }),
      };

    case 'recruiting_lens':
      return {
        subject: `${firstName}, your Recruiting Lens match is ready`,
        html: buildEmail({
          headerLabel: 'Recruiting Lens',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Your resume has been compared against the job description from a recruiter's point of view.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <p style="font-weight: 600; color: ${BRAND.text}; margin: 0 0 12px;">Your match report includes:</p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">Match score and recruiter verdict</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">Top gaps against this role</td></tr>
                <tr><td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px;">Specific advice to improve your odds</td></tr>
              </table>
            </div>
          `,
          ctaText: 'View Recruiting Lens',
          ctaUrl: resultsUrl || `${appUrl}/recruiting-lens`,
          score,
          footnote: 'Use this before applying so your positioning matches the role.',
        }),
      };

    case 'shop_receipt': {
      const metadata = params.metadata || {};
      const packSize = metadata.packSize || '0';
      const amountPaid = metadata.amountPaid || 'N/A';
      const purchaseDate = metadata.purchaseDate
        ? new Date(metadata.purchaseDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
      const billingUrl = metadata.billingUrl || `${appUrl}/pricing`;

      return {
        subject: 'Your Strivo Merit purchase confirmation',
        html: buildEmail({
          headerLabel: 'Merit Purchase',
          greeting: `Hi ${firstName},`,
          body: `
            <p>Your Merit purchase has been confirmed and added to your balance.</p>
            <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 20px 24px; margin: 24px 0;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px; font-weight: 600;">Pack</td>
                  <td style="padding: 6px 0; color: ${BRAND.text}; font-size: 15px; text-align: right;">${packSize} Merits</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px; font-weight: 600;">Amount</td>
                  <td style="padding: 6px 0; color: ${BRAND.text}; font-size: 15px; text-align: right;">$${amountPaid}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: ${BRAND.textSecondary}; font-size: 15px; font-weight: 600;">Date</td>
                  <td style="padding: 6px 0; color: ${BRAND.text}; font-size: 15px; text-align: right;">${purchaseDate}</td>
                </tr>
              </table>
            </div>
          `,
          ctaText: 'View Purchase History',
          ctaUrl: billingUrl,
          footnote: 'Merits purchased in the shop never expire. Use them anytime.',
        }),
      };
    }

    default:
      return {
        subject: 'Update from Strivo',
        html: buildEmail({
          headerLabel: 'Update',
          greeting: `Hi ${firstName},`,
          body: '<p>You have a new update from Strivo.</p>',
          ctaText: 'Go to Strivo',
          ctaUrl: appUrl,
        }),
      };
  }
}

interface BuildEmailParams {
  headerLabel: string;
  greeting: string;
  body: string;
  ctaText: string | null;
  ctaUrl: string | null;
  score?: number;
  footnote?: string;
}

function buildEmail(params: BuildEmailParams): string {
  const { headerLabel, greeting, body, ctaText, ctaUrl, score, footnote } = params;
  const appUrl = Deno.env.get('APP_URL') || 'https://strivoai.net';

  const scoreSection = score !== undefined ? `
    <div style="background: ${BRAND.cardBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 28px; text-align: center; margin: 28px 0;">
      <p style="color: ${BRAND.textMuted}; font-size: 11px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Your Score</p>
      <p style="color: ${getScoreColor(score)}; font-size: 56px; font-weight: 700; margin: 0; line-height: 1; font-family: 'Georgia', serif;">
        ${score}<span style="font-size: 22px; color: ${BRAND.textMuted}; font-weight: 400;">/100</span>
      </p>
      <p style="color: ${BRAND.textSecondary}; font-size: 14px; margin: 12px 0 0;">${getScoreLabel(score)}</p>
    </div>
  ` : '';

  const ctaSection = ctaText && ctaUrl ? `
    <div style="text-align: center; margin: 32px 0 8px;">
      <a href="${ctaUrl}" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
        ${ctaText} →
      </a>
    </div>
    <p style="text-align: center; margin: 12px 0 0;">
      <a href="${ctaUrl}" style="color: ${BRAND.textMuted}; font-size: 12px; word-break: break-all; text-decoration: underline;">${ctaUrl}</a>
    </p>
  ` : '';

  const footnoteSection = footnote ? `
    <p style="color: ${BRAND.textSecondary}; font-size: 14px; line-height: 1.6; margin: 24px 0 0; font-style: italic;">${footnote}</p>
  ` : '';

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
      <!-- Main Card -->
      <div style="background: ${BRAND.body}; border-radius: 12px; overflow: hidden; border: 1px solid ${BRAND.border};">
        
        <!-- Header -->
        <div style="background: ${BRAND.header}; padding: 24px 32px; text-align: center;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 6px;">
            <tr>
              <td align="center">
                <h1 style="font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.3px;">
                  <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
                </h1>
              </td>
            </tr>
          </table>
          <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">${headerLabel}</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 36px 32px 32px;">
          <p style="color: ${BRAND.text}; font-size: 16px; font-weight: 500; margin: 0 0 20px;">${greeting}</p>
          
          <div style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7;">
            ${body}
          </div>
          
          ${scoreSection}
          ${ctaSection}
          ${footnoteSection}
          
          <!-- Signature -->
          <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid ${BRAND.border};">
            <p style="color: ${BRAND.text}; font-size: 15px; margin: 0; font-weight: 500;">— Aditya</p>
            <p style="color: ${BRAND.textMuted}; font-size: 13px; margin: 4px 0 0;">Founder, Strivo</p>
          </div>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 24px;">
        <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">
          You received this because you used Strivo.
        </p>
        <p style="margin: 6px 0 0;">
          <a href="${appUrl}" style="color: ${BRAND.accent}; text-decoration: none; font-size: 12px;">strivoai.net</a>
        </p>
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
    const body: EmailRequest = await req.json();
    const { to, emailType, userName, score, resultsUrl, metadata } = body;

    if (!to || !emailType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, emailType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending ${emailType} email to:`, to);
    const { subject, html } = getEmailContent({ to, emailType, userName, score, resultsUrl, metadata });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "Aditya from Strivo <support@strivoai.net>",
        reply_to: "support@strivoai.net",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ success: false, warning: 'Domain not verified', error: errorText }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Resend API error: ${response.status} - ${errorText}`);
    }

    const resendData = await response.json();
    console.log('Email sent successfully:', resendData.id);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error('Error sending email:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
