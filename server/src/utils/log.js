// Log levels (plan 12): production (LOG_LEVEL=info) logs errors + one line per LLM call, never prompt or message
// contents; local dev (debug) also logs content-bearing diagnostics (rejected drafts, dropped openers, inbox questions).
import { env } from '../config/env.js';

export const debug = (...args) => { if (env.LOG_LEVEL === 'debug') console.warn(...args); };
