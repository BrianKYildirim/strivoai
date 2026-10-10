import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { perf } from '@/lib/perf';
import { toast } from 'sonner';
import { useMerits } from '@/hooks/useMerits';
import { getMeritErrorMessage } from '@/lib/merit-error-messages';
import { useAnalysisRun } from '@/hooks/useAnalysisRun';
import { isAnalysisLifecycleEnabled } from '@/config/feature-flags';
import { clearEliteRerunLeaseByNewResumeId } from '@/hooks/useEliteRerun';
import { logAnalysisError } from '@/lib/analysis-error-log';
import {
  STAGE_LABELS,
  type StreamStage,
} from '@/lib/resume-stream-stage-labels';
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from '@/lib/feature-run-correlation';

export { STAGE_LABELS, type StreamStage } from '@/lib/resume-stream-stage-labels';

export interface StreamState {
  stage: StreamStage;
  stageLabel: string;
  partialSummary: string;
  result: any | null;
  error: string | null;
}

export interface StreamParams {
  resumeId: string;
  mode?: 'full_analysis' | 'elite_unlock';
  baseAnalysisId?: string;
  resumeText?: string;
  userId?: string;
  tier?: string;
  previousSuggestions?: any[];
  previousScore?: number | null;
  /**
   * Merit cost for this analysis (computed on Upload as `meritCost`). Drives the
   * single optimistic deduction fired at stream start (D-03 / Open Q2): the
   * decrement lives inside this single-page (Results) lifecycle rather than being
   * threaded across the Upload→Results navigation. Defaults to 0 when absent
   * (e.g. a sessionStorage payload written before this field existed).
   */
  meritCost?: number;
  /**
   * The deliberate-new-run signal (260723-2b0 / D-3). Minted per deliberate submit on
   * Upload (`Upload.tsx:217`) and carried in `stream_params_*`.
   *
   * The edge derives ONE idempotency key from `sha256({text_hash, resumeId, targetRole,
   * targetIndustry}) + attemptNonce + tier` (`analyze-resume/index.ts:1514-1526`), so:
   *   - the SAME nonce + the SAME content re-derives the SAME key — a retry of THIS
   *     attempt deducts exactly once (`check_and_deduct_merits` → `already_deducted`);
   *   - a FRESH nonce means the user deliberately asked for a new run, which charges.
   *
   * Optional for back-compat with `stream_params_*` payloads written before the field
   * existed. When absent the server falls back to `crypto.randomUUID()`, which is the
   * pre-fix behavior — every retry charging again. Do not let it go missing.
   */
  attemptNonce?: string;
  _retryKey?: number;
}

function detectStage(text: string): StreamStage {
  if (text.includes('"suggestions"')) return 'writing_suggestions';
  if (text.includes('"criteria"')) return 'analyzing_criteria';
  if (text.includes('"summary"')) return 'writing_summary';
  if (text.includes('"overallScore"')) return 'scoring';
  return 'connecting';
}

function extractPartialSummary(text: string): string {
  const idx = text.indexOf('"summary"');
  if (idx === -1) return '';
  // Find the opening quote after "summary":
  let start = idx + 9;
  while (start < text.length && text[start] !== '"') start++;
  if (start >= text.length) return '';
  start++; // skip the opening quote
  let result = '';
  for (let i = start; i < text.length; i++) {
    if (text[i] === '"' && text[i - 1] !== '\\') break;
    if (text[i] === '\\' && text[i + 1] === '"') {
      result += '"';
      i++;
    } else if (text[i] === '\\' && text[i + 1] === 'n') {
      result += '\n';
      i++;
    } else {
      result += text[i];
    }
  }
  return result;
}

