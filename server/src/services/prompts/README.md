# Prompts

One file per prompt. Each exports `build(params) → messages[]`, which goes to `llm/client.js` (`chat` or `chatJSON`).
Prompt text lives here only, never inline in business logic.

| File | Purpose | Tier | Output schema |
|---|---|---|---|
| _(added by later plans)_ | | | |
