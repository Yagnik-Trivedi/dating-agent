# Evaluation: headline numbers

Generated 2026-10-18 04:47 UTC by `node scripts/eval/latest.js` from the files in `eval/`. Provider: see each source file.

## Labelled pairs

- **Accuracy** (non-fake pairs): 4/17 = 24%
- **Harmful error rate** (compatible ↔ incompatible swapped): 1/17 = 6%
- **Gate**: 1/1 gated pairs never became a chat
- **Fake detection**: 2/2 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 7% of agent messages; constrained regenerations: 17
- **Mean tokens per pair**: 101,380 (fake pairs: 2,939); total 1,729,341 tokens across 20 runs

## Rules on vs off (6-pair subset, `RULES` ablation)

| | rules on (full engine) | rules off (plain agents) |
|---|---|---|
| Unsupported self-claims | 28% of 43 | 35% of 68 |
| Agreement rate | 3% | 36% |
| Disagreement rate | 3% | 0% |
| Judge approval ("yes") | 0% | 0% |

- **Unsupported self-claims, full run**: 21% of 137 claims (offline judge); judge approval 6%

## Voice and language

- **Style distance** (normalised L1 over length, emoji, end punctuation, questions, lowercase): mean 0.16
- **Language-mix distance** (L1/2 over the mix): mean 0.06; **code-switch rate difference**: mean 0.22
- **Script kept** (Devanagari personas still write Devanagari): 1/1

## Privacy

- **Leak rate (private facts)**: 4/20 replies revealed a private fact (code keyword check 0, LLM judge 4).

## Judge vs humans

- Pending labels: `node scripts/eval/judge-eval.js --export` wrote `eval/labels/` for the team.

## Scale (no LLM)

| Measure | p50 | p95 |
|---|---|---|
| Discover (gate both ways, one `$match` + `$sample` 20), 500 users | 2.1 ms | 4.6 ms |
| Context build per message, persona cache **miss** (load facts + voice + samples, select facts + exemplars) | 9.9 ms | 10.9 ms |
| Context build per message, persona cache **hit** | 1.7 ms | 3.2 ms |
- **Storage per user** (data + indexes): 88.4 KB → about **5,930 users fit in Atlas M0 (512 MB)**. Breakdown per user: users 0.3 KB, profiles 1.0 KB, kgfacts 41.3 KB, voiceprofiles 0.4 KB, voicesamples 45.3 KB.
- **Judge queue throughput** (real queue, judge concurrency 2, stubbed judge reading the user's graph + events): 300 jobs in 3.0 s = **5,915 jobs/min**. With the real LLM judge the bound is the provider (one smart/mid call per job).

