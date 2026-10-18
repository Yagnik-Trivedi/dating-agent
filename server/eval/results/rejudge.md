# Re-judge: the B5 conversations with the decision made in code

Generated 2026-10-18 05:23 UTC by `node scripts/eval/rejudge.js`. Same 17 saved conversations as the full run (no new chats); only the judges changed. The gated pair and the two fakes never reach a judge and are unchanged (1/1, 2/2).

| | before (B5 judges) | after (decision in code) | target |
|---|---|---|---|
| Accuracy (non-fake pairs) | 4/17 = 24% | **8/17 = 47%** | |
| Compatible pairs called Compatible | 0/7 | **5/7** | ≥ 4/7 |
| Harmful errors (compatible ↔ incompatible) | 1 | **2** | ≤ 1 |

## Confusion matrix after (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible |
|---|---|---|---|
| **compatible** | 5 | 2 | 0 |
| **maybe** | 2 | 2 | 0 |
| **incompatible** | 2 | 3 | 1 |

## Confusion matrix before

| expected \ predicted | compatible | maybe | incompatible |
|---|---|---|---|
| **compatible** | 0 | 6 | 1 |
| **maybe** | 0 | 2 | 2 |
| **incompatible** | 0 | 4 | 2 |

## Per pair

| pair | expected | before | after | judges after (confidence: why) |
|---|---|---|---|---|
| c1 | compatible | maybe | ✓ compatible | compatible (0.95: 8 positives on what matters to you) / compatible (0.85: 7 positives on what matters to you) |
| c2 | compatible | incompatible | ✖ maybe | compatible (0.6: 3 positives on what matters to you) / maybe (0.5: a serious friction) |
| c3 | compatible | maybe | ✓ compatible | compatible (0.7: 3 positives on what matters to you) / compatible (0.75: 4 positives on what matters to you) |
| c4 | compatible | maybe | ✖ maybe | maybe (0.5: 1 positive(s) on what matters to you, 3 notable friction(s)) / compatible (0.7: 2 positives on what matters to you) |
| c5 | compatible | maybe | ✓ compatible | compatible (0.65: 3 positives on what matters to you) / compatible (0.8: 5 positives on what matters to you) |
| c6 | compatible | maybe | ✓ compatible | compatible (0.85: 6 positives on what matters to you) / compatible (0.8: 4 positives on what matters to you) |
| c7 | compatible | maybe | ✓ compatible | compatible (0.85: 5 positives on what matters to you) / compatible (0.75: 4 positives on what matters to you) |
| i2 | incompatible | incompatible | ✓ incompatible | incompatible (0.8: serious friction on smoking: never) / compatible (0.75: 3 positives on what matters to you) |
| i3 | incompatible | maybe | ✖ compatible | compatible (0.65: 2 positives on what matters to you) / compatible (0.6: 2 positives on what matters to you) |
| i4 | incompatible | incompatible | ✖ maybe | compatible (0.65: 3 positives on what matters to you) / maybe (0.5: a serious friction) |
| i5 | incompatible | maybe | ✖ compatible | compatible (0.8: 4 positives on what matters to you) / compatible (0.7: 2 positives on what matters to you) |
| i6 | incompatible | maybe | ✖ maybe | maybe (0.5: 1 positive(s) on what matters to you, 1 notable friction(s)) / maybe (0.45: 1 positive(s) on what matters to you, 2 notable friction(s)) |
| i7 | incompatible | maybe | ✖ maybe | maybe (0.4: 1 positive(s) on what matters to you) / maybe (0.5: a serious friction) |
| m1 | maybe | maybe | ✖ compatible | compatible (0.85: 5 positives on what matters to you) / compatible (0.85: 5 positives on what matters to you) |
| m2 | maybe | incompatible | ✓ maybe | maybe (0.5: a serious friction) / compatible (0.65: 2 positives on what matters to you) |
| m3 | maybe | incompatible | ✓ maybe | maybe (0.45: a serious friction) / compatible (0.75: 3 positives on what matters to you) |
| m4 | maybe | maybe | ✖ compatible | compatible (0.65: 2 positives on what matters to you) / compatible (0.7: 3 positives on what matters to you) |

