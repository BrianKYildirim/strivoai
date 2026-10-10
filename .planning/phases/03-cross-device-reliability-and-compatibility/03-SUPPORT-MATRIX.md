# Phase 03 Supported Browser and Device Matrix

Per D-05, an engine/emulation result and a real browser/device result are separate
evidence. A row is “supported” only when both exist; otherwise its status is honest.

| Environment | Automated engine evidence | Real environment evidence | Status |
| --- | --- | --- | --- |
| Chromium desktop, current | Five-project matrix and full baseline passed | No dedicated real Chrome/Edge host pass recorded | Partially verified |
| Firefox desktop, 114+ | Full Firefox project passed | No separate physical-host pass recorded | Partially verified |
| Safari on macOS, 15.4+ | WebKit project passed | P-2 deferred | Partially verified |
| iPhone/iPad Safari, 15.4+ | Mobile WebKit emulation passed | P-3 deferred | Partially verified |
| Android Chrome, 100+ | Mobile Chromium emulation passed | P-4 deferred | Partially verified |
| Edge on Windows | Chromium engine passed | Real `msedge` P-5 deferred | Partially verified |
| Opera, 86+ | Chromium engine coverage | No real Opera pass | Partially verified |
| Private/restricted storage | Storage-failure and session recovery gates passed | Safari Private/ITP duration pass deferred | Partially verified |
| Slow/offline/reconnect | Deterministic five-engine gates passed | Real cellular P-8 deferred | Partially verified |
| Stale deployment | Deleted/stalled chunk recovery gates passed | Real redeploy P-6 deferred | Partially verified |
| Common extensions | Injected-error isolation gates passed | Real extensions P-7 deferred | Partially verified |

## Explicitly unsupported or unverified

- Browsers below the guidance floors are not guaranteed, though capability detection
  may allow degraded operation.
- Internet Explorer and browsers without the required ES/module/CSS capabilities are
  not supported; the pre-bundle fallback provides a controlled message.
- Physical-device safe areas, focus zoom, radio latency, severe memory pressure,
  long-duration Safari ITP, real extensions, real redeploy skew, and payment
  completion were not manually verified in this milestone.
- The immutable Phase 3 frontend is not live on `strivoai.net` or
  `www.strivoai.net`; customer-domain cutover was deliberately deferred.
