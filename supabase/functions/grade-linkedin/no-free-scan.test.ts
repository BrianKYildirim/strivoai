import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
const pageSource = await Deno.readTextFile(
  new URL('../../../src/pages/LinkedInGrader.tsx', import.meta.url),
);

Deno.test('LinkedIn runtime has no billing-cycle free-scan branch or state', () => {
  for (const obsoleteToken of [
    'free_linkedin_scan_used',
    'freeScanThisRequest',
    'isFreeScan',
    'getBillingPeriodStart',
    'free-scan-bypass',
    'linkedin-free-scan-bypass',
  ]) {
    assertEquals(source.includes(obsoleteToken), false, obsoleteToken);
  }
});

Deno.test('Merit-enabled LinkedIn path always uses withMerits and records one usage credit', () => {
  assert(source.includes('const gated = await withMerits('));
  assert(source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 1, stored.recordId)"));
  assertEquals(source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 0"), false);
});

Deno.test('legacy LinkedIn path checks entitlement and records one usage credit', () => {
  assert(source.includes("checkEntitlement(userId, 'linkedin_grading')"));
  assert(source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 1, record.id)"));
  assertEquals(source.includes('? 0 : 1'), false);
});

Deno.test('LinkedIn page always shows normal Merit cost without billing-cycle eligibility UI', () => {
  assert(pageSource.includes('This will use {linkedInMeritCost} Merits'));
  assertEquals(pageSource.includes('Free scan available this billing cycle'), false);
  assertEquals(pageSource.includes('free-available'), false);
  assertEquals(pageSource.includes("'get_billing_period_start'"), false);
});
