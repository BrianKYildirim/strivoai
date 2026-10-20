// Phase 01.1: edge callers import shared document limits through this bridge
// instead of reaching across three `../` levels in every function.
export {
  MAX_PAGES,
  DOCX_WORD_COUNT_BACKSTOP,
  MAX_UPLOAD_BYTES,
  RECRUITING_LENS_JD_MAX_CHARS,
  RECRUITING_LENS_JD_WARN_CHARS,
  getRecruitingLensJdLimitError,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
  MSG_JD_TOO_LONG,
} from '../../../src/config/document-limits.ts';

export type {
  LimitedDocumentType,
} from '../../../src/config/document-limits.ts';
