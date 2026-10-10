/**
 * Phase 06 · 06-03 · FEAT-05 / D-07 / D-08 / D-09 — career byte-preserve collision guard.
 *
 * The career migration (06-01) inserted `careerCompassSchema` in front of the
 * authoritative `analysis_results.raw_response` write. The non-negotiable constraint
 * (D-07/D-09): that schema WRAPS an unchanged product output — it may reject a
 * genuinely malformed body, but it must NEVER drop, reshape, re-derive, or narrow a
 * field the Free/Pro/Elite path currently emits. A dropped field is a silent product
 * regression on the platform's most complex report (Career DNA, careerFields, gaps,
 * surpriseFits, roleRoadmaps 3x5 phases, compensationIntelligence).
 *
 * This guard proves BYTE-PRESERVE: for a golden Free, Pro-shaped, and Elite result
 * object, the validated value DEEP-EQUALS the input (no field loss, no reshape, no
 * coercion). It is the deep-equality complement to runtime-validation-convergence
 * (which proves accept/reject via validateModelOutput). Because the schema is
 * `.passthrough()` with only a non-empty `careerDNA`+`careerFields` core required and
 * a `.superRefine` that adds NO transform, the parsed value is the input verbatim.
 * Elite `compensationIntelligence` is carried through untouched (D-08).
 *
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { careerCompassSchema } from '../../_shared/career-validation.ts';

/** The core intersection present in every currently-accepted output. */
function coreFields() {
  return {
    careerDNA: 'A systems-minded backend engineer with quantified platform impact and a bias for reliability.',
    detectedDomain: 'software',
    domainEvidence: ['5y backend', 'distributed systems', 'on-call ownership'],
    careerFields: [
      { field: 'Platform Engineering', matchScore: 88, why: 'Owns reliability + tooling' },
      { field: 'Backend Engineering', matchScore: 82, why: 'Distributed systems depth' },
    ],
    roleReadinessBreakdown: {
      targetRole: 'Staff Software Engineer',
      overall: 72,
      dimensions: [{ name: 'Scope', score: 70 }, { name: 'Depth', score: 78 }],
    },
    roleReadinessScore: 72,
    whatYouHave: ['Distributed systems', 'Quantified impact', 'Mentorship'],
  };
}

/** A golden Free result — core + a sliced surpriseFits/roles, no elite extras, no roadmap. */
function makeFreeResult(): Record<string, unknown> {
  return {
    ...coreFields(),
    surpriseFits: [{ role: 'Developer Experience Lead', why: 'Tooling + empathy' }],
    roles: [{ title: 'Senior Backend Engineer', matchScore: 84 }],
    _outputPolicy: 'free',
  };
}

/** A golden Pro-shaped result — adds the roadmap structures + skillGaps. */
function makeProResult(): Record<string, unknown> {
  return {
    ...coreFields(),
    surpriseFits: [
      { role: 'Developer Experience Lead', why: 'Tooling + empathy' },
      { role: 'Solutions Architect', why: 'Breadth + client-facing' },
    ],
    roles: [
      { title: 'Senior Backend Engineer', matchScore: 84 },
      { title: 'Platform Engineer', matchScore: 88 },
    ],
    skillGaps: [{ skill: 'Kubernetes operators', severity: 'medium' }],
    roadmap: [{ phase: '0-3mo', focus: 'Deepen k8s', milestones: ['Ship an operator'] }],
    roleRoadmaps: [
      {
        role: 'Platform Engineer',
        phases: [
          { phase: '0-3mo', milestones: ['Operator'] },
          { phase: '3-6mo', milestones: ['Multi-tenant'] },
          { phase: '6-9mo', milestones: ['Cost model'] },
          { phase: '9-12mo', milestones: ['Platform SLA'] },
          { phase: '12mo+', milestones: ['Org-wide adoption'] },
        ],
      },
    ],
  };
}

/** A golden Elite result — full compensationIntelligence + 3 roleRoadmaps. */
function makeEliteResult(): Record<string, unknown> {
  const pro = makeProResult();
  return {
    ...pro,
    roleRoadmaps: [
      (pro.roleRoadmaps as unknown[])[0],
      { role: 'Backend Engineer', phases: [{ phase: '0-3mo', milestones: ['Depth'] }] },
      { role: 'Developer Experience Lead', phases: [{ phase: '0-3mo', milestones: ['DX survey'] }] },
    ],
    compensationIntelligence: {
      salaryBands: [{ role: 'Staff Software Engineer', p50: 240000, p75: 285000, currency: 'USD' }],
      roleTransitionROI: [{ from: 'Senior', to: 'Staff', deltaComp: 55000, timeMonths: 12 }],
      applicationStrategy: [{ move: 'Target platform orgs', rationale: 'Comp + fit' }],
    },
  };
}

Deno.test('byte-preserve: a golden Free career result validates AND deep-equals the input (no field loss)', () => {
  const input = makeFreeResult();
  const result = careerCompassSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'validated Free output must deep-equal the input — no drop/reshape/coerce');
  }
});

Deno.test('byte-preserve: a golden Pro-shaped career result (roadmap 3x5) validates AND deep-equals the input (D-07)', () => {
  const input = makeProResult();
  const result = careerCompassSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'the roadmap + roleRoadmaps structures must survive validation byte-for-byte');
  }
});

Deno.test('byte-preserve: a golden Elite career result (compensationIntelligence) validates AND deep-equals the input (D-08/D-09)', () => {
  const input = makeEliteResult();
  const result = careerCompassSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'the elite compensationIntelligence payload + 3 roleRoadmaps must survive byte-for-byte');
  }
});

Deno.test('byte-preserve: assembler-emitted extra/metadata fields survive validation unchanged (passthrough)', () => {
  const input = {
    ...makeEliteResult(),
    reusedLinkedinGrade: true,
    linkedinGradeDate: '2026-07-06T00:00:00.000Z',
    metadata: { analysis_id: '00000000-0000-0000-0000-000000000000', tier: 'elite' },
  };
  const result = careerCompassSchema.safeParse(input);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, input, 'passthrough extras (reusedLinkedinGrade, metadata) must never be dropped');
  }
});
