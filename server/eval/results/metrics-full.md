# Metrics from saved conversations (no new chats)

Generated 2026-10-18 04:37 UTC by `node scripts/eval/metrics.js` from the last eval run of 17 conversations (`eval/raw-full.json`).

## Voice and language fidelity (agent messages vs the persona's real replies; 0 = identical)

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.16
- **Language-mix distance** (L1/2 over the mix): mean 0.06; **code-switch rate difference**: mean 0.22
- **Script kept** (Devanagari personas still write Devanagari): 1/1

| pair | persona | agent msgs | style | language mix | code-switch Δ | avg words agent / real |
|---|---|---|---|---|---|---|
| c1 | Meera | 8 | 0.15 | 0.00 | 0.00 | 19.8 / 11.8 |
| c1 | Ishaan | 8 | 0.09 | 0.00 | 0.00 | 18.8 / 11.7 |
| c2 | Riya | 10 | 0.21 | 0.00 | 0.00 | 14.5 / 16.5 |
| c2 | Aditya | 9 | 0.17 | 0.00 | 0.00 | 12.4 / 18.6 |
| c3 | Sana | 8 | 0.14 | 0.00 | 0.00 | 32.4 / 23.4 |
| c3 | Leela | 9 | 0.11 | 0.00 | 0.00 | 30.0 / 26.8 |
| c4 | Dev | 8 | 0.12 | 0.00 | 0.00 | 12.3 / 10.3 |
| c4 | Nikhil | 9 | 0.01 | 0.00 | 0.00 | 5.4 / 3.2 |
| c5 | Ananya | 8 | 0.14 | 0.12 | 0.93 | 21.3 / 14.3 |
| c5 | Karthik | 9 | 0.08 | 0.06 | 0.71 | 17.7 / 16.5 |
| c6 | Pooja | 8 | 0.14 | 0.02 | 0.24 | 10.8 / 15.2 |
| c6 | Rohit | 9 | 0.29 | 0.01 | 0.27 | 16.2 / 15.5 |
| c7 | Hetal | 9 | 0.31 | 0.15 | 0.60 | 21.3 / 16.5 |
| c7 | Parth | 8 | 0.19 | 0.22 | 0.81 | 18.5 / 16.0 |
| i2 | Tara | 9 | 0.06 | 0.00 | 0.00 | 12.3 / 11.3 |
| i2 | Sameer | 9 | 0.29 | 0.16 | 0.60 | 18.1 / 22.9 |
| i3 | Meghna | 8 | 0.12 | 0.00 | 0.00 | 19.3 / 13.2 |
| i3 | Kunal | 9 | 0.16 | 0.04 | 0.11 | 17.8 / 14.9 |
| i4 | Aisha | 9 | 0.18 | 0.00 | 0.00 | 20.2 / 18.8 |
| i4 | Vikram | 9 | 0.02 | 0.00 | 0.00 | 6.1 / 4.0 |
| i5 | Gauri | 9 | 0.24 | 0.44 | 0.22 | 21.1 / 23.8 |
| i5 | Arnav | 8 | 0.20 | 0.21 | 0.63 | 19.3 / 14.9 |
| i6 | Zoya | 9 | 0.25 | 0.00 | 0.00 | 11.8 / 13.9 |
| i6 | Omkar | 8 | 0.17 | 0.09 | 0.27 | 11.9 / 9.1 |
| i7 | Kabir | 9 | 0.08 | 0.00 | 0.00 | 8.3 / 3.9 |
| i7 | Hetal | 8 | 0.35 | 0.03 | 0.18 | 9.6 / 16.5 |
| m1 | Meera | 8 | 0.10 | 0.00 | 0.00 | 11.3 / 11.8 |
| m1 | Arjun | 9 | 0.22 | 0.09 | 0.04 | 19.4 / 13.1 |
| m2 | Parth | 10 | 0.10 | 0.11 | 0.43 | 12.9 / 16.0 |
| m2 | Ira | 8 | 0.06 | 0.00 | 0.00 | 9.3 / 4.6 |
| m3 | Ananya | 9 | 0.18 | 0.11 | 0.82 | 19.9 / 14.3 |
| m3 | Varun | 9 | 0.07 | 0.00 | 0.00 | 19.9 / 16.3 |
| m4 | Pooja | 9 | 0.17 | 0.07 | 0.31 | 16.6 / 15.2 |
| m4 | Arnav | 8 | 0.34 | 0.07 | 0.25 | 14.9 / 14.9 |

## Conversation stats

- **Ask-back rate**: 0.58 · **distinct-2**: 0.89 · **disagreements**: 46 (2 resolved)
- **Fallbacks**: 22 template / 17 constrained of 294 agent messages

