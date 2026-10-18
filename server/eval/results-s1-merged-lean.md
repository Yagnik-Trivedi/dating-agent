# Evaluation results

Generated 2026-10-18 16:51 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
6 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 2 | 0 | 0 | 0 |
| **maybe** | 1 | 1 | 0 | 0 |
| **incompatible** | 0 | 0 | 1 | 0 |

- **Accuracy** (non-fake pairs): 4/5 = 80%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/5 = 0%
- **Gate**: 1/1 gated pairs never became a chat
- **Fake detection**: 0/0 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 2% of agent messages; constrained regenerations: 4
- **Mean turns to verdict**: 13.2 messages
- **Mean tokens per pair**: 62,783 (fake pairs: 0); total 313,913 tokens across 6 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 10 (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)

## Every pair

| pair | people | expected | predicted | judges (confidence) | stop | turns | fallbacks | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|---|
| c1 | Meera × Ishaan | compatible | ✓ compatible | compatible (0.8) / compatible (0.85) | natural | 13 | 0/13 | 64,722 | Trekking, reading, cooking; both long-term, staying in Pune, talk conflicts out, never smoke | [link](transcripts/c1-s1-merged-lean-run1.md) |
| c2 | Riya × Aditya | compatible | ✓ compatible | compatible (0.85) / compatible (0.9) | natural | 13 | 0/13 | 61,399 | Indie music and cycling in Bengaluru; both want kids, balanced careers, long-term | [link](transcripts/c2-s1-merged-lean-run1.md) |
| i1 | Nisha × Varun | gated | ✓ gated | — / — | — | 0 | 0/0 | 0 | Nisha's dealbreaker is kids (yes only); Varun doesn't want any and it's not in his public tags. The gate must keep them apart: never a match. | [link](transcripts/i1-s1-merged-lean-run1.md) |
| i2 | Tara × Sameer | incompatible | ✓ incompatible | incompatible (0.8) / compatible (0.75) | natural | 14 | 0/14 | 66,200 | Tara can't be around smoke (dealbreaker); Sameer smokes regularly (hidden from his tags) | [link](transcripts/i2-s1-merged-lean-run1.md) |
| m1 | Meera × Arjun | maybe | ✖ compatible | compatible (0.8) / compatible (0.75) | natural | 13 | 1/13 | 61,568 | Shared trekking and cooking, both long-term; differ on where to live, career pace and conflict style | [link](transcripts/m1-s1-merged-lean-run1.md) |
| m2 | Ira × Parth | maybe | ✓ maybe | maybe (0.5) / compatible (0.7) | natural | 13 | 0/13 | 60,024 | Ira's profile and replies are too thin to judge | [link](transcripts/m2-s1-merged-lean-run1.md) |

