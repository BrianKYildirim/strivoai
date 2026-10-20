/**
 * Prompt injection sanitizer for Supabase Edge Functions.
 *
 * Strips high-confidence multi-word injection phrases from user-supplied content
 * before it reaches the LLM. Single-word occurrences of terms like "ignore",
 * "system", or "prompt" are deliberately preserved to avoid corrupting legitimate
 * resume and job-description text.
 *
 * Per security design decisions:
 *   D-01/D-02: Only multi-word sequences are matched — no single-word patterns.
 *   D-03: Injection phrases are removed silently (no placeholder text).
 *   D-04: Zero-width characters and excess whitespace are normalized first.
 *   D-08: Only user-role messages are sanitized; assistant messages pass through.
 *   D-16/D-17: Sanitization events are logged at warn level via the Logger interface.
 */

import type { Logger } from './logger.ts';

// ── Injection pattern definitions ────────────────────────────────────────────

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'ignore_instructions',
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/gi,
  },
  {
    name: 'ignore_system_prompt',
    pattern: /ignore\s+(the\s+)?system\s+prompt/gi,
  },
  {
    name: 'pretend_you_are',
    pattern: /pretend\s+(you\s+are|to\s+be)\b/gi,
  },
  {
    name: 'you_are_now',
    pattern: /you\s+are\s+now\s+a\b/gi,
  },
  {
    name: 'act_as',
    pattern: /act\s+as\s+(if\s+you\s+(are|were)|a\s+\w+\s+(who|that))/gi,
  },
  {
    name: 'reveal_system_prompt',
    pattern: /reveal\s+(your\s+)?(system\s+prompt|instructions|config(uration)?)/gi,
  },
  {
    name: 'disregard_instructions',
    pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/gi,
  },
  {
    name: 'new_instructions',
    pattern: /new\s+instructions?\s*:/gi,
  },
  {
    name: 'override_instructions',
    pattern: /override\s+(all\s+)?(previous\s+)?(instructions?|rules?|constraints?)/gi,
  },
  {
    name: 'jailbreak_dan',
    pattern: /do\s+anything\s+now|DAN\s+mode/gi,
  },
  {
    name: 'end_system_prompt',
    pattern: /<\/?(system|instructions?)>/gi,
  },
  {
    name: 'role_switch',
    pattern: /\[SYSTEM\]|\[INST\]|\[\/INST\]/g,
  },
];

// ── Core sanitization functions ──────────────────────────────────────────────

/**
 * Sanitizes a plain-text string by removing high-confidence injection phrases.
 *
 * @param text       - Raw user-supplied string (resume text, job description, etc.)
 * @param callerName - Name of the calling function; included in warn log entries.
 * @param log        - Logger instance for structured warn-level events.
 * @returns The sanitized string with injection phrases silently removed.
 */
export function sanitizeUserContent(text: string, callerName: string, log: Logger): string {
  if (!text) return text;

  // D-04: Normalize zero-width characters and collapse horizontal whitespace
  // before pattern matching to defeat evasion via invisible characters or
  // multiple spaces between injection keywords.
  let result = text
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[ \t]+/g, ' ');

  for (const { name, pattern } of INJECTION_PATTERNS) {
    const before = result;
    // String.prototype.replace with a /g flag resets RegExp.lastIndex automatically,
    // so it is safe to reuse the same RegExp objects across calls.
    result = result.replace(pattern, '');
    if (result !== before) {
      // D-16/D-17: Log each strip event at warn level with pattern identifier and
      // caller name so operators can monitor injection attempts without leaking content.
      log.warn('prompt_injection_stripped', { pattern: name, caller: callerName });
    }
  }

  return result;
}

/**
 * Sanitizes all user-role messages in an Anthropic-style messages array.
 *
 * Per D-08, only messages with role === 'user' are processed. Assistant messages
 * are returned unchanged. Both string content and multi-part content arrays
 * (blocks with type === 'text') are handled.
 *
 * @param messages   - Array of message objects (role + content).
 * @param callerName - Forwarded to sanitizeUserContent for log attribution.
 * @param log        - Logger instance passed through to sanitizeUserContent.
 * @returns A new array with the same structure but sanitized user content.
 *          Original message objects are never mutated.
 */
export function sanitizeMessages(
  messages: Array<{ role: string; content: string | unknown[] }>,
  callerName: string,
  log: Logger,
): Array<{ role: string; content: string | unknown[] }> {
  return messages.map((m) => {
    // D-08: Leave assistant and system messages untouched.
    if (m.role !== 'user') return m;

    if (typeof m.content === 'string') {
      return { ...m, content: sanitizeUserContent(m.content, callerName, log) };
    }

    if (Array.isArray(m.content)) {
      const sanitizedBlocks = m.content.map((block) => {
        const b = block as Record<string, unknown>;
        if (b?.type === 'text' && typeof b.text === 'string') {
          return { ...b, text: sanitizeUserContent(b.text, callerName, log) };
        }
        return block;
      });
      return { ...m, content: sanitizedBlocks };
    }

    return m;
  });
}
