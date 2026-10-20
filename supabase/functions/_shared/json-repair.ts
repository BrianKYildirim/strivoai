/**
 * Repairs truncated JSON produced by an LLM hitting its max_tokens limit.
 *
 * Strategy (in order):
 * 1. Strip markdown code fences.
 * 2. Track nesting with a character-by-character stack scan.
 * 3. If we ended inside a string, close it and remove any dangling partial
 *    key or key-value pair that follows the last complete value.
 * 4. Remove trailing commas before ] or }.
 * 5. Close the stack in reverse order (deepest nesting first).
 *
 * Returns the repaired string or the original if no repair was needed.
 */
export function repairTruncatedJSON(raw: string): string {
  const candidates = fenceCandidates(raw.trim());

  // Try each candidate in preference order and take the FIRST that parses after
  // repair. Preference order is content-preserving-first, so a stray inner fence
  // can never cost us the remainder of the document (see fenceCandidates).
  let best = '';
  for (const candidate of candidates) {
    const repaired = repairCore(candidate);
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // Keep the longest repaired form as the fallback so that an unparseable
      // buffer still degrades to the MOST content we managed to recover, never
      // the least.
      if (repaired.length > best.length) best = repaired;
    }
  }
  return best;
}

/**
 * STRUCTURAL SHAPE PROBE (elite-cc-output-incomplete, Fix Options A-vs-B).
 *
 * The debug investigation pinned the loss to fence extraction but left ONE
 * question open, and it decides which fix is correct: does the model's top-level
 * object ever BALANCE?
 *
 *   - `jsonEndsAt !== null`  -> the object closes and the remainder is TRAILING
 *     PROSE. Extraction should cut at the balanced end. If the closed object is
 *     nonetheless missing required sections, the model answered in prose instead
 *     of filling the skeleton -> a PROMPT/format-adherence defect, not a parser one.
 *   - `jsonEndsAt === null`  -> the object never closes: genuine structural
 *     truncation, and the fence/candidate strategy is the thing to fix.
 *
 * `fencesInString` disambiguates the second half of the same question: a ``` that
 * sits INSIDE a string value is invisible to a string-aware scan (so a balanced
 * scan from the first `{` is safe), whereas one BETWEEN values is not.
 *
 * Pure measurement: allocates nothing large, mutates nothing, and is only ever
 * called on a failure path. Excerpts are bounded (120 chars) and structural —
 * this feeds a log line, and the surrounding contract is aggregates-and-shape,
 * not user content.
 */
export function describeBufferShape(raw: string): {
  len: number;
  startsWithBrace: boolean;
  head120: string;
  fenceCount: number;
  fencePositions: number[];
  fencesInString: boolean[];
  jsonStartsAt: number | null;
  jsonEndsAt: number | null;
  trailingAfterJson: number;
  candidateLens: number[];
} {
  const s = raw.trim();
  const objStart = s.indexOf('{');
  const jsonStartsAt = objStart === -1 ? null : objStart;

  // Record every fence position up front; classify each one during the scan below.
  const fencePositions: number[] = [];
  for (let i = s.indexOf('```'); i !== -1; i = s.indexOf('```', i + 3)) fencePositions.push(i);

  // String-aware balanced scan from the first `{`. Mirrors repairCore's scanner
  // so the verdict reflects what the repair path actually sees.
  const fencesInString: boolean[] = fencePositions.map(() => false);
  let jsonEndsAt: number | null = null;
  if (jsonStartsAt !== null) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = jsonStartsAt; i < s.length; i++) {
      const ch = s[i];
      const fenceIdx = fencePositions.indexOf(i);
      if (fenceIdx !== -1) fencesInString[fenceIdx] = inString;

      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) { jsonEndsAt = i; break; }
      }
    }
  }

  return {
    len: s.length,
    startsWithBrace: s.startsWith('{'),
    head120: s.slice(0, 120),
    fenceCount: fencePositions.length,
    fencePositions,
    fencesInString,
    jsonStartsAt,
    jsonEndsAt,
    trailingAfterJson: jsonEndsAt === null ? 0 : s.length - jsonEndsAt - 1,
    candidateLens: fenceCandidates(s).map((c) => c.length),
  };
}

/**
 * LOSS-CHECKED variant of `repairTruncatedJSON` (elite-cc-output-incomplete).
 *
 * `repairTruncatedJSON` cannot throw — five callers (analyze-resume,
 * grade-linkedin, interview-prep, recruiting-lens, llm-validation) invoke it and
 * two of them do so OUTSIDE a try/catch, so a throw there would become an
 * unhandled 500 rather than their own typed failure. Callers that would rather
 * fail loudly than persist a mutilated report opt IN via this wrapper.
 *
 * A repair that discards most of the buffer is not a repair — it is silent data
 * loss that still parses, which is precisely how a 28,905-char Career Compass
 * report became a 6,509-char stub that passed JSON.parse and then failed the
 * completeness gate with a misleading `output-incomplete`.
 */
