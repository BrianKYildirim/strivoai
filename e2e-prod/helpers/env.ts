/**
 * Credential access for the production smoke test.
 *
 * SECURITY CONTRACT:
 *   - Values are read from process.env in the NODE process only.
 *   - Nothing here is ever passed to page.evaluate/addInitScript.
 *   - No value is ever returned into a log line, an assertion message, a
 *     screenshot, or a report. Only the NAME of a missing variable is surfaced.
 *   - The service-role key is deliberately NOT read anywhere in this suite.
 */

export type Account = {
  label: 'free' | 'elite';
  email: string;
  password: string;
};

/** Names only — safe to print. */
export const REQUIRED_VARS = [
  'PROD_FREE_EMAIL',
  'PROD_FREE_PASSWORD',
  'PROD_ELITE_EMAIL',
  'PROD_ELITE_PASSWORD',
] as const;

/** Returns the NAMES of any missing credential variables. Never returns values. */
export function missingCredentialVars(): string[] {
  return REQUIRED_VARS.filter((name) => !process.env[name]);
}

function requireVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Name only. Never interpolate a value into an error.
    throw new Error(
      `[prod-smoke] Missing required environment variable ${name}. ` +
        'Export it or place it in a gitignored .env.prod-smoke.local. ' +
        'Refusing to run with a partial credential set.',
    );
  }
  return value;
}

export function freeAccount(): Account {
  return {
    label: 'free',
    email: requireVar('PROD_FREE_EMAIL'),
    password: requireVar('PROD_FREE_PASSWORD'),
  };
}

/**
 * Resolve an account by label. MUST be called inside a test body, never at
 * module/collection time — collection runs before test.skip can guard it, so a
 * missing variable would abort the whole run instead of skipping cleanly.
 */
export function accountFor(label: 'free' | 'elite'): Account {
  return label === 'free' ? freeAccount() : eliteAccount();
}

export function eliteAccount(): Account {
  return {
    label: 'elite',
    email: requireVar('PROD_ELITE_EMAIL'),
    password: requireVar('PROD_ELITE_PASSWORD'),
  };
}

/**
 * Every secret-ish value currently in the environment, for the redactor.
 * Used ONLY to build a replacement table — the list never leaves the process.
 */
export function secretValues(): string[] {
  const out: string[] = [];
  for (const name of REQUIRED_VARS) {
    const v = process.env[name];
    if (v && v.length > 3) out.push(v);
  }
  return out;
}
