// Every knowledge-graph, engine, judge and job threshold (plan 15 §9, plan 17 §2). Plan 11's eval sweeps these.
export const KG = Object.freeze({
  // T_HIGH/T_LOW calibrated for nvidia/nemotron-3-embed-1b (scripts/calibrate-concepts.js, 50 alias pairs): true pairs
  // median 0.57, hardest wrong concept up to 0.64. Above 0.70 auto-match; 0.40–0.70 LLM tie-break; below, a new concept.
  T_HIGH: 0.70, T_LOW: 0.40, T_ASKED: 0.6, T_LEAK: 0.8,
  DECAY_HALF_LIFE_DAYS: 365, CURRENT_FACT_TTL_DAYS: 180,
  SELECT_K: 10, EXEMPLARS_K: 4, MIN_STORIES: 4, TOPIC_TEMP: 0.7,
  MAX_REGENERATIONS: 1, // Checkpoint A: one regeneration per message, max
  STYLE_REBUILD_EVERY: 20, REFLECT_EVERY: 10,
  // caps & retention
  MAX_SELF_FACTS: 150, MAX_VOICE_SAMPLES: 200, NOTES_RETENTION_DAYS: 30,
  VOICE_SAMPLES_ONBOARDING: 15,
  // embeddings
  EMBED_DIMS: null, // null = model default
  EMBED_STORAGE: 'float32', // 'float32' | 'int8'
  CONCEPT_CACHE_MAX: 5000, // above this, move concept search to Atlas Vector Search
  // conversation engine (plan 08)
  STANCE_HOLD: 0.7, STANCE_BEND: 0.4, RESOLVE_WINDOW: 4,
  K_LIKE: 0.25, K_DISLIKE: 0.25, K_QUESTION: 0.05, K_HUMOR: 0.05,
  K_LOW_EFFORT: 0.1, K_REPEAT: 0.05, K_DECAY: 0.1,
  LOW_INTEREST: 0.3, END_AFTER_LOW_TURNS: 3, MAX_TURNS: 24,
  TOPIC_SHIFT: 0.25, STORY_RATE: 0.2, TEMP_RANGE: [0.7, 1.0],
  AGENT_MODEL_BY_SIDE: null, JUDGE_MODEL: null,
  // judge (plan 09)
  JUDGE_YES_MIN: 0.6,
  // jobs (plan 17)
  JOB_POLL_MS: 1000, JOB_LOCK_MS: 120_000, JOB_MAX_ATTEMPTS: 5, JOB_DONE_TTL_DAYS: 7,
  JOB_CONCURRENCY: Object.freeze({
    buildUserGraph: 1, matchCreated: 2, agentTurn: 3, evaluate: 2, judge: 2, compactNotes: 1,
    rebuildVoice: 1, reflect: 1, reconfirm: 1, conceptCleanup: 1, archiveNotes: 1, seedLikeBack: 2,
  }),
});
