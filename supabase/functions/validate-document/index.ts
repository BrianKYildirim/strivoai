import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  type UserContext,
  requireAuth,
} from '../_shared/auth.ts';
import {
  jsonError,
  withCors,
} from '../_shared/cors.ts';
import {
  type DocumentValidationResult,
  type PdfPageCounter,
  validateDocumentBytes,
} from '../_shared/document-validation.ts';
import {
  MAX_UPLOAD_BYTES,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
} from '../_shared/document-limits.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  type RateLimitConfig,
  type RateLimitResult,
} from '../_shared/rate-limiter.ts';
import {
  countPdfPages,
} from './pdf-pages.ts';

type RequireUserAuth = (
  req: Request,
  opts: { type: 'user' },
) => Promise<UserContext>;

export interface HandlerDependencies {
  requireAuth: RequireUserAuth;
  checkRateLimit: (
    userId: string,
    tier: string,
    config: RateLimitConfig,
  ) => Promise<RateLimitResult>;
  validateDocumentBytes: (params: {
    bytes: Uint8Array;
    fileName: string;
    documentType: string;
    countPdfPages: PdfPageCounter;
  }) => Promise<DocumentValidationResult>;
  countPdfPages: PdfPageCounter;
  readBody: (req: Request) => Promise<ArrayBuffer>;
}

const defaultDependencies: HandlerDependencies = {
  requireAuth,
  checkRateLimit,
  validateDocumentBytes,
  countPdfPages,
  readBody: (req) => req.arrayBuffer(),
};

function invalidMetadata(req: Request): Response {
  return jsonError(req, 400, 'invalid_document', {
    message: MSG_UNSUPPORTED_TYPE,
    code: 'INVALID_DOCUMENT',
    retryable: false,
  });
}

function invalidDocument(
  req: Request,
  result: Extract<DocumentValidationResult, { ok: false }>,
): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_document',
      reason: result.reason,
      message: result.message,
    }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function decodeFileName(value: string | null): string | null {
  if (!value || value.length > 512) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded ? decoded : null;
  } catch {
    return null;
  }
}

function extensionOf(fileName: string): string {
  const basename = fileName.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = basename.lastIndexOf('.');
  return dot >= 0 ? basename.slice(dot).toLowerCase() : '';
}

export async function handler(
  req: Request,
  deps: HandlerDependencies = defaultDependencies,
): Promise<Response> {
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('validate-document', reqId);
  const startedAt = Date.now();
  let userId = '';
  let tier = '';
  let extension = '';

  try {
    // Auth must precede rate limiting, metadata inspection, body reads, and parsing.
    const userContext = await deps.requireAuth(req, { type: 'user' });
    userId = userContext.userId;
    tier = userContext.tier;

    // Validation is lightweight but parser work is attacker-controlled. These
    // fixed-window per-hour limits preserve normal retry/upload behavior.
    const rateLimit = await deps.checkRateLimit(userId, tier, {
      key: 'validate-document',
      limits: { free: 30, pro: 60, elite: 120 },
    });
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds, 'user');
    }

    const documentType = req.headers.get('x-document-type');
    const fileName = decodeFileName(req.headers.get('x-file-name'));
    if (documentType !== 'resume' || !fileName) return invalidMetadata(req);
    extension = extensionOf(fileName);

    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0
      ) {
        return invalidMetadata(req);
      }
      if (contentLength > MAX_UPLOAD_BYTES) {
        return invalidDocument(req, {
          ok: false,
          reason: 'too_large',
          message: MSG_UNSUPPORTED_TYPE,
        });
      }
    }

    const bytes = new Uint8Array(await deps.readBody(req));
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return invalidDocument(req, {
        ok: false,
        reason: 'too_large',
        message: MSG_UNSUPPORTED_TYPE,
      });
    }

    log.info('request-start', {
      userId,
      tier,
      extension,
      byteLength: bytes.byteLength,
    });

    const result = await deps.validateDocumentBytes({
      bytes,
      fileName,
      documentType,
      countPdfPages: deps.countPdfPages,
    });
    log.info('validation-verdict', {
      userId,
      tier,
      extension,
      verdict: result.ok ? 'accepted' : result.reason,
      elapsedMs: Date.now() - startedAt,
    });

    if (!result.ok) return invalidDocument(req, result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    log.error('validation-failed', {
      userId,
      tier,
      extension,
      verdict: 'unavailable',
      elapsedMs: Date.now() - startedAt,
    });
    return jsonError(req, 500, 'validation_unavailable', {
      message: MSG_VALIDATION_UNAVAILABLE,
      code: 'VALIDATION_UNAVAILABLE',
      retryable: true,
    });
  }
}

export const handleRequest = (req: Request) =>
  withCors(req, 'user', () => handler(req), {
    extraHeaders: 'x-document-type, x-file-name',
  });

serve(handleRequest);
