import type { CostedFeature } from './feature-run-telemetry.ts';

export const FEATURE_RUN_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface FeatureRunTokenPayload {
  featureRunId: string;
  userId: string;
  feature: CostedFeature;
  runVariant: 'standard' | 'cache_reuse' | 'rerun' | 'elite_unlock' | 'evaluation';
  inputType: 'none' | 'text' | 'pdf' | 'docx' | 'url' | 'mixed' | 'unknown';
  documentCount: number;
  expiresAt: number;
}

export interface FeatureRunTokenDependencies {
  readSecret?: () => string | undefined;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`strivo:feature-run-token:v1:${secret}`),
  );
  return await crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function dependencies(deps: FeatureRunTokenDependencies): Required<FeatureRunTokenDependencies> {
  return {
    readSecret: deps.readSecret ?? (() => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
    now: deps.now ?? Date.now,
    randomBytes: deps.randomBytes ?? ((length) => crypto.getRandomValues(new Uint8Array(length))),
  };
}

export async function createFeatureRunToken(
  payload: Omit<FeatureRunTokenPayload, 'expiresAt'>,
  deps: FeatureRunTokenDependencies = {},
): Promise<string> {
  const resolved = dependencies(deps);
  const secret = resolved.readSecret();
  if (!secret) throw new Error('feature_run_token_secret_unavailable');
  const iv = resolved.randomBytes(12);
  if (iv.length !== 12) throw new Error('feature_run_token_random_unavailable');
  const plaintext = new TextEncoder().encode(JSON.stringify({
    ...payload,
    expiresAt: resolved.now() + FEATURE_RUN_TOKEN_TTL_MS,
  }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    await encryptionKey(secret),
    plaintext as BufferSource,
  ));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv);
  packed.set(ciphertext, iv.length);
  return `fr1.${base64UrlEncode(packed)}`;
}

export async function resolveFeatureRunToken(
  token: string,
  deps: FeatureRunTokenDependencies = {},
): Promise<FeatureRunTokenPayload | null> {
  try {
    const resolved = dependencies(deps);
    const secret = resolved.readSecret();
    if (!secret || !token.startsWith('fr1.')) return null;
    const packed = base64UrlDecode(token.slice(4));
    if (packed.length <= 28) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12) as BufferSource },
      await encryptionKey(secret),
      packed.slice(12) as BufferSource,
    );
    const value = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<FeatureRunTokenPayload>;
    if (
      typeof value.featureRunId !== 'string' ||
      typeof value.userId !== 'string' ||
      typeof value.feature !== 'string' ||
      typeof value.runVariant !== 'string' ||
      typeof value.inputType !== 'string' ||
      typeof value.documentCount !== 'number' ||
      !Number.isInteger(value.documentCount) || value.documentCount < 0 ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt <= resolved.now()
    ) return null;
    return value as FeatureRunTokenPayload;
  } catch {
    return null;
  }
}
