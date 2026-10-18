# Metrics from saved conversations (no new chats)

Generated 2026-10-17 15:34 UTC by `node scripts/eval/metrics.js` from the last eval run of 4 conversations (`eval/raw.json`).

## Voice and language fidelity (agent messages vs the persona's real replies; 0 = identical)

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.17
- **Language-mix distance** (L1/2 over the mix): mean 0.04; **code-switch rate difference**: mean 0.07
- **Script kept** (Devanagari personas still write Devanagari): 0/0

| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |
|---|---|---|---|---|---|---|
| c1 | Meera | 9 | 0.09 | 0.00 | 0.00 | 16.2 / 11.8 |
| c1 | Ishaan | 10 | 0.06 | 0.00 | 0.00 | 14.4 / 11.7 |
| i2 | Tara | 10 | 0.05 | 0.00 | 0.00 | 13.7 / 11.3 |
| i2 | Sameer | 8 | 0.19 | 0.07 | 0.07 | 27.4 / 22.9 |
| c7 | Hetal | 7 | 0.28 | 0.12 | 0.22 | 10.9 / 16.5 |
| c7 | Parth | 6 | 0.21 | 0.05 | 0.27 | 10.3 / 16.0 |
| i6 | Zoya | 9 | 0.31 | 0.00 | 0.00 | 11.3 / 13.9 |
| i6 | Omkar | 9 | 0.14 | 0.06 | 0.04 | 9.8 / 9.1 |

## Conversation stats

- **Ask-back rate**: 0.52 · **distinct-2**: 0.87 · **disagreements**: 9 (0 resolved)
- **Fallbacks**: 2 template / 3 constrained of 68 agent messages

| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| c1 | compatible → incompatible | 19 | natural | 0.42 | 0.87 | 6.01 / 7.12 | 5 (0) | 7 | 1 + 0 constrained |
| i2 | incompatible → incompatible | 18 | natural | 0.50 | 0.88 | 8.03 / 9.06 | 3 (0) | 7 | 0 + 0 constrained |
| c7 | compatible → none (agent_chatting) | 13 | — | 0.62 | 0.90 | 4.67 / 6.31 | 1 (0) | 4 | 1 + 1 constrained |
| i6 | incompatible → maybe | 18 | natural | 0.56 | 0.85 | 3.52 / 6.80 | 0 (0) | 7 | 0 + 2 constrained |

## Observer accuracy (my notes about them vs their own graph)

- **Precision**: 14/67 checkable notes match their graph (same concept + polarity, or same attribute + value) = 0.21
- **Recall**: 5/9 of their facts they mentioned in chat were noted = 0.56

| pair | observer | notes | checkable | correct | mentioned by them | noted |
|---|---|---|---|---|---|---|
| c1 | Meera | 7 | 7 | 3 | 1 | 0 |
| c1 | Ishaan | 10 | 10 | 1 | 0 | 0 |
| i2 | Tara | 16 | 16 | 5 | 2 | 2 |
| i2 | Sameer | 13 | 13 | 5 | 3 | 3 |
| c7 | Hetal | 6 | 6 | 0 | 1 | 0 |
| c7 | Parth | 7 | 7 | 0 | 1 | 0 |
| i6 | Zoya | 6 | 6 | 0 | 0 | 0 |
| i6 | Omkar | 2 | 2 | 0 | 1 | 0 |