export function repairTruncatedJSONChecked(
  raw: string,
): { ok: true; json: string } | { ok: false; error: string; originalLen: number; repairedLen: number } {
  const json = repairTruncatedJSON(raw);
  // Measure retention against the fence/preamble-stripped buffer, not the raw
  // text, so that legitimately stripping a wrapper never counts as loss.
  const baseline = fenceCandidates(raw.trim())[0]?.length ?? raw.trim().length;
  if (baseline > 0 && json.length < baseline * MIN_RETENTION_RATIO) {
    return {
      ok: false,
      error: `json repair discarded ${Math.round((1 - json.length / baseline) * 100)}% of the model output`,
      originalLen: baseline,
      repairedLen: json.length,
    };
  }
  return { ok: true, json };
}

/**
 * Below this repaired/original ratio we treat the result as content loss rather
 * than repair. Structural truncation alone is LOSSLESS through `repairCore`
 * (a 26,488-char clipped body repairs to 26,491), so a legitimate repair sits at
 * ~1.0; the observed silent-loss failures sat at 0.19-0.23.
 */
const MIN_RETENTION_RATIO = 0.6;

/**
 * Produces JSON extraction candidates for a possibly fence-wrapped buffer, in
 * CONTENT-PRESERVING-FIRST order.
 *
 * The original implementation used a single unanchored, LAZY regex:
 *   /```(?:json)?\s*([\s\S]*?)(?:```|$)/i
 * If the model opened a fence and emitted any further ``` later in the buffer,
 * the lazy capture stopped at that second fence and silently threw away the
 * entire remainder — which brace-closed into a stub that PARSED. The candidates
 * below cover both placements of that second fence without having to know which
 * one occurred:
 *   1. everything after the opening fence (inner fences INTACT) — correct when the
 *      stray ``` sits inside a string value, where it is legal JSON content.
 *   2. the same buffer with all fence markers removed — correct when the stray ```
 *      sits between values, where it is not legal JSON and must go.
 *   3. the whole buffer unmodified — unfenced output.
 *   4. the old lazy first-block — last resort only, never a silent first choice.
 */
function fenceCandidates(s: string): string[] {
  const open = s.match(/```(?:json)?[ \t]*\r?\n?/i);
  if (!open || open.index === undefined) return [s];

  const afterOpen = s.slice(open.index + open[0].length);
  // Drop only a CLOSING fence that terminates the buffer; inner fences stay.
  const unwrapped = afterOpen.replace(/\s*```\s*$/, '').trim();
  const stripped = afterOpen.replace(/```(?:json)?/gi, '').trim();
  const lazy = s.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)?.[1].trim() ?? '';

  return [unwrapped, stripped, s, lazy].filter((c, i, arr) => c.length > 0 && arr.indexOf(c) === i);
}

/** The original repair pipeline, applied to a single already-extracted candidate. */
function repairCore(raw: string): string {
  let s = raw.trim();

  // Strip bare text preamble before JSON (e.g. "json\n{..." without code fences)
  if (!s.startsWith('{') && !s.startsWith('[')) {
    const objStart = s.indexOf('{');
    const arrStart = s.indexOf('[');
    const jsonStart = objStart === -1 ? arrStart
      : arrStart === -1 ? objStart
      : Math.min(objStart, arrStart);
    if (jsonStart > 0) s = s.slice(jsonStart);
  }

  // Fast path: already valid
  try { JSON.parse(s); return s; } catch { /* fall through to repair */ }

  // Escape unescaped control characters (newline, tab, carriage return, etc.)
  // inside string literals. Models routinely emit raw \n in long strings,
  // which is invalid JSON and not recoverable without rewriting the buffer.
  s = escapeControlCharsInStrings(s);

  // Fast path retry after control-char escape
  try { JSON.parse(s); return s; } catch { /* fall through to structural repair */ }

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch as '{' | '[');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let result = s;

  // Close unterminated string
  if (inString) result += '"';

  // Remove any dangling partial key or key:value at the very end, e.g.:
  //   ,"someKey"                        → trailing key with no value
  //   ,"someKey":                       → key with colon but no value
  //   ,"someKey": "partialVal           → partial string value (already closed above)
  //   ,"someKey": [                     → already tracked in stack
  result = result
    .replace(/,\s*"[^"]*"\s*:\s*"[^"]*"\s*$/, '') // remove last complete string k:v pair only if partial-looking
    .replace(/,\s*"[^"]*"\s*:\s*$/, '')             // key with colon, no value
    .replace(/,\s*"[^"]*"\s*$/, '')                 // key without colon
    .replace(/,(\s*[}\]])/, '$1')                    // trailing comma before close
    .replace(/,\s*$/, '');                           // trailing comma at end

  // Close stack in reverse (deepest first)
  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i] === '{' ? '}' : ']';
  }

  return result;
}

/**
 * Escapes raw control characters (newline, tab, carriage return, etc.) that
 * appear inside JSON string literals. Walks the buffer tracking string state
 * and rewrites any U+0000–U+001F char that is not already escaped.
 */
function escapeControlCharsInStrings(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\' && inString) { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch.charCodeAt(0) < 0x20) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch === '\b') out += '\\b';
      else if (ch === '\f') out += '\\f';
      else out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
  }
  return out;
}
