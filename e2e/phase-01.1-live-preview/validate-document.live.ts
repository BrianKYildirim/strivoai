import { expect, test } from '@playwright/test';
import { buildResumePdfBytes } from '../fixtures/make-unique-resume';
import { makeDocx } from '../fixtures/make-docx';
import {
  makeMimeSpoofedText,
  makeRenamedMarkdown,
  makeSpoofedZip,
} from '../fixtures/make-spoofed';
import { accessToken, anonKey, validatorUrl } from './live-support';

const PAGE_LIMIT =
  'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.';
const UNSUPPORTED = 'Unsupported file type. Please upload a PDF or DOCX file.';

test('deployed preview route boots, exposes CORS metadata, and requires auth', async ({ request }) => {
  const options = await request.fetch(validatorUrl(), {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:8080',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers':
        'authorization, content-type, x-document-type, x-file-name',
    },
  });
  expect(options.status()).toBe(200);
  expect(options.headers()['access-control-allow-headers']).toContain('x-document-type');
  expect(options.headers()['access-control-allow-headers']).toContain('x-file-name');

  const unauthenticated = await request.post(validatorUrl(), {
    headers: {
      apikey: anonKey(),
      'x-document-type': 'resume',
      'x-file-name': encodeURIComponent('synthetic.pdf'),
    },
    data: Buffer.from(buildResumePdfBytes({ pageCount: 1, runToken: 'unauthenticated' })),
  });
  expect(unauthenticated.status()).toBe(401);
});

test('authenticated preview accepts one-page PDF and two-page DOCX', async ({ request }) => {
  const token = await accessToken(request);
  for (const candidate of [
    {
      bytes: buildResumePdfBytes({ pageCount: 1, runToken: 'live-one-page' }),
      name: 'synthetic-one-page.pdf',
      kind: 'pdf',
    },
    {
      bytes: await makeDocx({ pages: 2 }),
      name: 'synthetic-two-page.docx',
      kind: 'docx',
    },
  ]) {
    const response = await request.post(validatorUrl(), {
      headers: {
        apikey: anonKey(),
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'x-document-type': 'resume',
        'x-file-name': encodeURIComponent(candidate.name),
      },
      data: Buffer.from(candidate.bytes),
    });
    expect(response.status(), candidate.name).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, kind: candidate.kind });
  }
});

test('authenticated preview rejects three pages and all spoof/container cases', async ({ request }) => {
  const token = await accessToken(request);
  const candidates = [
    {
      bytes: buildResumePdfBytes({ pageCount: 3, runToken: 'live-three-page' }),
      name: 'synthetic-three-page.pdf',
      message: PAGE_LIMIT,
    },
    { ...makeRenamedMarkdown(), name: 'synthetic-renamed.pdf', message: UNSUPPORTED },
    { ...makeMimeSpoofedText(), name: 'synthetic-mime-spoof.pdf', message: UNSUPPORTED },
    { ...(await makeSpoofedZip()), name: 'synthetic-spoof.docx', message: UNSUPPORTED },
  ];

  for (const candidate of candidates) {
    const response = await request.post(validatorUrl(), {
      headers: {
        apikey: anonKey(),
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'x-document-type': 'resume',
        'x-file-name': encodeURIComponent(candidate.name),
      },
      data: Buffer.from(candidate.bytes),
    });
    expect(response.status(), candidate.name).toBe(400);
    expect((await response.json()).message, candidate.name).toBe(candidate.message);
  }
});