| pair | expected → predicted | agent msgs | stop | ask-back | distinct-2 | length sd agent / real | disagreements | steered | fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| c1 | compatible → maybe | 16 | dealbreaker | 0.38 | 0.86 | 8.41 / 7.12 | 3 (0) | 6 | 1 + 1 constrained |
| c2 | compatible → incompatible | 19 | natural | 0.74 | 0.82 | 6.18 / 8.47 | 3 (1) | 8 | 2 + 0 constrained |
| c3 | compatible → maybe | 17 | natural | 0.71 | 0.86 | 12.33 / 10.71 | 9 (1) | 9 | 1 + 0 constrained |
| c4 | compatible → maybe | 17 | natural | 0.29 | 0.92 | 4.36 / 4.34 | 3 (0) | 6 | 0 + 0 constrained |
| c5 | compatible → maybe | 17 | natural | 0.65 | 0.83 | 5.64 / 6.64 | 5 (0) | 4 | 0 + 1 constrained |
| c6 | compatible → maybe | 17 | natural | 0.65 | 0.89 | 7.77 / 5.66 | 0 (0) | 6 | 3 + 1 constrained |
| c7 | compatible → maybe | 17 | natural | 0.88 | 0.89 | 8.81 / 6.31 | 1 (0) | 7 | 2 + 2 constrained |
| i2 | incompatible → incompatible | 18 | natural | 0.50 | 0.92 | 7.40 / 9.06 | 3 (0) | 8 | 2 + 1 constrained |
| i3 | incompatible → maybe | 17 | natural | 0.65 | 0.91 | 8.53 / 5.20 | 1 (0) | 8 | 1 + 1 constrained |
| i4 | incompatible → incompatible | 18 | natural | 0.44 | 0.91 | 7.83 / 8.24 | 3 (0) | 6 | 0 + 1 constrained |
| i5 | incompatible → maybe | 17 | natural | 0.71 | 0.96 | 9.80 / 8.81 | 0 (0) | 8 | 4 + 1 constrained |
| i6 | incompatible → maybe | 17 | natural | 0.53 | 0.84 | 5.43 / 6.80 | 3 (0) | 7 | 1 + 4 constrained |
| i7 | incompatible → maybe | 17 | natural | 0.47 | 0.93 | 4.57 / 7.90 | 4 (0) | 8 | 1 + 2 constrained |
| m1 | maybe → maybe | 17 | natural | 0.47 | 0.93 | 7.96 / 7.89 | 2 (0) | 7 | 0 + 1 constrained |
| m2 | maybe → incompatible | 18 | interest | 0.44 | 0.91 | 5.39 / 8.02 | 3 (0) | 7 | 1 + 1 constrained |
| m3 | maybe → incompatible | 18 | natural | 0.44 | 0.88 | 8.62 / 6.57 | 1 (0) | 8 | 0 + 0 constrained |
| m4 | maybe → maybe | 17 | natural | 0.88 | 0.90 | 6.34 / 5.73 | 2 (0) | 6 | 3 + 0 constrained |

## Observer accuracy (my notes about them vs their own graph)

- **Precision**: 82/302 checkable notes match their graph (same concept + polarity, or same attribute + value) = 0.27
- **Recall**: 37/61 of their facts they mentioned in chat were noted = 0.61

| pair | observer | notes | checkable | correct | mentioned by them | noted |
|---|---|---|---|---|---|---|
| c1 | Meera | 10 | 10 | 3 | 3 | 2 |
| c1 | Ishaan | 10 | 10 | 5 | 3 | 3 |
| c2 | Riya | 7 | 7 | 2 | 2 | 1 |
| c2 | Aditya | 6 | 6 | 2 | 2 | 2 |
| c3 | Sana | 15 | 15 | 2 | 0 | 0 |
| c3 | Leela | 16 | 16 | 3 | 1 | 1 |
| c4 | Dev | 4 | 4 | 0 | 1 | 0 |
| c4 | Nikhil | 10 | 10 | 3 | 2 | 2 |
| c5 | Ananya | 10 | 10 | 3 | 4 | 3 |
| c5 | Karthik | 7 | 7 | 0 | 2 | 0 |
| c6 | Pooja | 13 | 13 | 0 | 1 | 0 |
| c6 | Rohit | 4 | 4 | 0 | 1 | 0 |
| c7 | Hetal | 9 | 9 | 1 | 0 | 0 |
| c7 | Parth | 8 | 8 | 2 | 2 | 1 |
| i2 | Tara | 11 | 11 | 6 | 3 | 2 |
| i2 | Sameer | 7 | 7 | 2 | 2 | 1 |
| i3 | Meghna | 10 | 10 | 4 | 3 | 1 |
| i3 | Kunal | 11 | 11 | 1 | 3 | 0 |
| i4 | Aisha | 6 | 6 | 2 | 1 | 1 |
| i4 | Vikram | 10 | 10 | 6 | 2 | 2 |
| i5 | Gauri | 11 | 11 | 4 | 2 | 1 |
| i5 | Arnav | 8 | 8 | 2 | 2 | 1 |
| i6 | Zoya | 6 | 6 | 0 | 1 | 0 |
| i6 | Omkar | 4 | 4 | 2 | 0 | 0 |
| i7 | Kabir | 7 | 7 | 1 | 2 | 1 |
| i7 | Hetal | 6 | 6 | 2 | 2 | 0 |
| m1 | Meera | 12 | 12 | 5 | 3 | 3 |
| m1 | Arjun | 6 | 6 | 4 | 2 | 2 |
| m2 | Parth | 9 | 9 | 3 | 1 | 1 |
| m2 | Ira | 10 | 10 | 2 | 1 | 1 |
| m3 | Ananya | 8 | 8 | 2 | 1 | 1 |
| m3 | Varun | 10 | 10 | 1 | 0 | 0 |
| m4 | Pooja | 10 | 10 | 3 | 3 | 2 |
| m4 | Arnav | 11 | 11 | 4 | 3 | 2 |

