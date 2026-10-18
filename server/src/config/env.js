import 'dotenv/config';
import dns from 'node:dns';
import { z } from 'zod';

// `KEY=` in .env arrives as "", which should mean "not set".
const blank = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const field = (schema) => z.preprocess(blank, schema);
const optional = field(z.string().trim().optional());
const bool = (fallback) => z.preprocess((v) => (blank(v) === undefined ? fallback : !['false', '0', 'no', 'off'].includes(String(v).trim().toLowerCase())), z.boolean());
// "inputUsdPer1M,outputUsdPer1M", e.g. "0.06,0.24". Default 0 (NVIDIA free tier).
const price = field(z.string().regex(/^\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*$/, 'expected "inputUsdPer1M,outputUsdPer1M", e.g. "0.06,0.24"').default('0,0'))
  .transform((s) => { const [input, output] = s.split(',').map(Number); return { input, output }; });

const schema = z.object({
  PORT: field(z.coerce.number().int().positive().default(5000)),
  NODE_ENV: field(z.enum(['development', 'production', 'test']).default('development')),
  CLIENT_URL: field(z.string().default('http://localhost:5173')),
  MONGODB_URI: field(z.string({ error: 'MONGODB_URI is required' }).trim()),
  // Local only: some home routers refuse Node's SRV lookups for mongodb+srv:// (Atlas). e.g. DNS_SERVERS=8.8.8.8,1.1.1.1
  DNS_SERVERS: optional,
  JWT_SECRET: field(z.string({ error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters')),
  ADMIN_TOKEN: optional,
  SEED_PASSWORD: optional, // shared login for seed personas (scripts/seed.js); never committed
  JUDGE_PASSWORD: optional, // login for the pre-baked judge accounts (seed.js --judges); goes in Devpost's testing field only

  // LLM provider: Nebius Token Factory (final) or NVIDIA build.nvidia.com (temporary). Same variables, env-only switch.
  LLM_PROVIDER: field(z.enum(['nvidia', 'nebius']).default('nebius')), // logging + README notes only
  NEBIUS_API_KEY: optional,
  NEBIUS_BASE_URL: field(z.string().url().default('https://api.tokenfactory.nebius.com/v1/')),
  MODEL_FAST: optional,
  MODEL_MID: optional,
  MODEL_SMART: optional,
  MODEL_EMBED: optional,
  // Plan 19 live check: a Nemotron VL model (on Token Factory, copy its ID from GET /v1/models; plan 14 checklist).
  MODEL_VISION: field(z.string().trim().default('nvidia/nemotron-3.5-super-vl-120b-a12b')), // NVIDIA lists this Nemotron VL; nano-12b-v2-vl isn't on our account
  LIVE_CHECK_ENABLED: bool(true),
  LIVE_CHECK_MAX_PER_DAY: field(z.coerce.number().int().positive().default(5)),
  LIVE_CHECK_TTL_S: field(z.coerce.number().int().positive().default(90)),
  TAVILY_API_KEY: optional,
  // Tavily has 1,000 credits in total (dev + seeding + demo + judging). A basic search = 1 credit; counted per database.
  TAVILY_MAX_SEARCHES: field(z.coerce.number().int().nonnegative().default(30)), // all-time cap; production sets it in render.yaml
  TAVILY_SEARCHES_PER_USER_DAY: field(z.coerce.number().int().nonnegative().default(3)),
  // Nemotron reasoning per tier. Off for fast (chat turns, quick checks): ~1 s instead of 10–40 s.
  LLM_REASONING_FAST: bool(false),
  LLM_REASONING_MID: bool(true),
  LLM_REASONING_SMART: bool(true),
  LLM_REASONING_VISION: bool(false),

  // Rate limiting + budgets
  LLM_MAX_RPM: field(z.coerce.number().int().positive().default(35)),
  LLM_DAILY_CALLS_PER_USER: field(z.coerce.number().int().positive().default(300)),
  LLM_DAILY_TOKENS_GLOBAL: field(z.coerce.number().int().positive().default(3_000_000)),
  LLM_SMART_DAILY_CALLS: field(z.coerce.number().int().positive().default(60)),

  // Hard spending protection
  LLM_ENABLED: bool(true), // false = kill switch, every LLM call fails immediately
  LLM_HARD_CAP_USD: field(z.coerce.number().nonnegative().default(35)), // all-time; reached = all LLM calls blocked
  LLM_PRICE_FAST: price,
  LLM_PRICE_MID: price,
  LLM_PRICE_SMART: price,
  LLM_PRICE_EMBED: price,
  LLM_PRICE_VISION: price,

  // Agent conversation (plan 08)
  AGENT_DEBOUNCE_MS: field(z.coerce.number().int().nonnegative().default(4000)),
  AGENT_MIN_DELAY_MS: field(z.coerce.number().int().nonnegative().default(1500)),
  AGENT_MAX_DELAY_MS: field(z.coerce.number().int().nonnegative().default(20000)),
  AGENT_STALE_HOURS: field(z.coerce.number().positive().default(24)),
  LOG_LEVEL: field(z.enum(['info', 'debug']).default(process.env.NODE_ENV === 'production' ? 'info' : 'debug')),
  DEMO_PACING: field(z.enum(['normal', 'fast']).default('normal')), // fast: 0.3–2 s typing delays for seed + judge accounts only (plan 12 §7)
  JUDGE_LIVE_CHATS_PER_DAY: field(z.coerce.number().int().positive().default(2)), // new agent chats per non-seed user per UTC day (plan 12 §7)
  RULES: field(z.enum(['on', 'off']).default('on')), // plan 11 B4 ablation: off = plain agents (no act plan, stance, exemplars, interest meter)
  KEEPALIVE_SELF_PING: bool(false), // Render: ping our own RENDER_EXTERNAL_URL/health so the free tier doesn't sleep (plan 12)
  KEEPALIVE_INTERVAL_MIN: field(z.coerce.number().positive().default(10)),
  JOB_WORKER: bool(true), // false: this process only enqueues (scripts); the web process runs the worker
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Invalid environment configuration (see server/.env.example):');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
if (env.DNS_SERVERS) dns.setServers(env.DNS_SERVERS.split(',').map((x) => x.trim()).filter(Boolean));
export const clientOrigins = env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean);

// Optional so the app (and frontend dev) boots without keys; llm/client.js throws a clear error on first use.
const missing = ['NEBIUS_API_KEY', 'MODEL_FAST', 'MODEL_MID', 'MODEL_SMART', 'MODEL_EMBED', 'TAVILY_API_KEY'].filter((k) => !env[k]);
if (missing.length) console.warn(`⚠ Missing LLM/API env vars (AI features will fail): ${missing.join(', ')}`);
if (!env.LLM_ENABLED) console.warn('⚠ LLM_ENABLED=false: all AI calls are switched off');
