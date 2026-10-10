/**
 * Phase 03 · 03-05 · XDEV-06 — document-upload parity across engines.
 *
 * XDEV-06 asks whether browsers disagreeing about a file's MIME type can change
 * what the app accepts. 03-RESEARCH.md § HEAD Grounding asserts they cannot,
 * because the decision is made from MAGIC BYTES on both sides:
 *   - client: `src/lib/document-extraction.ts:140` `precheckResumeDocument()`
 *     keys off the FILE EXTENSION and then `hasPdfMagic()` / the PK zip header —
 *     `file.type` is never consulted;
 *   - server: `supabase/functions/_shared/document-validation.ts` sniffs magic
 *     bytes into a `SniffedKind` and is authoritative.
 *
 * THIS SPEC VERIFIES THAT CLAIM RATHER THAN RE-IMPLEMENTING IT. Same bytes, same
 * filename, three different reported MIME types — the outcome must be identical
 * on all five projects. An asserted claim that turns out false is a defect; an
 * unasserted claim is a assumption, and this phase exists because assumptions
 * failed on other people's devices.
 *
 * ANTI-VACUITY: a fourth case flips the EXTENSION while keeping a correct PDF
 * MIME and correct PDF bytes. That one must be REJECTED. Without it, a spec that
 * accepted literally everything would report a confident green.
 *
 * WHY @xdev: `File`/`Blob` MIME reporting, the `accept` attribute's effect and
 * `FileReader`/`arrayBuffer()` behaviour are all engine-implemented, and the
 * client pre-check runs pdf.js in a MODULE WORKER (`src/lib/pdf-worker.ts`) whose
 * support differs by engine — the exact class of difference this subset exists for.
 *
 * NO RUN IS STARTED AND NOTHING IS UPLOADED: `selectResumeFile()` performs a
 * purely local pre-check (`Upload.tsx:83-95`). The `validate-document` call and
 * every Merit-consuming path live behind the Analyze button, which is never clicked.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './surfaces';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/test-resume.pdf');

/** Locked in `src/config/document-limits.ts:33`. */
const EXPECTED_ACCEPT = '.pdf,.docx';
/** Locked in `src/config/document-limits.ts:52`. */
const MSG_UNSUPPORTED_TYPE = 'Unsupported file type. Please upload a PDF or DOCX file.';

interface ParityCase {
  id: string;
  fileName: string;
  mimeType: string;
  expected: 'accepted' | 'rejected';
  why: string;
}

const CASES: readonly ParityCase[] = [
  {
    id: 'correct-mime',
    fileName: 'strivo-parity.pdf',
    mimeType: 'application/pdf',
    expected: 'accepted',
    why: 'baseline — what a well-behaved browser reports',
  },
  {
    id: 'empty-mime',
    fileName: 'strivo-parity.pdf',
    mimeType: '',
    expected: 'accepted',
    why: 'what several engines report for an unknown/unregistered type',
  },
  {
    id: 'wrong-mime',
    fileName: 'strivo-parity.pdf',
    mimeType: 'image/png',
    expected: 'accepted',
    why: 'a deliberately wrong MIME must NOT change the verdict — the bytes decide',
  },
  {
    id: 'wrong-extension-control',
    fileName: 'strivo-parity.png',
    mimeType: 'application/pdf',
    expected: 'rejected',
    why: 'ANTI-VACUITY control — a correct MIME must not rescue an unsupported extension',
  },
];

test.describe('upload MIME parity discovery @xdev', () => {
  test('client accept/reject is identical for correct, empty and wrong MIME', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    const bytes = readFileSync(FIXTURE);

    await page.goto('/upload');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });

    const input = page.locator('#file-input');
    await expect(input).toBeAttached({ timeout: 30_000 });

    // The `accept` attribute is browser-surfaced UI, so assert it per engine.
    expect(
      await input.getAttribute('accept'),
      `the file input's accept attribute differs on ${testInfo.project.name}`,
    ).toBe(EXPECTED_ACCEPT);

    const accepted = page.getByRole('button', { name: 'Choose Different File' });
    const rejection = page.getByText(MSG_UNSUPPORTED_TYPE, { exact: false });
    const observed: string[] = [];

    for (const testCase of CASES) {
      await page.locator('#file-input').setInputFiles({
        name: testCase.fileName,
        mimeType: testCase.mimeType,
        buffer: bytes,
      });

      if (testCase.expected === 'accepted') {
        await expect(
          accepted,
          `${testCase.id} (${testCase.why}) was REJECTED on ${testInfo.project.name} — ` +
            'MIME reporting is changing the client verdict, which XDEV-06 says it must not',
        ).toBeVisible({ timeout: 30_000 });
        observed.push(`${testCase.id}=accepted`);
        // Return the drop zone to its empty state so the next case starts clean.
        await accepted.click();
        await expect(page.locator('#file-input')).toBeAttached();
      } else {
        await expect(
          rejection.first(),
          `${testCase.id} (${testCase.why}) was ACCEPTED on ${testInfo.project.name} — ` +
            'the extension guard in precheckResumeDocument() did not fire',
        ).toBeVisible({ timeout: 30_000 });
        await expect(accepted).toHaveCount(0);
        observed.push(`${testCase.id}=rejected`);
      }
    }

    record(testInfo, 'parity-outcomes', observed.join(' '));
  });
});
