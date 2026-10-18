# Metrics from saved conversations (no new chats)

Generated 2026-10-18 17:26 UTC by `node scripts/eval/metrics.js` from the last eval run of 5 conversations (`eval/raw-s1-split.json`).

## Voice and language fidelity (agent messages vs the persona's real replies; 0 = identical)

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.16
- **Language-mix distance** (L1/2 over the mix): mean 0.02; **code-switch rate difference**: mean 0.06
- **Script kept** (Devanagari personas still write Devanagari): 0/0

| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |
|---|---|---|---|---|---|---|
| c1 | Meera | 7 | 0.13 | 0.00 | 0.00 | 13.9 / 11.8 |
| c1 | Ishaan | 6 | 0.02 | 0.00 | 0.00 | 10.5 / 11.7 |
| c2 | Riya | 7 | 0.17 | 0.00 | 0.00 | 15.1 / 16.5 |
| c2 | Aditya | 6 | 0.18 | 0.00 | 0.00 | 12.5 / 18.6 |
| i2 | Tara | 7 | 0.19 | 0.00 | 0.00 | 12.3 / 11.3 |
| i2 | Sameer | 7 | 0.23 | 0.07 | 0.36 | 16.3 / 22.9 |
| m1 | Meera | 7 | 0.17 | 0.00 | 0.00 | 10.0 / 11.8 |
| m1 | Arjun | 6 | 0.17 | 0.05 | 0.10 | 9.3 / 13.1 |
| m2 | Parth | 6 | 0.19 | 0.04 | 0.10 | 8.3 / 16.0 |
| m2 | Ira | 7 | 0.16 | 0.00 | 0.00 | 9.6 / 4.6 |

## Conversation stats

- **Ask-back rate**: 0.58 · **distinct-2**: 0.95 · **disagreements**: 5 (0 resolved)
- **Fallbacks**: 1 template / 4 constrained of 66 agent messages

| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| c1 | compatible → maybe | 13 | natural | 0.46 | 0.93 | 6.68 / 7.12 | 0 (0) | 6 | 0 + 2 constrained |
| c2 | compatible → compatible | 13 | natural | 0.85 | 0.93 | 5.65 / 8.47 | 2 (0) | 6 | 0 + 0 constrained |
| i2 | incompatible → maybe | 14 | max_turns | 0.57 | 0.96 | 8.62 / 9.06 | 1 (0) | 6 | 0 + 1 constrained |
| m1 | maybe → compatible | 13 | natural | 0.54 | 0.97 | 3.65 / 7.89 | 1 (0) | 6 | 1 + 0 constrained |
| m2 | maybe → maybe | 13 | natural | 0.46 | 0.94 | 4.79 / 8.02 | 1 (0) | 6 | 0 + 1 constrained |

## Observer accuracy (my notes about them vs their own graph)

- **Precision**: 28/49 checkable notes match their graph (same concept + polarity, or same attribute + value) = 0.57
- **Recall**: 10/14 of their facts they mentioned in chat were noted = 0.71

| pair | observer | notes | checkable | correct | mentioned by them | noted |
|---|---|---|---|---|---|---|
| c1 | Meera | 5 | 5 | 4 | 1 | 0 |
| c1 | Ishaan | 6 | 6 | 3 | 1 | 1 |
| c2 | Riya | 5 | 5 | 4 | 3 | 1 |
| c2 | Aditya | 6 | 6 | 4 | 3 | 3 |
| i2 | Tara | 6 | 6 | 4 | 2 | 2 |
| i2 | Sameer | 5 | 5 | 2 | 1 | 0 |
| m1 | Meera | 6 | 6 | 3 | 1 | 1 |
| m1 | Arjun | 3 | 3 | 3 | 1 | 1 |
| m2 | Parth | 3 | 3 | 1 | 1 | 1 |
| m2 | Ira | 4 | 4 | 0 | 0 | 0 |

