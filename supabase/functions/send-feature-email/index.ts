import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
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
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
};

type FeatureType = 'resume' | 'linkedin' | 'career' | 'ocr' | 'recruiting_lens';

interface FeatureEmailRequest {
  to: string;
  userName?: string;
  featureType: FeatureType;
  score?: number;
  resultsUrl: string;
  summaryLine?: string;
  recordId?: string;
  recordTable?: 'resumes' | 'linkedin_grades' | 'analysis_results';
}

const SUBJECT_MAP: Record<FeatureType, string> = {
  resume: 'Your resume score is ready',
  linkedin: 'Your LinkedIn analysis is ready',
  career: 'Your career insights are ready',
  ocr: 'Your document analysis is ready',
  recruiting_lens: 'Your job matches are ready',
};

const FEATURE_NAME_MAP: Record<FeatureType, string> = {
  resume: 'Resume Analysis',
  linkedin: 'LinkedIn Profile Grader',
  career: 'Career Compass',
  ocr: 'Document Analysis',
  recruiting_lens: 'Recruiting Lens',
};

function getScoreColor(score: number): string {
  if (score >= 80) return BRAND.success;
  if (score >= 60) return BRAND.warning;
  return BRAND.error;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent — you\'re ahead of most candidates.';
  if (score >= 60) return 'Solid foundation — a few improvements will help.';
  return 'Room to grow — check your priority fixes.';
}

function generateEmailHtml(params: FeatureEmailRequest): string {
  const { userName, featureType, score, resultsUrl, summaryLine } = params;
  const featureName = FEATURE_NAME_MAP[featureType];
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
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

  const summarySection = summaryLine ? `
    <div style="background: ${BRAND.cardBg}; border-left: 3px solid ${BRAND.accent}; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0;">
      <p style="margin: 0; color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.6;">${summaryLine}</p>
    </div>
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
      <div style="background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid ${BRAND.border};">
        
        <!-- Header -->
        <div style="background: ${BRAND.header}; padding: 24px 32px; text-align: center;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px;">
            <span style="color: #FFFFFF;">Str</span><span style="color: ${BRAND.logoRed};">ivo</span>
          </h1>
          <p style="color: #9CA3AF; font-size: 13px; margin: 0; letter-spacing: 0.5px;">${featureName}</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 36px 32px 32px;">
          <p style="color: ${BRAND.text}; font-size: 16px; font-weight: 500; margin: 0 0 16px;">${greeting}</p>
          <p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
            Your ${featureName.toLowerCase()} is complete. Here's what we found:
          </p>
          
          ${scoreSection}
          ${summarySection}
          
          <!-- CTA -->
          <div style="text-align: center; margin: 32px 0 8px;">
            <a href="${resultsUrl}" style="display: inline-block; background: ${BRAND.accent}; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px;">
              View Detailed Analysis →
            </a>
          </div>
          <p style="text-align: center; margin: 12px 0 0;">
            <a href="${resultsUrl}" style="color: ${BRAND.textMuted}; font-size: 12px; word-break: break-all; text-decoration: underline;">${resultsUrl}</a>
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
        <p style="color: ${BRAND.textMuted}; font-size: 12px; margin: 0;">You received this because you used Strivo.</p>
        <p style="margin: 6px 0 0;"><a href="${appUrl}" style="color: ${BRAND.accent}; text-decoration: none; font-size: 12px;">strivoai.net</a></p>
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
    const body: FeatureEmailRequest = await req.json();
    const { to, featureType, resultsUrl, recordId, recordTable } = body;

    if (!to || !featureType || !resultsUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, featureType, resultsUrl' }),
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

    // Check for duplicate email
    if (recordId && recordTable) {
      const supabase = getServiceClient();

      const { data: existingRecord } = await supabase
        .from(recordTable)
        .select('email_sent_at')
        .eq('id', recordId)
        .single();

      if (existingRecord?.email_sent_at) {
        console.log('Email already sent for record:', recordId);
        return new Response(
          JSON.stringify({ success: true, message: 'Email already sent', skipped: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Sending ${featureType} email to:`, to);

    const subject = SUBJECT_MAP[featureType];
    const html = generateEmailHtml(body);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: "Strivo AI <support@strivoai.net>",
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

    // Update email_sent_at
    if (recordId && recordTable) {
      const supabase = getServiceClient();

      await supabase
        .from(recordTable)
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', recordId);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error('Error sending feature email:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
