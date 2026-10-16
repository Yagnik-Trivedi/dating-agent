import 'dotenv/config';
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
  JWT_SECRET: field(z.string({ error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters')),
  ADMIN_TOKEN: optional,
  SEED_PASSWORD: optional, // shared login for seed personas (scripts/seed.js); never committed

  // LLM provider: Nebius Token Factory (final) or NVIDIA build.nvidia.com (temporary). Same variables, env-only switch.
  LLM_PROVIDER: field(z.enum(['nvidia', 'nebius']).default('nebius')), // logging + README notes only
  NEBIUS_API_KEY: optional,
  NEBIUS_BASE_URL: field(z.string().url().default('https://api.tokenfactory.nebius.com/v1/')),
  MODEL_FAST: optional,
  MODEL_MID: optional,
  MODEL_SMART: optional,
  MODEL_EMBED: optional,
  TAVILY_API_KEY: optional,
  // Nemotron reasoning per tier. Off for fast (chat turns, quick checks): ~1 s instead of 10–40 s.
  LLM_REASONING_FAST: bool(false),
  LLM_REASONING_MID: bool(true),
  LLM_REASONING_SMART: bool(true),

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

  // Agent conversation (plan 08)
  AGENT_DEBOUNCE_MS: field(z.coerce.number().int().nonnegative().default(4000)),
  AGENT_MIN_DELAY_MS: field(z.coerce.number().int().nonnegative().default(1500)),
  AGENT_MAX_DELAY_MS: field(z.coerce.number().int().nonnegative().default(20000)),
  AGENT_MAX_TURNS: field(z.coerce.number().int().positive().default(24)),
  AGENT_STALE_HOURS: field(z.coerce.number().positive().default(24)),
  DEMO_FAST: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Invalid environment configuration (see server/.env.example):');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const clientOrigins = env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean);

// Optional so the app (and frontend dev) boots without keys; llm/client.js throws a clear error on first use.
const missing = ['NEBIUS_API_KEY', 'MODEL_FAST', 'MODEL_MID', 'MODEL_SMART', 'MODEL_EMBED', 'TAVILY_API_KEY'].filter((k) => !env[k]);
if (missing.length) console.warn(`⚠ Missing LLM/API env vars (AI features will fail): ${missing.join(', ')}`);
if (!env.LLM_ENABLED) console.warn('⚠ LLM_ENABLED=false: all AI calls are switched off');
