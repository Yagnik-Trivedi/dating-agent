// Every knowledge-graph, engine, judge and job threshold (plan 15 §9, plan 17 §2). Plan 11's eval sweeps these.
export const KG = Object.freeze({
  // T_HIGH/T_LOW calibrated for nvidia/nemotron-3-embed-1b (scripts/calibrate-concepts.js, 50 alias pairs): true pairs
  // median 0.57, hardest wrong concept up to 0.64. Above 0.70 auto-match; 0.40–0.70 LLM tie-break; below, a new concept.
  T_HIGH: 0.70, T_LOW: 0.40,
  // Same embedding model: a question about a topic scores ~0.45–0.6 against the fact; a sentence restating a private
  // fact ~0.6+ (plan 08 probes in scripts/agent-check.js). The spec's 0.6 / 0.8 would never fire.
  T_ASKED: 0.45, T_LEAK: 0.62,
  DECAY_HALF_LIFE_DAYS: 365, CURRENT_FACT_TTL_DAYS: 180,
  SELECT_K: 10, EXEMPLARS_K: 4, MIN_STORIES: 4, TOPIC_TEMP: 0.7,
  MAX_REGENERATIONS: 1, // Checkpoint A: one regeneration per message, max
  MAX_INBOX_PER_CONVERSATION: 3, // new "ask my human" items per match; repeats of an open topic merge instead
  STYLE_REBUILD_EVERY: 20, REFLECT_EVERY: 10,
  // caps & retention
  MAX_SELF_FACTS: 150, MAX_VOICE_SAMPLES: 200, NOTES_RETENTION_DAYS: 30,
  VOICE_SAMPLES_ONBOARDING: 15,
  // embeddings
  EMBED_DIMS: null, // null = model default
  EMBED_STORAGE: 'int8', // 'float32' | 'int8': int8 = 1 byte/dim, cosine within 0.01 (test/vector.test.js); plan 05: a user's facts ~100 → 45 KB
  CONCEPT_CACHE_MAX: 5000, // above this, move concept search to Atlas Vector Search
  // conversation engine (plan 08)
  STANCE_HOLD: 0.7, STANCE_BEND: 0.4, RESOLVE_WINDOW: 4,
  K_LIKE: 0.25, K_DISLIKE: 0.25, K_QUESTION: 0.05, K_HUMOR: 0.05,
  K_LOW_EFFORT: 0.1, K_REPEAT: 0.05, K_DECAY: 0.1,
  LOW_INTEREST: 0.3, END_AFTER_LOW_TURNS: 3, MAX_TURNS: 24,
  EXTEND_TURNS: 8, // "Let them talk a bit longer" on a Maybe: at most this many more messages (plan 10 backend addition)
  TOPIC_SHIFT: 0.25, STORY_RATE: 0.2, TEMP_RANGE: [0.7, 1.0],
  STEER_AFTER_TURNS: 2, // my turns of warm-up before every-other-turn agenda steering
  STEER_RETRY_PRIORITY: 0.7, // agenda items at least this important are steered to again until answered…
  STEER_TRIES: 2, // …up to this many tries (eval i2: smoking was tried once, ignored by the model, never retried)
  END_BLOCK_PRIORITY: 0.7, // no natural end while an agenda item this important is unanswered (owner's tuning spec)
  ASK_EXPLICIT_PRIORITY: 0.9, // agenda items this important (and dealbreakers) need a direct question on their exact attribute before a natural end
  NEAR_END_MESSAGES: 6, // this close to MAX_TURNS, an open important item is the topic every turn
  ASK_BACK_FLOOR: 0.7, // min ask-back chance when I'm not bored (half that when they just asked me something)
  AGENT_MODEL_BY_SIDE: null, JUDGE_MODEL: null,
  // judge (plan 09)
  JUDGE_YES_MIN: 0.6, // a yes whose code confidence falls below this is unsure
  // The decision is made in code from the judge's verified evidence (owner's judge fix, 2026-10-18; judgeDecision.js).
  JUDGE_YES_POSITIVES: 2, // verified positives, in THEIR words, on my key facts needed for a yes
  JUDGE_KEY_IMPORTANCE: 0.6, // a key fact: a B answer that matters at least this much (medium/high) or a dealbreaker…
  JUDGE_KEY_STRENGTH: 0.6, // …or an interest I hold at least this strongly
  JUDGE_NO_IMPORTANCE: 0.9, // a severity-3 friction on a fact this important (or a dealbreaker) → no
  JUDGE_CONF: {
    NO_DEALBREAKER: 0.9, NO_SERIOUS: 0.8, // no: a stated dealbreaker conflict / a serious friction on a core fact
    YES_BASE: 0.7, YES_PER_EXTRA_POSITIVE: 0.05, YES_PER_NOTABLE_FRICTION: 0.05, YES_MAX: 0.95,
    UNSURE_BASE: 0.3, UNSURE_PER_EVIDENCE: 0.05, UNSURE_MAX: 0.5,
  },
  // jobs (plan 17)
  JOB_POLL_MS: 1000, JOB_LOCK_MS: 120_000, JOB_MAX_ATTEMPTS: 5, JOB_DONE_TTL_DAYS: 7,
  JOB_CONCURRENCY: Object.freeze({
    buildUserGraph: 1, matchCreated: 2, agentTurn: 3, evaluate: 2, judge: 2, compactNotes: 1,
    rebuildVoice: 1, reflect: 1, reconfirm: 1, conceptCleanup: 1, archiveNotes: 1, seedLikeBack: 2,
  }),
});
