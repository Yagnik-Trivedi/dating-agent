# Prompts

One file per prompt. Each exports `build(params) → messages[]`, which goes to `llm/client.js` (`chat` or `chatJSON`).
Prompt text lives here only, never inline in business logic. Every JSON output is validated with zod by the caller.

| File | Purpose | Tier | Output schema | Caller |
|---|---|---|---|---|
| `extractStoryFacts.js` | One free-text answer → facts about its author, each with a verbatim quote, plus a 1-line story summary | mid | `{ summary, facts: [{ predicate: likes\|dislikes\|values\|story\|background\|goal, object, weight 0–1, quote }] }` (max 8 kept; non-verbatim quotes dropped) | `kg/extractFacts.js` (onboarding stories, inbox answers) |
| `describeStyle.js` | How the user texts, from their 8 sample replies + computed metrics | mid | `{ description: "5 lines", doList: [], dontList: [] }` | `kg/styleProfile.js` |
| `profileConsistency.js` | Declared tags vs free text contradictions + scam-script patterns in a profile (dealbreakers excluded: private) | mid | `{ contradictions: [{ a, b (verbatim quote), topic, severity 1–3 }], scamSignals: [{ signal, quote }], genericBio, summary }` (non-verbatim quotes dropped) | `trust/checkProfile.js` |
| `profileToFacts.js` | A match's bio + prompt answers → low-confidence facts about them (tags become facts in code) | mid | `{ facts: [{ predicate, object, weight, quote }] }` (max 10 kept; non-verbatim quotes dropped; confidence 0.4) | `brief/buildBrief.js` |
| `dealbreakerClash.js` | Does one profile fact directly contradict one of the user's dealbreakers? (top 3 candidates only) | fast | `{ clash: boolean, why }` | `brief/buildBrief.js` |
| `matchBrief.js` | Who the match seems to be, 3 openers in the user's voice tied to their profile, watchouts | mid | `{ summary, openers: [{ text, hook }], watchouts: [] }` (openers > 2 sentences dropped) | `brief/buildBrief.js` |
| `agentReply.js` | The next chat message AS the user: style card, sayable facts (ids, `[already shared]`, `[level: …]`), what we know about them, agenda, last 20 messages; one explicit focus topic every other turn after the warm-up | mid, reasoning off | `{ reply, usedFactIds, targets, unknownAboutMe, wantsToEnd }` | `agent/generateReply.js` |
| `claimCheck.js` | Grounding: every self-claim in a draft must cite the fact id that supports it (answers to "what are you into?" count) | fast + mid, reasoning off, in parallel; either can veto | `{ claims: [{ claim, factId \| null }] }` | `agent/guard.js` |
| `beliefUpdate.js` | After each of their messages: facts about them (verbatim quotes only), agenda status updates, red flags | mid, reasoning off | `{ facts: [{ predicate, object, weight, confidence, quote, agendaId }], agendaUpdates: [{ id, status, note }], redFlags: [{ flag, quote }] }` | `agent/beliefUpdate.js` |
| `alignment.js` | Batched: for each (user fact, closest match fact) pair → aligned / neutral / conflicting | fast | `{ pairs: [{ id, alignment }] }` | `compat/evaluate.js` |
| `verdict.js` | The judge: chemistry, reasons + concerns citing message ids, ask-yourself questions, summary (ONE call per viewer) | smart | `{ chemistry, reasons: [{ text, messageIds }], concerns: [...], askYourself: [], summary }` (items without a real message id are dropped) | `compat/evaluate.js` |
| `icebreakers.js` | 3 conversation starters for after the handoff, using the match's name | fast | `{ icebreakers: [] }` | `compat/evaluate.js` |
| `windDown.js` | One kind closing message in the user's style (incompatible verdict or Pass) | fast | `{ reply }` (fixed line if it has a question or a risky phrase) | `compat/index.js` |
| `dateIdeas.js` | Tavily results → 3 first-date ideas tied to shared interests | fast | `{ ideas: [{ title, why, link }] }` (links not in the results are dropped) | `tavily/dateIdeas.js` |
