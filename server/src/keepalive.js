// Layer 1 of the keep-alive (plan 12 §2): ping our own public /health every KEEPALIVE_INTERVAL_MIN so Render's free
// tier sees inbound traffic and doesn't sleep after 15 idle minutes. It can't wake a sleeping service: cron-job.org and
// the GitHub Actions workflow do that. Logs only failures.
import { env } from './config/env.js';

const status = { startedAt: new Date(), lastSelfPingAt: null, lastSelfPingOk: null };
let timer = null;

export const keepaliveStatus = () => ({ ...status, uptimeSeconds: Math.round(process.uptime()) });

export function startKeepalive() {
  const base = process.env.RENDER_EXTERNAL_URL; // set by Render
  if (!env.KEEPALIVE_SELF_PING || !base || timer) return;
  const ping = async () => {
    try {
      const res = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(30_000) });
      status.lastSelfPingOk = res.ok;
      if (!res.ok) console.error(`keep-alive: /health answered ${res.status}`);
    } catch (err) {
      status.lastSelfPingOk = false;
      console.error(`keep-alive: self-ping failed (${err.message})`);
    }
    status.lastSelfPingAt = new Date();
  };
  timer = setInterval(ping, env.KEEPALIVE_INTERVAL_MIN * 60_000);
  timer.unref();
}

export const stopKeepalive = () => { clearInterval(timer); timer = null; };
