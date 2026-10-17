# Evaluation: headline numbers

Generated 2026-10-17 14:06 UTC by `node scripts/eval/latest.js` from the files in `eval/`. Provider: see each source file.

## Labelled pairs

- **Accuracy** (non-fake pairs): 1/4 = 25%
- **Harmful error rate** (compatible ↔ incompatible swapped): 0/4 = 0%
- **Gate**: 1/1 gated pairs never became a chat
- **Fake detection**: 1/1 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 13% of agent messages; constrained regenerations: 2
- **Mean tokens per pair**: 74,408 (fake pairs: 3,036); total 300,667 tokens across 6 runs

## Rules on vs off (6-pair subset, `RULES` ablation)

| | rules on (full engine) | rules off (plain agents) |
|---|---|---|
| Unsupported self-claims | — | — |
| Agreement rate | — | — |
| Disagreement rate | — | — |
| Judge approval ("yes") | — | — |

## Voice and language

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.25
- **Language-mix distance** (L1/2 over the mix): mean 0.08; **code-switch rate difference**: mean 0.28
- **Script kept** (Devanagari personas still write Devanagari): 0/0

## Privacy

- **Leak rate: pending

## Judge vs humans

- Pending labels: `node scripts/eval/judge-eval.js --export` wrote `eval/labels/` for the team.

## Scale (no LLM)

| Discover (gate both ways, one `$match` + `$sample` 20), 500 users | 2.1 ms | 4.6 ms |
| Context build per message, persona cache **miss** (load facts + voice + samples, select facts + exemplars) | 9.9 ms | 10.9 ms |
| Context build per message, persona cache **hit** | 1.7 ms | 3.2 ms |
- **Storage per user** (data + indexes): 88.4 KB → about **5,930 users fit in Atlas M0 (512 MB)**. Breakdown per user: users 0.3 KB, profiles 1.0 KB, kgfacts 41.3 KB, voiceprofiles 0.4 KB, voicesamples 45.3 KB.
- **Judge queue throughput** (real queue, judge concurrency 2, stubbed judge reading the user's graph + events): 300 jobs in 3.0 s = **5,915 jobs/min**. With the real LLM judge the bound is the provider (one smart/mid call per job).