export function useResumeStream(params: StreamParams | null) {
  const [state, setState] = useState<StreamState>({
    stage: 'connecting',
    stageLabel: STAGE_LABELS.connecting,
    partialSummary: '',
    result: null,
    error: null,
  });

  const cancelRef = useRef(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const { optimisticDeduct } = useMerits();

  // 05-02 (Open Q5): layer useAnalysisRun for run_id persistence + refresh/navigation
  // recovery + terminal-error + submit-lock, while useResumeStream stays the OWNER of
  // the SSE token/partial-render + the single optimistic deduction. The complete SSE
  // event now also carries run_id (Task 1) → startRun re-attaches (URL + localStorage).
  // Held in a ref so the SSE loop's closure always calls the latest startRun without
  // widening the effect deps. Inert while VITE_FEATURE_ANALYSIS_LIFECYCLE is off.
  const { startRun } = useAnalysisRun();
  const startRunRef = useRef(startRun);
  startRunRef.current = startRun;

  useEffect(() => {
    if (!params) return;

    cancelRef.current = false;
    setState({
      stage: 'connecting',
      stageLabel: STAGE_LABELS.connecting,
      partialSummary: '',
      result: null,
      error: null,
    });

    // D-03 / Open Q2: fire the optimistic deduction exactly ONCE at stream start,
    // inside the single-page (Results) lifecycle — NOT threaded across the
    // Upload→Results navigation, and NOT also fired on Upload submit (T-31-07
    // double-deduct guard). The same `settle` closure governs every terminal
    // branch below (complete → commit; error/abort/disconnect → rollback). The
    // async 529→queue fallback, if reached, also settles through this one closure.
    const settle = optimisticDeduct(params.meritCost ?? 0);
    let settled = false;
    // Terminal success/failure ends the deliberate action, so the in-memory
    // correlation is dropped immediately (it is never stored anywhere else).
    const releaseCorrelation = () => clearFeatureRunToken(correlationEnvelope);
    const commit = () => {
      if (!settled) { settled = true; settle.commit(); }
      releaseCorrelation();
    };
    // D-02 / NFR-03: synchronous restore. `status` selects the error-class toast
    // copy via getMeritErrorMessage (NFR-04) — never a generic string.
    const rollback = (status: number | string) => {
      if (!settled) {
        settled = true;
        settle.rollback();
      }
      releaseCorrelation();
      if (params.mode !== 'elite_unlock') {
        const { title, description } = getMeritErrorMessage(status);
        toast.error(title, description ? { description } : undefined);
      }
    };

    // Costing correlation only. The envelope repeats the one Upload already used for
    // this deliberate submit, so the in-memory token resolves to the SAME server run
    // that owns this upload's document/OCR evidence. Nothing is stored or logged.
    const correlationEnvelope: FeatureRunCorrelationEnvelope = {
      feature: 'resume_analysis',
      runVariant: params.mode === 'elite_unlock' ? 'elite_unlock' : 'standard',
      inputType: 'pdf',
      documentCount: 1,
      serverActionNonce: params.attemptNonce ?? params.resumeId,
    };

    const runStream = async () => {
      const _pt = perf.start('Resume Analysis');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Auth gate, not a merit error: restore the optimistic decrement (the
        // request never left the client) without emitting a merit-class toast.
        if (!settled) { settled = true; settle.rollback(); }
        setState(s => ({ ...s, stage: 'error', stageLabel: STAGE_LABELS.error, error: 'Not authenticated' }));
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // A correlation failure is never a product failure: the backend then creates the
      // run at its own trusted boundary and the analysis proceeds unchanged.
      let featureRunToken: string | undefined;
      try {
        featureRunToken = await getFeatureRunToken(correlationEnvelope);
      } catch {
        featureRunToken = undefined;
      }

      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/analyze-resume`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params.mode === 'elite_unlock' ? {
            mode: 'elite_unlock',
            resumeId: params.resumeId,
            ...(params.baseAnalysisId ? { baseAnalysisId: params.baseAnalysisId } : {}),
            ...(featureRunToken ? { featureRunToken } : {}),
            stream: true,
          } : {
            resumeId: params.resumeId,
            resumeText: params.resumeText,
            userId: params.userId,
            tier: params.tier,
            previousSuggestions: params.previousSuggestions,
            previousScore: params.previousScore,
            // 260723-2b0 / D-3: forward the per-attempt nonce so the edge derives a
            // STABLE idempotency key instead of minting a fresh UUID per request.
            // Omitting it (legacy payload) is byte-identical to the old behavior —
            // JSON.stringify drops `undefined` and the server falls back to a UUID.
            attemptNonce: params.attemptNonce,
            ...(featureRunToken ? { featureRunToken } : {}),
            stream: true,
          }),
        });
      } catch {
        perf.end(_pt, { status: 'fetch-failed' });
        if (!cancelRef.current) {
          rollback('network');
          setState(s => ({ ...s, stage: 'error', stageLabel: STAGE_LABELS.error, error: 'Connection failed. Please try again.' }));
        } else if (!settled) {
          settled = true;
          settle.rollback();
        }
        return;
      }

      perf.mark(_pt, 'first byte', { status: response.status });

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        if (body.error === 'rate_limit_exceeded') {
          // Rate limit never deducts server-side — restore the optimistic
          // decrement (no charge). Keep the bespoke wait-minutes copy here; the
          // taxonomy's 429 string carries the same "No charge" promise.
          if (!settled) { settled = true; settle.rollback(); }
          const waitMinutes = Math.ceil((body.retryAfter ?? 60) / 60);
          if (params.mode !== 'elite_unlock') {
            toast.error(`Too many requests. Try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`);
          }
          setState(s => ({ ...s, stage: 'error', stageLabel: STAGE_LABELS.error, error: 'rate_limit_exceeded' }));
          return; // Do NOT invalidate merit balance — this is a rate limit, not a merit exhaustion
        }
        // Fall through to existing usage_limit_reached handling
      }

      if (!response.ok || !response.body) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error) errorMsg = body.error;
        } catch { /* ignore */ }
        // Structured, leak-free diagnostics (raw string logged, never rendered).
        logAnalysisError(new Error(errorMsg), {
          stage: 'stream',
          resumeId: params.resumeId,
          tags: { httpStatus: response.status, path: 'response-not-ok' },
        });
        // Refundable AI errors (5xx/529/408) settle to a refund toast; a 402
        // INSUFFICIENT_MERITS rolls back then defers to Upload's openModal path
        // (D-03) — the modal is owned by Upload, so we surface the classification
        // via error state rather than duplicating the modal here.
        rollback(response.status);
        // 260723-2b0 D-3b layer (b): SETTLED terminal failure from the edge — this is
        // exactly the state in which merit-gateway may have already refunded. Clear any
        // Elite-rerun lease pointing at this (clone) row so the user's next CTA click takes
        // a clean, correctly-priced path instead of replaying a refunded key. Belt-and-
        // braces now that Task 7b charges a replayed refunded key regardless; still the
        // layer that survives a D-7 revert. Only in TERMINAL branches — never on transport.
        clearEliteRerunLeaseByNewResumeId(params.resumeId);
        setState(s => ({ ...s, stage: 'error', stageLabel: STAGE_LABELS.error, error: errorMsg }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let streamSettled = false; // true once a complete/error event is handled

      console.log('[ResumeStream] Stream reader acquired, beginning SSE loop');

      const processLine = (line: string): boolean => {
        // Returns true if a terminal event (complete/error) was handled
        if (!line.startsWith('data: ')) return false;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) return false;

        let event: any;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          return false;
        }

        if (event.type === 'chunk') {
          accumulated += event.text;
          const stage = detectStage(accumulated);
          const partialSummary = extractPartialSummary(accumulated);
          setState({
            stage,
            stageLabel: STAGE_LABELS[stage],
            partialSummary,
            result: null,
            error: null,
          });
          return false;
        } else if (event.type === 'complete') {
          perf.end(_pt, { score: event.result?.overallScore });
          console.log('[ResumeStream] complete event received');
          // D-07: commit (authoritative refetch) as soon as the response resolves.
          if (params.mode === 'elite_unlock' && event.result?.replayed === true) {
            if (!settled) { settled = true; settle.rollback(); }
          } else {
            commit();
          }
          // 05-02 (Open Q5): re-attach the persistent run so a refresh/navigation
          // recovers via useAnalysisRun (URL + localStorage). Gated + inert while
          // the lifecycle flag is off; run_id is only present when Task 1's wrapper ran.
          if (isAnalysisLifecycleEnabled() && typeof event.run_id === 'string' && event.run_id) {
            startRunRef.current(event.run_id);
          }
          setState({
            stage: 'complete',
            stageLabel: STAGE_LABELS.complete,
            partialSummary: extractPartialSummary(accumulated),
            result: event.result,
            error: null,
          });
          if (params.mode === 'elite_unlock') {
            clearEliteRerunLeaseByNewResumeId(params.resumeId);
          }
          streamSettled = true;
          return true;
        } else if (event.type === 'error') {
          console.log('[ResumeStream] error event received:', event.message);
          logAnalysisError(new Error(event.message || 'stream error event'), {
            stage: 'stream',
            resumeId: params.resumeId,
            tags: { path: 'sse-error-event', ...(typeof event.status === 'number' ? { httpStatus: event.status } : {}) },
          });
          // Stream-level error (e.g. forced-refundable 529 from the test toggle):
          // rollback + class-keyed toast. The status rides on event.status when
          // present; otherwise fall back to the refundable 5xx class.
          rollback(typeof event.status === 'number' ? event.status : 500);
          // 260723-2b0 D-3b layer (b): SETTLED terminal failure via the SSE error event —
          // merit-gateway may have already refunded. Clear the lease for this clone row.
          clearEliteRerunLeaseByNewResumeId(params.resumeId);
          setState(s => ({
            ...s,
            stage: 'error',
            stageLabel: STAGE_LABELS.error,
            error: event.message || 'Analysis failed. Please try again.',
          }));
          streamSettled = true;
          return true;
        }
        return false;
      };

      try {
        while (!cancelRef.current) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[ResumeStream] reader done=true, buffer remaining:', buffer.length, 'chars');
            // Process any remaining content trapped in buffer (e.g. final line without trailing \n)
            if (buffer.length > 0) {
              const terminal = processLine(buffer.trim());
              if (terminal) return;
            }

            if (!streamSettled && !cancelRef.current) {
              // Stream ended without a complete/error event — try to parse accumulated as result
              if (accumulated) {
                try {
                  const parsed = JSON.parse(accumulated);
                  if (parsed && (parsed.overallScore !== undefined || parsed.criterionFeedback || parsed.criteria)) {
                    console.log('[ResumeStream] Recovered result from accumulated chunks');
                    perf.end(_pt, { score: parsed.overallScore });
                    commit();
                    setState({
                      stage: 'complete',
                      stageLabel: STAGE_LABELS.complete,
                      partialSummary: extractPartialSummary(accumulated),
                      result: parsed,
                      error: null,
                    });
                    return;
                  }
                } catch {
                  // accumulated is not valid JSON — fall through to error
                }
              }
              console.log('[ResumeStream] Stream ended without terminal event, setting error state');
              // Unexpected EOF without a complete/error event — treat as a
              // refundable connection loss: rollback + class-keyed toast.
              rollback('network');
              // 260723-2b0 D-3b: classify this — the MOST COMMON real streaming failure —
              // as TERMINAL (clear the lease). It is genuinely ambiguous (server threw +
              // refunded without an error frame, OR the connection merely died mid-flight),
              // so resolve by cost-of-being-wrong: treating it as terminal risks at most one
              // extra charge on a run that produced no result (refunded anyway, self-
              // correcting), while treating it as transport risks a FREE Elite analysis —
              // the exact defect this section exists to prevent. With Task 7b this is belt-
              // and-braces. NOTE: the reader-loop catch below ('Stream disconnected') IS a
              // mid-read transport interruption and deliberately does NOT clear.
              clearEliteRerunLeaseByNewResumeId(params.resumeId);
              setState(s => ({
                ...s,
                stage: 'error',
                stageLabel: STAGE_LABELS.error,
                error: 'Analysis stream ended unexpectedly. Please try again.',
              }));
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const terminal = processLine(line);
            if (terminal) return;
          }
        }
      } catch {
        if (!cancelRef.current) {
          rollback('network');
          setState(s => ({ ...s, stage: 'error', stageLabel: STAGE_LABELS.error, error: 'Stream disconnected. Please try again.' }));
        } else if (!settled) {
          settled = true;
          settle.rollback();
        }
      }
    };

    runStream();

    return () => {
      cancelRef.current = true;
      // Abort/unmount before the stream settled (e.g. navigate away): silently
      // restore the optimistic decrement so the balance is not left short.
      if (!settled) {
        settled = true;
        settle.rollback();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.resumeId, params?._retryKey]);

  return state;
}
