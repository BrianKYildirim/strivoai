import type { APIRequestContext } from '@playwright/test';
import { E2E_TEST_EMAIL } from '../global-setup';

export const previewUrl = (): string => {
  const value = process.env.SUPABASE_TEST_URL;
  if (!value) throw new Error('SUPABASE_TEST_URL is required');
  return value.replace(/\/$/, '');
};

export const anonKey = (): string => {
  const value = process.env.SUPABASE_TEST_ANON_KEY;
  if (!value) throw new Error('SUPABASE_TEST_ANON_KEY is required');
  return value;
};

export async function accessToken(request: APIRequestContext): Promise<string> {
  const password = process.env.E2E_TEST_PASSWORD;
  if (!password) throw new Error('E2E_TEST_PASSWORD is required');
  const response = await request.post(
    `${previewUrl()}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: anonKey(), 'content-type': 'application/json' },
      data: { email: E2E_TEST_EMAIL, password },
    },
  );
  if (response.status() !== 200) {
    throw new Error(`Preview authentication failed with status ${response.status()}`);
  }
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Preview authentication returned no token');
  return body.access_token;
}

export function validatorUrl(): string {
  return `${previewUrl()}/functions/v1/validate-document`;
}
