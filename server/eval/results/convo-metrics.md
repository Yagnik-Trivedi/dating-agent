# Plan 31 conversation metrics (saved transcripts)

Generated 2026-10-21 06:48 UTC by `node scripts/eval/convo-metrics.js`. Targets (plan 31 A10): matching questions per chat 0–1, re-asked 0, with a setup 0, question rate ≤ 0.35, back-to-back 0, unbridgedQuestionRate falls vs SN, topic changes while they tell/vent 0.

| run | chats | agent msgs | matching ?s per chat (max) | re-asked | with a setup | question rate | back-to-back | unbridged rate | topic change while telling | length ratio (median) |
|---|---|---|---|---|---|---|---|---|---|---|
| s1-merged-lean | 5 | 66 | 3.60 (5) | 1 | 1 | 0.58 | 7 | 0.36 | 1 | 1.00 |
| s1-split | 5 | 66 | 3.20 (6) | 3 | 0 | 0.58 | 8 | 0.42 | 1 | 0.94 |
| full | 17 | 294 | 2.29 (8) | 5 | 4 | 0.58 | 36 | 0.33 | 2 | 1.00 |
| rules-on | 4 | 68 | 2.75 (4) | 2 | 0 | 0.51 | 14 | 0.43 | 0 | 0.91 |

## s1-merged-lean

| pair | msgs | matching ?s | re-asked | question rate | back-to-back | unbridged |
|---|---|---|---|---|---|---|
| c2 | 13 | 5 | 0 | 0.85 | 1 | 4 |
| c1 | 13 | 3 | 0 | 0.46 | 2 | 4 |
| m1 | 13 | 4 | 0 | 0.54 | 2 | 5 |
| i2 | 14 | 2 | 1 | 0.57 | 1 | 5 |
| m2 | 13 | 4 | 0 | 0.46 | 1 | 6 |

## s1-split

| pair | msgs | matching ?s | re-asked | question rate | back-to-back | unbridged |
|---|---|---|---|---|---|---|
| c1 | 13 | 2 | 1 | 0.46 | 1 | 5 |
| c2 | 13 | 5 | 0 | 0.69 | 2 | 7 |
| i2 | 14 | 3 | 0 | 0.71 | 2 | 9 |
| m1 | 13 | 6 | 2 | 0.62 | 1 | 3 |
| m2 | 13 | 0 | 0 | 0.38 | 2 | 4 |

## full

| pair | msgs | matching ?s | re-asked | question rate | back-to-back | unbridged |
|---|---|---|---|---|---|---|
| c1 | 16 | 2 | 0 | 0.38 | 1 | 3 |
| c2 | 19 | 8 | 0 | 0.74 | 2 | 10 |
| c3 | 17 | 2 | 0 | 0.71 | 0 | 2 |
| c4 | 17 | 1 | 0 | 0.29 | 2 | 1 |
| c5 | 17 | 3 | 0 | 0.65 | 2 | 2 |
| c6 | 17 | 2 | 0 | 0.65 | 3 | 8 |
| c7 | 17 | 2 | 0 | 0.88 | 1 | 8 |
| i2 | 18 | 1 | 1 | 0.50 | 4 | 8 |
| i3 | 17 | 1 | 0 | 0.65 | 3 | 7 |
| i4 | 18 | 1 | 1 | 0.44 | 4 | 4 |
| i5 | 17 | 1 | 0 | 0.71 | 3 | 9 |
| i6 | 17 | 1 | 0 | 0.53 | 1 | 6 |
| i7 | 17 | 2 | 1 | 0.47 | 1 | 7 |
| m1 | 17 | 3 | 1 | 0.47 | 2 | 2 |
| m2 | 18 | 2 | 1 | 0.44 | 4 | 7 |
| m3 | 18 | 3 | 0 | 0.44 | 2 | 2 |
| m4 | 17 | 4 | 0 | 0.88 | 1 | 12 |

## rules-on

| pair | msgs | matching ?s | re-asked | question rate | back-to-back | unbridged |
|---|---|---|---|---|---|---|
| c1 | 19 | 4 | 1 | 0.42 | 3 | 6 |
| i2 | 18 | 3 | 1 | 0.50 | 5 | 8 |
| c7 | 13 | 4 | 0 | 0.62 | 1 | 6 |
| i6 | 18 | 0 | 0 | 0.56 | 5 | 9 |

