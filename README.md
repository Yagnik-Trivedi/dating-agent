# dating-agent

Dating apps match on preferences, not character, so people often find out two or three conversations in that a match isn't compatible. dating-agent is a MERN dating app with a built-in AI agent. After a match, your agent checks the other profile for fakes and inconsistencies, reads it to understand the person, and holds the early conversation in your own voice, grounded in your personal knowledge graph. It then classifies the match as **Compatible / Maybe / Not compatible**, with evidence. When it's compatible, you take over the chat. When it isn't, the agent politely winds it down and you never had to spend time on it.

Built for the Nebius x NVIDIA Global AI Hackathon.

## What the verdict is (and isn't)

Research on pre-meeting compatibility prediction is sobering: what people say they want, and how well two people
"match" on paper, predicts very little about whether they actually click (e.g. Joel, Eastwick & Finkel, 2017). So the
agent doesn't try to predict love. Its job is narrower: **filter clear mismatches and fakes, and save you the first few
conversations**. Every reason in a report cites the real messages it's based on, dealbreakers are a hard gate, a low-
confidence read is always a "Maybe", and you can override any verdict ("Talk anyway").

## Evaluation

We ran the full pipeline on 20 hand-labelled seed pairs (trust check → brief → agent ↔ agent chat → two independent
judges), once, on NVIDIA's free API. Full numbers: [`server/eval/results/latest.md`](server/eval/results/latest.md).

| What | Result |
|---|---|
| Fakes caught | **2/2**, no genuine profile flagged |
| Dealbreaker gate | **1/1**: the clashing pair never became a chat |
| Verdict accuracy (17 non-fake pairs) | **8/17 (47%)** with the judge deciding in code (was 4/17); **5/7** compatible pairs found (was 0/7); **1** compatible ↔ incompatible swap |
| Unsupported claims about the user | **21%** of 137 self-claims (offline judge); 28% vs 35% with the conversation rules on vs off |
| Voice fidelity | style distance **0.16**, language-mix distance **0.06** (0 = the persona's real texting) |
| Cost | ~101k tokens and ~17 messages per pair; fakes ~3k tokens |
| Scale (no LLM) | discover p95 **4.6 ms**; ~88 KB per user → ~5,900 users fit in a free Atlas M0 |

**What this tells us.** The agent is good at the part we trust it with: catching fakes and hard dealbreakers before
anyone spends time. The first run showed the judges hedging (one side said "unsure" in most chats), so the model now
only lists evidence (quotes, each tied to something that matters to you) and **code decides**: a stated dealbreaker or
a serious clash on something that matters a lot is a no; two or more quote-checked positives on what matters to you, with no
serious friction, is a yes; anything else is a Maybe. Re-judging the same 17 saved chats doubled accuracy
([rejudge.md](server/eval/results/rejudge.md)). The remaining misses were hidden conflicts nobody asked about, so the agent
now has to ask directly about anything that matters a lot to you before a chat can end; on fresh chats for those
pairs, the drinking conflict surfaced and was caught ([results-step4.md](server/eval/results-step4.md)).

## Setup

TODO

## How we use NVIDIA Nemotron + Nebius Token Factory

TODO
