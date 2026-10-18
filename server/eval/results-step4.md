# Evaluation results

Generated 2026-10-18 06:30 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
4 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 1 | 0 | 0 | 0 |
| **maybe** | 0 | 0 | 1 | 0 |
| **incompatible** | 0 | 1 | 0 | 1 |

- **Accuracy** (non-fake pairs): 1/4 = 25%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/4 = 0%
- **Gate**: 0/0 gated pairs never became a chat
- **Fake detection**: 0/0 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 3% of agent messages; constrained regenerations: 2
- **Mean turns to verdict**: 16.5 messages
- **Mean tokens per pair**: 114,019 (fake pairs: 0); total 456,074 tokens across 4 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 6 (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)

## Every pair

| pair | people | expected | predicted | judges (confidence) | stop | turns | fallbacks | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|---|
| c4 | Dev × Nikhil | compatible | ✓ compatible | compatible (0.65) / compatible (0.7) | natural | 17 | 0/17 | 87,341 | Films and running in Mumbai; both career-first, need space in conflicts, long-term | [link](transcripts/c4-step4-run1.md) |
| i3 | Meghna × Kunal | incompatible | ✖ maybe | maybe (0.5) / compatible (0.8) | natural | 17 | 1/17 | 131,432 | Meghna needs long-term (dealbreaker); Kunal wants short-term (hidden from his tags) | [link](transcripts/i3-step4-run1.md) |
| i5 | Gauri × Arnav | incompatible | ✖ none (agent_chatting) | — / — | — | 14 | 1/14 | 152,566 | Gauri needs a non-drinker (dealbreaker); Arnav brews beer and drinks regularly (hidden from his tags) | [link](transcripts/i5-step4-run1.md) |
| m1 | Meera × Arjun | maybe | ✖ incompatible | incompatible (0.9) / compatible (0.7) | dealbreaker | 18 | 0/18 | 84,735 | Shared trekking and cooking, both long-term; differ on where to live, career pace and conflict style | [link](transcripts/m1-step4-run1.md) |

