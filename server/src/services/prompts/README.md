# Prompts

One file per prompt. Each exports `build(params) → messages[]`, which goes to `llm/client.js` (`chat` or `chatJSON`).
Prompt text lives here only, never inline in business logic. Every JSON output is validated with zod by the caller.

| File | Purpose | Tier | Output schema | Caller |
|---|---|---|---|---|
| `extractStoryFacts.js` | One free-text answer → facts about its author, each with a verbatim quote, plus a 1-line story summary | mid | `{ summary, facts: [{ predicate: likes\|dislikes\|values\|story\|background\|goal, object, weight 0–1, quote }] }` (max 8 kept; non-verbatim quotes dropped) | `kg/extractFacts.js` (onboarding stories, inbox answers) |
| `describeStyle.js` | How the user texts, from their 8 sample replies + computed metrics | mid | `{ description: "5 lines", doList: [], dontList: [] }` | `kg/styleProfile.js` |
