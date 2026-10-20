/**
 * supabaseMock — reusable, fully-chainable Supabase client mock for vitest.
 *
 * Extracted from the one complete chainable mock in `src/pages/Dashboard.test.tsx`
 * (the only one that stubbed `.lt`/`.order`/`.limit`). The ~20 hand-rolled
 * partial mocks across the suite only stubbed `auth.getUser`, so any test that
 * *transitively* mounted a component issuing a real query chain (e.g.
 * `OutcomeOverdueBanner`'s `from().select().eq().lt()`) threw inside an async
 * effect → an unhandled promise rejection that crashed a neighboring worker.
 *
 * Use `makeSupabaseMock()` as the default `vi.mock('@/lib/supabaseClient', ...)`
 * body so every query-builder method is chainable and resolves to an empty,
 * benign result instead of throwing.
 */

/** The empty, benign result every chain terminal resolves to. */
const EMPTY_RESULT: { data: unknown[]; error: null } = { data: [], error: null };

/**
 * A fully-chainable query-builder where every method either returns the builder
 * (so `.select().eq().lt().order().limit()` etc. all compose) or resolves to
 * `{ data: [], error: null }`. The builder is also a thenable, so `await`-ing
 * the chain directly (without a terminal `.single()`) resolves the same way.
 */
export interface ChainableQueryBuilder extends PromiseLike<{ data: unknown[]; error: null }> {
  select: (...args: unknown[]) => ChainableQueryBuilder;
  insert: (...args: unknown[]) => ChainableQueryBuilder;
  update: (...args: unknown[]) => ChainableQueryBuilder;
  upsert: (...args: unknown[]) => ChainableQueryBuilder;
  delete: (...args: unknown[]) => ChainableQueryBuilder;
  eq: (...args: unknown[]) => ChainableQueryBuilder;
  neq: (...args: unknown[]) => ChainableQueryBuilder;
  lt: (...args: unknown[]) => ChainableQueryBuilder;
  lte: (...args: unknown[]) => ChainableQueryBuilder;
  gt: (...args: unknown[]) => ChainableQueryBuilder;
  gte: (...args: unknown[]) => ChainableQueryBuilder;
  in: (...args: unknown[]) => ChainableQueryBuilder;
  is: (...args: unknown[]) => ChainableQueryBuilder;
  match: (...args: unknown[]) => ChainableQueryBuilder;
  order: (...args: unknown[]) => ChainableQueryBuilder;
  limit: (...args: unknown[]) => ChainableQueryBuilder;
  range: (...args: unknown[]) => ChainableQueryBuilder;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  single: () => Promise<{ data: null; error: null }>;
}

/**
 * Builds a chainable query-builder. Every chainable method returns the SAME
 * builder instance so any composition order resolves to `{ data: [], error: null }`,
 * while `.maybeSingle()`/`.single()` resolve to a single-row `{ data: null, error: null }`.
 */
export function makeQueryBuilder(): ChainableQueryBuilder {
  const builder = {} as ChainableQueryBuilder;

  const chainable = (): ChainableQueryBuilder => builder;

  // Thenable: `await supabase.from('x').select().eq(...).lt(...)` resolves here.
  builder.then = (onfulfilled, onrejected) =>
    Promise.resolve(EMPTY_RESULT).then(onfulfilled, onrejected);

  builder.select = chainable;
  builder.insert = chainable;
  builder.update = chainable;
  builder.upsert = chainable;
  builder.delete = chainable;
  builder.eq = chainable;
  builder.neq = chainable;
  builder.lt = chainable;
  builder.lte = chainable;
  builder.gt = chainable;
  builder.gte = chainable;
  builder.in = chainable;
  builder.is = chainable;
  builder.match = chainable;
  builder.order = chainable;
  builder.limit = chainable;
  builder.range = chainable;

  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.single = () => Promise.resolve({ data: null, error: null });

  return builder;
}

export interface SupabaseMockOptions {
  /** Override the user returned by `auth.getUser()`. Default: `{ id: 'test-user' }`. */
  user?: { id: string } | null;
  /** Override the value `rpc()` resolves to. Default: `{ data: null, error: null }`. */
  rpcResult?: { data: unknown; error: unknown };
}

/**
 * Returns a complete Supabase client mock with a fully-chainable query builder
 * plus `auth`, `rpc`, and `storage` stubs — matching the shape in
 * `Dashboard.test.tsx`. Drop into `vi.mock('@/lib/supabaseClient', () => ({
 * supabase: makeSupabaseMock() }))`.
 */
export function makeSupabaseMock(options: SupabaseMockOptions = {}) {
  const user = options.user === undefined ? { id: "test-user" } : options.user;
  const rpcResult = options.rpcResult ?? { data: null, error: null };

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
      getSession: () =>
        Promise.resolve({ data: { session: user ? { user } : null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: () => Promise.resolve({ data: { user }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    rpc: () => Promise.resolve(rpcResult),
    from: () => makeQueryBuilder(),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    functions: {
      invoke: () => Promise.resolve({ data: null, error: null }),
    },
  };
}
