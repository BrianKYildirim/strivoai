import { supabase } from '@/lib/supabaseClient';
import { perf } from '@/lib/perf';

/**
 * Invoke a Supabase edge function with a timeout to prevent hanging.
 * Uses Promise.race for timeout handling and the Supabase client for auth headers.
 */
export async function invokeWithTimeout<T = any>(
  functionName: string,
  options: {
    // Phase 01.1: validate-document sends the raw File/Blob through this wrapper.
    body?: Record<string, any> | Blob | ArrayBuffer | File | FormData | string;
    headers?: Record<string, string>;
  } = {},
  timeoutMs: number = 120000 // 2 minutes default
): Promise<{ data: T | null; error: Error | null }> {
  const shouldRefreshSessionBeforeInvoke = async (): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.getSession();
      const exp = data.session?.expires_at;
      if (!exp) return false;

      // Refresh if token expires in the next 2 minutes.
      const secondsUntilExpiry = exp - Math.floor(Date.now() / 1000);
      return secondsUntilExpiry < 120;
    } catch {
      return false;
    }
  };

  /**
   * The CLIENT giving up — not the server reporting a timeout. Tagged 408 so callers can
   * map it to timeout copy, but callers must NOT claim a refund for it: nothing came back
   * from the server, so we cannot know whether it refunded (or even whether it failed).
   */
  const clientTimeoutError = (): Error & { status?: number } => {
    const err = new Error('Request timed out. Please try again.') as Error & { status?: number };
    err.status = 408;
    return err;
  };

  const withTimeout = async <R>(promise: Promise<R>): Promise<R> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<R>((_, reject) => {
          timeoutId = setTimeout(() => reject(clientTimeoutError()), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const parseSupabaseFunctionError = async (error: any): Promise<{ data: T | null; error: Error }> => {
    let errorData: any = null;

    // `FunctionsHttpError` exposes the HTTP response as `context` in supabase-js.
    if (error?.context && typeof error.context.json === 'function') {
      try {
        errorData = await error.context.json();
      } catch {
        // Ignore JSON parsing issues and fall back to generic message
      }
    }

    const message =
      errorData?.error ||
      errorData?.message ||
      error?.message ||
      'Unknown error occurred';

    // Propagate the REAL HTTP status onto the Error (quick task 260713-2ay).
    // It used to be thrown away here, which forced callers to regex-scrape a 3-digit code
    // out of `error.message` — no server message contains one, so every failure silently
    // degraded to "500 / generic server error" and the timeout copy was unreachable.
    // Additive: existing readers of `.message` are untouched.
    const err = new Error(message) as Error & { status?: number };
    const httpStatus = error?.context?.status;
    if (typeof httpStatus === 'number') err.status = httpStatus;
    else if (typeof errorData?.status === 'number') err.status = errorData.status;
    else if (typeof error?.status === 'number') err.status = error.status;

    return {
      data: errorData as T,
      error: err,
    };
  };

  const invokeOnce = async () => {
    const _invokeStart = performance.now();
    const result = await withTimeout(
      supabase.functions.invoke(functionName, {
        body: options.body,
        headers: options.headers,
      }),
    );
    perf.log(`invokeWithTimeout("${functionName}") — ${((performance.now() - _invokeStart) / 1000).toFixed(2)}s`);
    return result;
  };

  try {
    // Proactively refresh near-expiry tokens (Career Compass can spend time parsing PDFs client-side).
    if (await shouldRefreshSessionBeforeInvoke()) {
      await supabase.auth.refreshSession();
    } else {
      // Touch auth to initialize/validate session state before invoking JWT-protected functions.
      await supabase.auth.getUser();
    }

    let result = await invokeOnce();

    if (result.error) {
      const lowerMessage = String(result.error.message || '').toLowerCase();
      const status = (result.error as any)?.context?.status;
      const responseCode = (result.data as any)?.code;
      const looksLikeJwtIssue =
        lowerMessage.includes('invalid jwt') ||
        lowerMessage.includes('jwt') ||
        lowerMessage.includes('token') ||
        status === 401 ||
        status === 403 ||
        responseCode === 401;

      if (looksLikeJwtIssue) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          result = await invokeOnce();
        }
      }
    }

    if (result.error) {
      return await parseSupabaseFunctionError(result.error);
    }

    return { data: (result.data ?? null) as T, error: null };
  } catch (error: any) {
    if (error?.message === 'Request timed out. Please try again.') {
      // Client-side give-up. Tag 408 (defensively — clientTimeoutError already did) so the
      // caller renders timeout copy rather than the generic 500 copy. `data` is null here:
      // there is no server body, so no caller can honestly claim a refund happened.
      if (typeof error.status !== 'number') error.status = 408;
      return { data: null, error };
    }

    // In some failures `supabase.functions.invoke` may throw instead of returning `{ error }`.
    if (error?.context || error?.message) {
      return await parseSupabaseFunctionError(error);
    }

    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error occurred'),
    };
  }
}
