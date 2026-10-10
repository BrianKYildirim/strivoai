// ── Workload 8: Realtime subscriptions (concurrent REALTIME CONNECTIONS) ─────
//
// DIMENSION: concurrent realtime websocket connections. Each VU opens a Supabase
// Realtime (Phoenix) socket, joins a per-run channel doing postgres_changes on
// public.analysis_jobs (the only realtime-enabled table), holds it open with
// heartbeats, then closes. This is the connection-count ceiling, INDEPENDENT of
// analyses executing — 5000 held sockets != 5000 analyses.
//
// Ladder rungs (realtime): scale TARGET up to CAPS.maxRealtimeConns.
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=500 \
//     -e HOLD_SEC=60 scenarios/08-realtime-subscriptions.js

import ws from 'k6/ws';
import { check } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { realtimeConnections, businessErrors, firstClickCompletion } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const HOLD_SEC = Number(__ENV.HOLD_SEC || 60);

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxRealtimeConns',
  latencyClass: 'fast',
  defaultTarget: 500,
  gracefulStopSec: HOLD_SEC + 15,
});

export function setup() {
  const resolved = preflight(__ENV);
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }

  // Realtime endpoint. Supabase Realtime speaks the Phoenix protocol.
  const wsBase = data.url.replace(/^http/, 'ws');
  const socketUrl = `${wsBase}/realtime/v1/websocket?apikey=${data.anonKey}&vsn=1.0.0`;

  // A synthetic run id to subscribe to (need not exist; we measure the socket +
  // join, not delivery). Owner-scoped RLS still applies via access_token.
  const runId = `00000000-0000-4000-8000-${String(__VU).padStart(12, '0')}`;
  const topic = `realtime:analysis-run-${__VU}-${__ITER}`;

  let joined = false;

  const res = ws.connect(socketUrl, {}, function (socket) {
    socket.on('open', function () {
      realtimeConnections.add(1);
      // Phoenix join with postgres_changes config + the caller's access token.
      socket.send(
        JSON.stringify({
          topic,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { ack: false },
              presence: { key: '' },
              postgres_changes: [
                { event: 'UPDATE', schema: 'public', table: 'analysis_jobs', filter: `id=eq.${runId}` },
              ],
            },
            access_token: s.accessToken,
          },
          ref: '1',
        }),
      );
      // Heartbeat every 25s so the server doesn't drop us.
      socket.setInterval(function () {
        socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
      }, 25000);
      // Close after the hold window.
      socket.setTimeout(function () {
        socket.close();
      }, HOLD_SEC * 1000);
    });

    socket.on('message', function (msg) {
      try {
        const m = JSON.parse(msg);
        if (m.event === 'phx_reply' && m.ref === '1' && m.payload && m.payload.status === 'ok') {
          joined = true;
        }
      } catch {
        /* ignore non-JSON frames */
      }
    });

    socket.on('error', function () {
      businessErrors.add(1);
    });
  });

  const ok = check(res, { 'realtime handshake 101': (r) => r && r.status === 101 });
  firstClickCompletion.add(ok && joined);
}
