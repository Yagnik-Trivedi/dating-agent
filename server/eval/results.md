# Evaluation results

Generated 2026-10-16 04:01 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
6 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 4 | 0 | 0 | 0 |
| **maybe** | 0 | 0 | 0 | 0 |
| **incompatible** | 0 | 0 | 0 | 0 |

- **Accuracy** (non-fake pairs): 4/4 = 100%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/4 = 0%
- **Fake detection**: 2/2 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Mean turns to verdict**: 21.0 messages
- **Mean tokens per pair**: 200,578 (fake pairs: 5,229); total 812,771 tokens across 6 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 8 (max 2 per pair: one verdict per viewer)

## Every pair

| pair | people | expected | predicted | agents | stop | turns | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|
| c1 | Meera × Ishaan | compatible | ✓ compatible | compatible (0.83) / compatible (0.85) | max_turns | 24 | 177,361 | Trekking, reading, cooking; both long-term, staying in Pune, talk conflicts out, never smoke | [link](transcripts/c1-run1.md) |
| c2 | Riya × Aditya | compatible | ✓ compatible | compatible (0.9) / compatible (0.88) | agenda_complete | 12 | 124,777 | Indie music and cycling in Bengaluru; both want kids, balanced careers, long-term | [link](transcripts/c2-run1.md) |
| c3 | Sana × Leela | compatible | ✓ compatible | compatible (0.94) / compatible (0.96) | max_turns | 24 | 269,428 | Books, pottery, old-city food walks; both life-first, never drink, need lots of alone time | [link](transcripts/c3-run1.md) |
| c4 | Dev × Nikhil | compatible | ✓ compatible | compatible (0.86) / compatible (0.82) | max_turns | 24 | 230,747 | Films and running in Mumbai; both career-first, need space in conflicts, long-term | [link](transcripts/c4-run1.md) |
| f1 | Leela × Elena | flagged_fake | ✓ flagged_fake | — / — | — | 0 | 4,827 | Elena: abroad, crypto story, pushes to Telegram, no photos | [link](transcripts/f1-run1.md) |
| f2 | Pooja × Daniel | flagged_fake | ✓ flagged_fake | — / — | — | 0 | 5,631 | Daniel: army doctor abroad, forex investment, pushes off-app, no photos | [link](transcripts/f2-run1.md) |

