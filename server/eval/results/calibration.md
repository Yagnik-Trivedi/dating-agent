# Judge threshold calibration (JUDGE_YES_MIN)

Generated 2026-10-18 04:37 UTC by `node scripts/eval/calibrate.js` from raw-full.json, raw-rules-on.json: 20 labelled conversations with both judges' decisions.
A "yes" below the threshold becomes "unsure" (Maybe); the pair is the lower side. Current value: 0.6.

| threshold | correct | harmful errors |
|---|---|---|
| 0.50 | 5/20 | 2 |
| 0.55 | 5/20 | 2 |
| 0.60 (current) | 5/20 | 2 |
| 0.65 | 5/20 | 2 |
| 0.70 | 5/20 | 2 |
| 0.75 | 5/20 | 2 |
| 0.80 | 5/20 | 2 |
| 0.85 | 5/20 | 2 |
| 0.90 | 5/20 | 2 |
| 0.95 | 5/20 | 2 |

**Best: 0.50** (5/20 correct, 2 harmful). The threshold can only turn a low-confidence yes into Maybe; it cannot help pairs where a judge already said unsure or no.

