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
  // Plan 30 S2 core onboarding: 5 replies (greeting, curious, opinion, plan, disagree); below VOICE_CONFIDENT_SAMPLES
  // the voice profile is marked low-confidence and the "Teach your agent more" card stays up.
  CORE_REPLY_IDS: ['e1', 'e2', 'e3', 'e6', 'e10'], VOICE_CONFIDENT_SAMPLES: 10,
  MAX_REGENERATIONS: 1, // Checkpoint A: one regeneration per message, max
  MAX_INBOX_PER_CONVERSATION: 3, // new "ask my human" items per match; repeats of an open topic merge instead
  // Plan 32 KP3 (A6.6): a small unknown ("which temple?") is filed only once it has come up in this many different chats.
  INBOX_REPEAT_CHATS: 2,
  // Plan 32 KP1 (A6.9, how you text): onboarding typed on a laptop reads as "rarely uses emoji, one message at a time".
  // The tap self-report sets the prior; desktop samples count less for emoji, length and bursts (fully for wording,
  // language and humour); the user's own chats after a handoff slowly override both.
  SELF_REPORT_WEIGHT: 4, // the self-report counts as this many samples
  DESKTOP_STYLE_WEIGHT: 0.35, // a desktop sample's weight for emoji, length and bursts
  SELF_REPORT_PRIORS: Object.freeze({
    emoji: Object.freeze({ a_lot: 1.2, some: 0.5, rarely: 0.05 }), // emoji per message
    bursts: Object.freeze({ several: 0.55, one: 0.08 }), // chance a reply goes out as 2 messages
    length: Object.freeze({ short: 6, medium: 12, long: 24 }), // words per reply
    caps: Object.freeze({ lowercase: 0.9, normal: 0.1 }), // share of messages starting lowercase
  }),
  BURST_PRIOR: 0.1, // no self-report and no own chats yet
  BURST_GAP_MS: 60_000, // my next message this soon, with nothing from them in between, continues a burst
  DEFAULT_EMOJIS: Object.freeze(['😂', '😄', '🙂']), // the user reports using emoji but none of their own is usable yet
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
  LOW_INTEREST: 0.3, END_AFTER_LOW_TURNS: 3,
  // Plan 30 S1: 12–14 messages, agenda-driven (dealbreaker topics first). Was 16 / 24: a 4-minute chat needs fewer turns.
  MAX_TURNS: 14, NATURAL_END_FROM: 12,
  EXTEND_TURNS: 8, // "Let them talk a bit longer" on a Maybe: at most this many more messages (plan 10 backend addition)
  STORY_RATE: 0.2, TEMP_RANGE: [0.7, 1.0],
  // Plan 30 SN (owner, 2026-10-19): agenda topics come up in the flow (a bridge in what was just said, or a lull),
  // never on a timer. Replaces the every-other-turn steering, the near-end forcing and the must-ask direct questions.
  WARMUP_TURNS: 2, // my first turns: no agenda topic, just get to know them
  TOPIC_GAP_TURNS: 2, // at least this many of my turns between two new topics (agenda or story)
  THREAD_TURNS: 4, // a thread this many of my turns old has had its run: moving on counts as a lull
  LULL_WORDS: 6, // their reply shorter than this (and no question) is a lull
  LULL_AGENDA_RATE: 0.6, // at a lull, an open agenda topic rather than one of my stories
  TOPIC_TRIES: 2, // a topic raised but not answered can come up again, through a bridge only, up to this many times
  END_BLOCK_PRIORITY: 0.7, // no natural end while an agenda item this important is unanswered (owner's tuning spec)
  ASK_BACK_FLOOR: 0.45, // min chance to end with a question when I'm not bored (was 0.7: every message became a question)
  ASK_AFTER_ANSWER: 0.6, // they just answered my question: share or react more often than asking again
  ASK_WHEN_ASKED: 0.6, // they asked me something: answer it; bounce a question back less often
  // Plan 31 (Arya, 2026-10-21; CONVO_MODE=human): the agent checks whether two people get along, it doesn't fill in a
  // form. Before the chat, code removes every matching question the gate, their public profile or low importance makes
  // needless; at most MAX_MATCHING_QUESTIONS plain question per chat, only when it fits.
  ASK_MIN_IMPORTANCE: 0.9, // a non-dealbreaker B answer below this never becomes a question ("high" = 0.9)
  MAX_MATCHING_QUESTIONS: 1,
  LENGTH_PULL: 0.6, // target length pulled this far from my sampled length toward their last message's
  MAX_LENGTH_RATIO: 2, // low energy: a draft longer than this × theirs (+ LENGTH_SLACK words) is regenerated
  LENGTH_SLACK: 4,
  // Topics for the two humans, after the handoff: B attributes and topic words (agenda topics, "leave for me" choices).
  HUMANS_ONLY: Object.freeze({ attributes: ['looking_for', 'kids'], topics: ['past relationships', 'exes', 'money', 'salary', 'health', 'family plans'] }),
  // Human mode: the chance of a question per message (no floor), × these when their read says so.
  ASK_HUMAN_MAX: 0.5, ASK_LOW_ENERGY: 0.3, ASK_WHEN_TOLD: 0.2,
  AGENT_MODEL_BY_SIDE: null, JUDGE_MODEL: null,
  // Plan 33 C1 (Arya, 2026-10-23): long chats in sessions, like texting over a few days, each sitting a bit deeper, and a
  // much higher bar for a match. CHAT_DEPTH (env) picks one; 'short' = today's one chat of MAX_TURNS and today's judge.
  // sessionMessages: a session's length is sampled in this range (both agents' messages, the close + goodbye included);
  // a natural close is allowed from the low end. gapMs: the wait before the next session, sampled in this range.
  CHAT_DEPTHS: Object.freeze({
    full: Object.freeze({ sessions: 5, sessionMessages: [16, 24], gapMs: [3 * 3_600_000, 12 * 3_600_000], minSessionsForYes: 3, minMessagesForYes: 50 }),
    demo: Object.freeze({ sessions: 3, sessionMessages: [16, 16], gapMs: [45_000, 75_000], minSessionsForYes: 3, minMessagesForYes: 40 }),
  }),
  // What each session may draw on (A5): session 1 small talk (surface), 2 adds stories and people (personal), 3+ deep.
  SESSION_TIERS: Object.freeze(['surface', 'personal', 'deep']),
  SESSION_RAW_MESSAGES: 20, // the transcript the agent sees raw; earlier sessions reach it as summaries + threads
  SESSION_CLOSING_STALE_MS: 120_000, // a session close nobody answered ends the session anyway (resume sweep)
  // The A7 bar (full and demo). A positive is THEIR words on one of MY facts (verified, as in short); its tier and branch
  // come from that fact (judge/evidenceTier.js). Surface likes count at most SURFACE_MAX in total; extra deep positives
  // may stand in for personal ones.
  SESSION_BAR: Object.freeze({
    YES_POSITIVES: 8, MIN_BRANCHES: 5, MIN_PERSONAL: 3, MIN_DEEP: 2, SURFACE_MAX: 3, MAX_NOTABLE: 2, YES_MIN: 0.8,
    LOW_INTEREST: 0.35, LOW_INTEREST_SESSIONS: 2, // my agent's interest below this at the end of 2 sessions in a row → no
  }),
  // Chemistry in the chat itself, measured in code (A7.5), from my side's point of view.
  CHEMISTRY: Object.freeze({ MIN_QUESTIONS: 3, MIN_LAUGHS: 2, SHRINK_MIN: 0.7, MIN_INTEREST: 0.6, INTEREST_SESSIONS: 2 }),
  SESSION_CONF: Object.freeze({ YES_BASE: 0.8, YES_PER_EXTRA_POSITIVE: 0.02, YES_PER_EXTRA_DEEP: 0.03, YES_PER_NOTABLE_FRICTION: 0.05, YES_MAX: 0.95, NO_LOW_INTEREST: 0.75 }),
  // Texture (A6): the user's own fillers at about their own rate; weak or uncertain facts said with a hedge.
  HEDGE_STRENGTH: 0.5, // a like or opinion held below this is said with a hedge ("i think", "kinda")
  FILLER_MAX_RATE: 0.6, // at most this chance of a filler per message, whatever the samples say
  THINK_RATE: 0.5, // answering me on something I hold loosely: × my hedge rate, the chance of thinking out loud first
  // judge (plan 09)
  JUDGE_YES_MIN: 0.65, // a yes whose code confidence falls below this is unsure (calibrated on the re-judged B5 chats: 0.6 → 2 harmful, 0.65 → 1)
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
    rebuildVoice: 1, reflect: 1, reconfirm: 1, conceptCleanup: 1, archiveNotes: 1, seedLikeBack: 2, profileCheck: 2, awaitGraph: 2, moderatePhoto: 2,
  }),
});
