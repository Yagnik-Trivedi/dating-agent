# Metrics from saved conversations (no new chats)

Generated 2026-10-17 11:31 UTC by `node scripts/eval/metrics.js` from the last eval run of 4 conversations (`eval/raw.json`).

## Voice and language fidelity (agent messages vs the persona's real replies; 0 = identical)

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.25
- **Language-mix distance** (L1/2 over the mix): mean 0.08; **code-switch rate difference**: mean 0.28
- **Script kept** (Devanagari personas still write Devanagari): 0/0

| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |
|---|---|---|---|---|---|---|
| c1 | Meera | 3 | 0.29 | 0.00 | 0.00 | 13.0 / 11.8 |
| c1 | Ishaan | 3 | 0.21 | 0.00 | 0.00 | 7.7 / 11.7 |
| c7 | Hetal | 1 | 0.32 | 0.24 | 0.93 | 18.0 / 16.5 |
| c7 | Parth | 1 | 0.29 | 0.22 | 0.93 | 24.0 / 16.0 |
| i2 | Tara | 7 | 0.22 | 0.00 | 0.00 | 13.7 / 11.3 |
| i2 | Sameer | 7 | 0.21 | 0.06 | 0.08 | 14.6 / 22.9 |
| i6 | Zoya | 13 | 0.26 | 0.00 | 0.00 | 11.8 / 13.9 |
| i6 | Omkar | 11 | 0.19 | 0.09 | 0.27 | 10.0 / 9.1 |

## Conversation stats

- **Ask-back rate**: 0.74 · **distinct-2**: 0.90 · **disagreements**: 11 (0 resolved)
- **Fallbacks**: 2 template / 1 constrained of 46 agent messages

| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| c1 | compatible → maybe | 6 | natural | 0.83 | 0.89 | 4.71 / 7.12 | 0 (0) | 1 | 2 + 1 constrained |
| c7 | compatible → maybe | 2 | max_turns | 1.00 | 0.90 | 3.00 / 6.31 | 0 (0) | 0 | 0 + 0 constrained |
| i2 | incompatible → maybe | 14 | natural | 0.57 | 0.94 | 5.21 / 9.06 | 3 (0) | 6 | 0 + 0 constrained |
| i6 | incompatible → incompatible | 24 | natural | 0.54 | 0.86 | 5.53 / 6.80 | 8 (0) | 10 | 0 + 0 constrained |

## Observer accuracy (my notes about them vs their own graph)

- **Precision**: 17/42 checkable notes match their graph (same concept + polarity, or same attribute + value) = 0.40
- **Recall**: 7/12 of their facts they mentioned in chat were noted = 0.58

| pair | observer | notes | checkable | correct | mentioned by them | noted |
|---|---|---|---|---|---|---|
| c1 | Meera | 2 | 2 | 2 | 0 | 0 |
| c1 | Ishaan | 3 | 3 | 1 | 1 | 1 |
| c7 | Hetal | 2 | 2 | 1 | 1 | 0 |
| c7 | Parth | 1 | 1 | 0 | 1 | 0 |
| i2 | Tara | 8 | 8 | 4 | 3 | 3 |
| i2 | Sameer | 8 | 8 | 3 | 4 | 3 |
| i6 | Zoya | 8 | 8 | 2 | 1 | 0 |
| i6 | Omkar | 10 | 10 | 4 | 1 | 0 |

