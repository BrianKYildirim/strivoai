/**
 * Performance logging utility — toggled via VITE_DEBUG_PERF env variable.
 *
 * Usage:
 *   import { perf } from '@/lib/perf';
 *   const t = perf.start('Resume Analysis');
 *   // ... work ...
 *   perf.mark(t, 'first byte', { status: 200 });
 *   // ... more work ...
 *   perf.end(t, { score: 82 });
 *
 * Enable:  set VITE_DEBUG_PERF=true in .env (or .env.local)
 * Disable: remove or set VITE_DEBUG_PERF=false
 */

const ENABLED =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env?.VITE_DEBUG_PERF === 'true';

const PREFIX = '[STRIVO-PERF]';

interface PerfTimer {
  label: string;
  t0: number;
}

function fmt(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

function extra(data?: Record<string, unknown>): string {
  if (!data) return '';
  const parts = Object.entries(data).map(([k, v]) => `${k}: ${v}`);
  return ' | ' + parts.join(' | ');
}

/** Start a named timer. Returns a handle to pass to mark/end. */
function start(label: string): PerfTimer {
  if (ENABLED) {
    console.log(`${PREFIX} ${label} — started`);
  }
  return { label, t0: performance.now() };
}

/** Log an intermediate milestone without stopping the timer. */
function mark(timer: PerfTimer, milestone: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const elapsed = performance.now() - timer.t0;
  console.log(`${PREFIX} ${timer.label} — ${milestone} at ${fmt(elapsed)}${extra(data)}`);
}

/** Log completion and return elapsed ms. */
function end(timer: PerfTimer, data?: Record<string, unknown>): number {
  const elapsed = performance.now() - timer.t0;
  if (ENABLED) {
    console.log(`${PREFIX} ${timer.label} — complete in ${fmt(elapsed)}${extra(data)}`);
  }
  return elapsed;
}

/** One-shot log (no timer needed). */
function log(message: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return;
  console.log(`${PREFIX} ${message}${extra(data)}`);
}

/** Check if perf logging is enabled. */
function isEnabled(): boolean {
  return ENABLED;
}

export const perf = { start, mark, end, log, isEnabled };
