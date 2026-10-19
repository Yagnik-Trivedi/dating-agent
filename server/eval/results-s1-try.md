# Evaluation results

Generated 2026-10-18 15:27 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
1 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 1 | 0 | 0 | 0 |
| **maybe** | 0 | 0 | 0 | 0 |
| **incompatible** | 0 | 0 | 0 | 0 |

- **Accuracy** (non-fake pairs): 1/1 = 100%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/1 = 0%
- **Gate**: 0/0 gated pairs never became a chat
- **Fake detection**: 0/0 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 8% of agent messages; constrained regenerations: 1
- **Mean turns to verdict**: 13.0 messages
- **Mean tokens per pair**: 71,357 (fake pairs: 0); total 71,357 tokens across 1 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 2 (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)

## Every pair

| pair | people | expected | predicted | judges (confidence) | stop | turns | fallbacks | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|---|
| c1 | Meera × Ishaan | compatible | ✓ compatible | compatible (0.7) / compatible (0.85) | natural | 13 | 1/13 | 71,357 | Trekking, reading, cooking; both long-term, staying in Pune, talk conflicts out, never smoke | [link](transcripts/c1-s1-try-run1.md) |

