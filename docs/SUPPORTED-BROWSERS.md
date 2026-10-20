# Supported browsers and devices

Strivo uses capability detection rather than browser-name blocking. These version
floors are guidance and match the static pre-bundle support page:

| Browser family | Guidance floor | Automated evidence | Real-browser/device evidence |
| --- | --- | --- | --- |
| Chrome, Edge and Chromium browsers | 100+ | Chromium desktop and mobile emulation | Not completed in this milestone |
| Firefox | 114+ | Firefox desktop | Not completed on a separate physical host |
| Safari on macOS | 15.4+ | WebKit engine | Not completed; WebKit is not Safari-the-browser |
| Safari on iPhone/iPad | 15.4+ | Mobile WebKit emulation | Not completed on a physical iOS device |
| Opera | 86+ | Chromium engine coverage | Not completed in the Opera browser |

The automated matrix also exercises tablet/mobile viewports, restricted storage,
offline and reconnect behavior, stale bundles, slow/stalled requests, rapid repeat
clicks, reduced motion, upload variations and checkout presentation. Emulation proves
engine behavior; it does not prove physical-device safe areas, radio conditions,
memory pressure, Safari ITP duration, installed extensions, or provider-hosted
payment completion.

If the application reports an unavailable capability, update the current browser or
use another current browser. The static fallback remains available even when the
application bundle cannot boot.
