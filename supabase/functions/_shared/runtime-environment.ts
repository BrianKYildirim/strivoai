export type RuntimeEnvironment =
  | 'production'
  | 'staging'
  | 'development'
  | 'test';

const RUNTIME_ENVIRONMENTS = new Set<RuntimeEnvironment>([
  'production',
  'staging',
  'development',
  'test',
]);

export interface RuntimeEnvironmentDependencies {
  /** Explicit unit-test seam. Production callers must omit this dependency. */
  readEnv?: (name: string) => string | undefined;
}

/**
 * Resolve the trusted backend environment without URL, hostname, Vite, email,
 * or request-body inference. Missing and misspelled values fail closed.
 */
export function getRuntimeEnvironment(
  dependencies: RuntimeEnvironmentDependencies = {},
): RuntimeEnvironment {
  const readEnv = dependencies.readEnv ?? ((name: string) => Deno.env.get(name));
  const value = readEnv('STRIVO_RUNTIME_ENV');
  if (!value || !RUNTIME_ENVIRONMENTS.has(value as RuntimeEnvironment)) {
    throw new Error('invalid_STRIVO_RUNTIME_ENV');
  }
  return value as RuntimeEnvironment;
}
