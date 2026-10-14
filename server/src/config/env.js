import 'dotenv/config';
import { z } from 'zod';

const optional = z.string().trim().min(1).optional();

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string({ error: 'MONGODB_URI is required' }).trim().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string({ error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters'),
  NEBIUS_API_KEY: optional,
  NEBIUS_BASE_URL: z.string().url().default('https://api.tokenfactory.nebius.com/v1/'),
  MODEL_FAST: optional,
  MODEL_MID: optional,
  MODEL_SMART: optional,
  MODEL_EMBED: optional,
  TAVILY_API_KEY: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n✖ Invalid environment configuration (see server/.env.example):');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const clientOrigins = env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean);

// ponytail: optional until plan 03; make these required there.
const missing = ['NEBIUS_API_KEY', 'MODEL_FAST', 'MODEL_MID', 'MODEL_SMART', 'MODEL_EMBED', 'TAVILY_API_KEY'].filter((k) => !env[k]);
if (missing.length) console.warn(`⚠ Missing LLM/API env vars (AI features will fail): ${missing.join(', ')}`);
