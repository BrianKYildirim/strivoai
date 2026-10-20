/**
 * Onboarding submit-path timing probe — quick 260805-8ni.
 *
 * PASTE THIS INTO THE BROWSER DEVTOOLS CONSOLE, on the onboarding page, BEFORE you
 * click "Finish Setup". Then run onboarding normally. When the page navigates to
 * /results it prints a segment table for that run.
 *
 * It is a pure OBSERVER: it wraps window.fetch to record timings and does not modify,
 * delay, retry, or drop any request. Nothing here ships in the bundle — this file is a
 * manual measurement aid, not application code.
 *
 * Usage:
 *   1. Open the staging app, log in as the tier you want to measure (Free or Elite).
 *   2. Navigate to /onboarding and fill the form, but DO NOT submit yet.
 *   3. Open DevTools console, paste this whole file, press Enter.
 *   4. Click "Finish Setup".
 *   5. After it navigates, run:  __strivoTiming.report()
 *      (Navigation clears the console by default — untick "Preserve log" off, or just
 *       call report() from the Results page; the data lives on sessionStorage.)
 */
(() => {
  const STORE_KEY = '__strivo_timing_260805_8ni';

  // Segments we care about on the onboarding submit path, matched against the request URL.
  const SEGMENTS = [
    ['validate-document', 'validate document (server parse + gate)'],
    ['begin-feature-run', 'begin-feature-run (costing correlation)'],
    ['/storage/v1/object/resumes', 'resume upload (storage)'],
    ['/storage/v1/object/sign/resumes', 'signed URL'],
    ['/rest/v1/resumes', 'resumes row'],
    ['/rest/v1/career_targets', 'career_targets upsert'],
    ['/rest/v1/profiles', 'profiles update'],
    ['/rest/v1/rpc/', 'merits / rpc'],
    ['ocr-pdf', 'ocr-pdf fallback'],
    ['extract-analysis-structure', 'extract-analysis-structure'],
    ['analyze-resume', 'analyze-resume DISPATCH'],
  ];

  function classify(url) {
    for (const [needle, label] of SEGMENTS) {
      if (url.includes(needle)) return label;
    }
    return null;
  }

  const load = () => {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    } catch {
      return [];
    }
  };
  const save = (rows) => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(rows));
    } catch {
      /* storage may be restricted; the in-memory copy still works */
    }
  };

  if (window.__strivoTiming) {
    console.warn('[strivo-timing] probe already installed — reusing it.');
  } else {
    const origFetch = window.fetch.bind(window);
    const t0 = performance.now();

    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const label = classify(url);
      if (!label) return origFetch(...args);

      const method = (args[1] && args[1].method) || (args[0] && args[0].method) || 'GET';
      const start = performance.now();
      let status = 0;
      try {
        const res = await origFetch(...args);
        status = res.status;
        return res;
      } finally {
        const rows = load();
        rows.push({
          label,
          method,
          status,
          startMs: Math.round(start - t0),
          durationMs: Math.round(performance.now() - start),
        });
        save(rows);
      }
    };

    window.__strivoTiming = {
      reset() {
        save([]);
        console.log('[strivo-timing] cleared.');
      },
      rows: load,
      report() {
        const rows = load();
        if (!rows.length) {
          console.warn('[strivo-timing] no rows captured — was the probe installed before submit?');
          return;
        }
        // Browsers issue a CORS preflight per cross-origin POST; it is not visible to
        // fetch(), so these durations are POST-inclusive-of-preflight wall clock, which
        // is exactly the number the user experiences.
        const sorted = [...rows].sort((a, b) => a.startMs - b.startMs);
        const dispatch = sorted.find((r) => r.label.includes('DISPATCH'));
        console.table(sorted);
        const first = sorted[0];
        if (dispatch) {
          console.log(
            `[strivo-timing] PRE-DISPATCH WINDOW: ${dispatch.startMs - first.startMs} ms ` +
              `(first request -> analyze-resume dispatch). This is the number to compare.`,
          );
        }
        const serialSum = sorted.reduce((acc, r) => acc + r.durationMs, 0);
        console.log(`[strivo-timing] sum of segment durations: ${serialSum} ms`);
        console.log(
          '[strivo-timing] If the parallelization is working, the pre-dispatch window ' +
            'should be MEANINGFULLY LESS than the sum of segment durations.',
        );
        return sorted;
      },
    };
    console.log(
      '%c[strivo-timing] probe installed. Submit onboarding, then run __strivoTiming.report()',
      'color:#0a0;font-weight:bold',
    );
  }
})();
