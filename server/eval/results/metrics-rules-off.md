# Metrics from saved conversations (no new chats)

Generated 2026-10-17 16:45 UTC by `node scripts/eval/metrics.js` from the last eval run of 4 conversations (`eval/raw.json`).

## Voice and language fidelity (agent messages vs the persona's real replies; 0 = identical)

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.31
- **Language-mix distance** (L1/2 over the mix): mean 0.10; **code-switch rate difference**: mean 0.35
- **Script kept** (Devanagari personas still write Devanagari): 0/0

| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |
|---|---|---|---|---|---|---|
| c1 | Meera | 12 | 0.31 | 0.00 | 0.00 | 28.5 / 11.8 |
| c1 | Ishaan | 12 | 0.41 | 0.00 | 0.00 | 29.2 / 11.7 |
| c7 | Hetal | 12 | 0.35 | 0.24 | 0.85 | 34.8 / 16.5 |
| c7 | Parth | 12 | 0.41 | 0.22 | 0.85 | 27.3 / 16.0 |
| i2 | Tara | 12 | 0.15 | 0.00 | 0.00 | 21.3 / 11.3 |
| i2 | Sameer | 12 | 0.12 | 0.27 | 0.93 | 22.4 / 22.9 |
| i6 | Zoya | 10 | 0.39 | 0.00 | 0.00 | 25.0 / 13.9 |
| i6 | Omkar | 10 | 0.30 | 0.08 | 0.17 | 25.3 / 9.1 |

## Conversation stats

- **Ask-back rate**: 0.66 · **distinct-2**: 0.86 · **disagreements**: 2 (0 resolved)
- **Fallbacks**: 3 template / 0 constrained of 92 agent messages

| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| c1 | compatible → maybe | 24 | max_turns | 0.79 | 0.82 | 10.84 / 7.12 | 1 (0) | 0 | 1 + 0 constrained |
| c7 | compatible → maybe | 24 | max_turns | 0.83 | 0.88 | 12.08 / 6.31 | 0 (0) | 0 | 2 + 0 constrained |
| i2 | incompatible → maybe | 24 | max_turns | 0.25 | 0.86 | 5.88 / 9.06 | 1 (0) | 0 | 0 + 0 constrained |
| i6 | incompatible → none (agent_chatting) | 20 | — | 0.75 | 0.86 | 7.60 / 6.80 | 0 (0) | 0 | 0 + 0 constrained |

## Observer accuracy (my notes about them vs their own graph)

- **Precision**: 14/117 checkable notes match their graph (same concept + polarity, or same attribute + value) = 0.12
- **Recall**: 3/8 of their facts they mentioned in chat were noted = 0.38

| pair | observer | notes | checkable | correct | mentioned by them | noted |
|---|---|---|---|---|---|---|
| c1 | Meera | 13 | 13 | 3 | 1 | 0 |
| c1 | Ishaan | 16 | 16 | 0 | 1 | 0 |
| c7 | Hetal | 17 | 17 | 2 | 1 | 0 |
| c7 | Parth | 18 | 18 | 1 | 2 | 0 |
| i2 | Tara | 12 | 12 | 1 | 0 | 0 |
| i2 | Sameer | 11 | 11 | 1 | 0 | 0 |
| i6 | Zoya | 17 | 17 | 3 | 2 | 2 |
| i6 | Omkar | 13 | 13 | 3 | 1 | 1 |

