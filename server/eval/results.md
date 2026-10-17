# Evaluation results

Generated 2026-10-17 11:11 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
6 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 0 | 2 | 0 | 0 |
| **maybe** | 0 | 0 | 0 | 0 |
| **incompatible** | 0 | 1 | 1 | 0 |

- **Accuracy** (non-fake pairs): 1/4 = 25%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/4 = 0%
- **Gate**: 1/1 gated pairs never became a chat
- **Fake detection**: 1/1 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Mean turns to verdict**: 19.0 messages
- **Mean tokens per pair**: 89,428 (fake pairs: 2,933); total 360,645 tokens across 6 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 8 (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)

## Every pair

| pair | people | expected | predicted | judges (confidence) | stop | turns | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|
| c1 | Meera × Ishaan | compatible | ✖ maybe | compatible (0.85) / maybe (0.5) | natural | 14 | 57,569 | Trekking, reading, cooking; both long-term, staying in Pune, talk conflicts out, never smoke | [link](transcripts/c1-run1.md) |
| c7 | Hetal × Parth | compatible | ✖ maybe | maybe (0.6) / maybe (0.5) | max_turns | 24 | 116,761 | Food and startups in Ahmedabad; family-first, veg, never drink, want kids (Hetal has a mild interests inconsistency) | [link](transcripts/c7-run1.md) |
| f1 | Leela × Elena | flagged_fake | ✓ flagged_fake | — / — | — | 0 | 2,933 | Elena: abroad, crypto story, pushes to Telegram, no photos | [link](transcripts/f1-run1.md) |
| i1 | Nisha × Varun | gated | ✓ gated | — / — | — | 0 | 0 | Nisha's dealbreaker is kids (yes only); Varun doesn't want any and it's not in his public tags. The gate must keep them apart: never a match. | [link](transcripts/i1-run1.md) |
| i2 | Tara × Sameer | incompatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 14 | 69,897 | Tara can't be around smoke (dealbreaker); Sameer smokes regularly (hidden from his tags) | [link](transcripts/i2-run1.md) |
| i6 | Zoya × Omkar | incompatible | ✓ incompatible | incompatible (0.85) / incompatible (0.9) | natural | 24 | 113,485 | Lifestyle and values: nightlife, drinks regularly, no kids, figuring it out vs family-first, never drinks, wants kids soon, long-term (important to him) | [link](transcripts/i6-run1.md) |

