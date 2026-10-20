/**
 * Structured logger for Supabase Edge Functions.
 * Outputs JSON lines to stdout — visible in Supabase function logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  timer(label: string): () => number;
}

export function createLogger(functionName: string, requestId?: string): Logger {
  const base = { fn: functionName, ...(requestId ? { reqId: requestId } : {}) };

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    const entry = {
      level,
      ts: new Date().toISOString(),
      msg,
      ...base,
      ...(data ?? {}),
    };
    // Edge function logs only capture stdout/console
    if (level === 'error' || level === 'warn') {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info:  (msg, data) => log('info',  msg, data),
    warn:  (msg, data) => log('warn',  msg, data),
    error: (msg, data) => log('error', msg, data),
    timer(label: string) {
      const start = Date.now();
      return () => {
        const ms = Date.now() - start;
        log('info', `${label} completed`, { durationMs: ms });
        return ms;
      };
    },
  };
}
