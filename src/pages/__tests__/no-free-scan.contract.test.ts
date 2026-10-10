import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const linkedInSource = readFileSync(resolve('src/pages/LinkedInGrader.tsx'), 'utf8');
const actionHeroSource = readFileSync(resolve('src/components/ActionFirstHero.tsx'), 'utf8');
const minimalHeroSource = readFileSync(resolve('src/components/MinimalHero.tsx'), 'utf8');
const belowFoldSource = readFileSync(resolve('src/components/BelowFold.tsx'), 'utf8');
const questionsSource = readFileSync(resolve('src/pages/Questions.tsx'), 'utf8');
const pricingSource = readFileSync(resolve('src/components/PricingTable.tsx'), 'utf8');
const migrationSource = readFileSync(
  resolve('supabase/migrations/20260801000000_remove_linkedin_free_scan.sql'),
  'utf8',
);

describe('free-scan retirement contract', () => {
  it('removes free/first-scan messages from every active user-facing surface', () => {
    const activeCopy = [
      linkedInSource,
      minimalHeroSource,
      belowFoldSource,
      questionsSource,
      pricingSource,
    ].join('\n');

    expect(activeCopy).not.toContain('Free scan available this billing cycle');
    expect(activeCopy).not.toContain('First scan is free');
    expect(activeCopy).not.toContain('No signup required for your first scan');
    expect(activeCopy).not.toContain('Get your free analysis');
    expect(activeCopy).not.toContain('free LinkedIn scan');
  });

  it('keeps LinkedIn on the normal Merit-cost UI with no billing-cycle query', () => {
    expect(linkedInSource).toContain('This will use {linkedInMeritCost} Merits');
    expect(linkedInSource).not.toContain('free-available');
    expect(linkedInSource).not.toContain('get_billing_period_start');
  });

  it('requires authentication before homepage resume analysis', () => {
    expect(actionHeroSource).toContain('sessionStorage.setItem("pendingResumeText"');
    expect(actionHeroSource).toContain('navigate("/auth"');
    expect(actionHeroSource).not.toContain('invokeWithTimeout');
    expect(actionHeroSource).not.toContain('pendingAnalysisResult');

    const minimalAnonymousBranch = minimalHeroSource.slice(
      minimalHeroSource.indexOf('// Preserve the validated upload for Auth.'),
      minimalHeroSource.indexOf('if (!result.success)'),
    );
    expect(minimalAnonymousBranch).toContain('navigate("/auth"');
    expect(minimalAnonymousBranch).not.toContain('invokeWithTimeout');
    expect(minimalAnonymousBranch).not.toContain('pendingAnalysisResult');
  });

  it('drops only obsolete LinkedIn state while preserving legitimate Free-tier grants', () => {
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS free_linkedin_scan_used');
    expect(migrationSource).toContain("VALUES (NEW.id, 10, 0, 10, (now() + interval '1 month'))");
    expect(migrationSource).toContain("WHEN 'free'  THEN 10");
    expect(pricingSource).toContain("meritAllowance: '10 Merits/month'");
    expect(pricingSource).toContain("'LinkedIn Grader (3 Merits)'");
  });
});
