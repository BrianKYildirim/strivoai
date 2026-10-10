import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, type UserContext } from '../_shared/auth.ts';
import { withCors } from '../_shared/cors.ts';
import {
  createFeatureRun,
  type CostedFeature,
  type FeatureRunResult,
} from '../_shared/feature-run-telemetry.ts';
import { createFeatureRunToken } from '../_shared/feature-run-token.ts';

const FEATURES = new Set<CostedFeature>([
  'resume_analysis',
  'linkedin_grader',
  'career_compass',
  'recruiting_lens',
  'interview_prep',
]);
const RUN_VARIANTS = new Set([
  'standard',
  'cache_reuse',
  'rerun',
  'elite_unlock',
  'evaluation',
] as const);
const INPUT_TYPES = new Set([
  'none',
  'text',
  'pdf',
  'docx',
  'url',
  'mixed',
  'unknown',
] as const);
const ALLOWED_FIELDS = new Set([
  'feature',
  'runVariant',
  'inputType',
  'documentCount',
  'serverActionNonce',
]);

export interface BeginFeatureRunEnvelope {
  feature: CostedFeature;
  runVariant: 'standard' | 'cache_reuse' | 'rerun' | 'elite_unlock' | 'evaluation';
  inputType: 'none' | 'text' | 'pdf' | 'docx' | 'url' | 'mixed' | 'unknown';
  documentCount: number;
  serverActionNonce: string;
}

export interface BeginFeatureRunDependencies {
  requireAuth: (req: Request) => Promise<UserContext>;
  createFeatureRun: (params: Parameters<typeof createFeatureRun>[0]) => Promise<FeatureRunResult>;
  createToken: (payload: Parameters<typeof createFeatureRunToken>[0]) => Promise<string>;
}

function defaultDependencies(): BeginFeatureRunDependencies {
  return {
    requireAuth: (req) => requireAuth(req, { type: 'user' }),
    createFeatureRun: (params) => createFeatureRun(params),
    createToken: (payload) => createFeatureRunToken(payload),
  };
}

export function parseBeginFeatureRunEnvelope(value: unknown): BeginFeatureRunEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) return null;
  if (!FEATURES.has(body.feature as CostedFeature)) return null;
  if (!RUN_VARIANTS.has(body.runVariant as never)) return null;
  if (!INPUT_TYPES.has(body.inputType as never)) return null;
  if (!Number.isInteger(body.documentCount) || (body.documentCount as number) < 0 ||
    (body.documentCount as number) > 12) return null;
  if (
    typeof body.serverActionNonce !== 'string' ||
    body.serverActionNonce.length < 16 ||
    body.serverActionNonce.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(body.serverActionNonce)
  ) return null;
  return body as unknown as BeginFeatureRunEnvelope;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handler(
  req: Request,
  dependencies: BeginFeatureRunDependencies = defaultDependencies(),
): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Auth and the strict envelope gate precede run creation. This endpoint performs
  // no document read, provider request, Merit operation, or content validation.
  const user = await dependencies.requireAuth(req);
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(400, { error: 'invalid_feature_run_envelope' });
  }
  const envelope = parseBeginFeatureRunEnvelope(parsed);
  if (!envelope) return json(400, { error: 'invalid_feature_run_envelope' });

  const run = await dependencies.createFeatureRun({
    userId: user.userId,
    feature: envelope.feature,
    serverActionKey: `begin-feature-run:${envelope.runVariant}:${envelope.serverActionNonce}`,
    runVariant: envelope.runVariant,
    inputType: envelope.inputType,
    documentCount: envelope.documentCount,
  });
  if (!run.ok) return json(503, { error: 'feature_run_unavailable' });

  const featureRunToken = await dependencies.createToken({
    featureRunId: run.featureRunId,
    userId: user.userId,
    feature: envelope.feature,
    runVariant: envelope.runVariant,
    inputType: envelope.inputType,
    documentCount: envelope.documentCount,
  });
  return json(200, { featureRunToken });
}

export const handleRequest = (req: Request) =>
  withCors(req, 'user', () => handler(req));

serve(handleRequest);
