# Scale test (no LLM calls)

Generated 2026-10-17 11:30 UTC by `node scripts/eval/scale-test.js` on a local in-memory replica set (never Atlas), every production index created.
2,000 synthetic users × (60 facts, ~90% linked to 400 shared concepts; 1 voice profile; 20 voice samples), int8 vectors of 2048 dims. Seeding took 24 s.

| Measure | p50 | p95 |
|---|---|---|
| Discover (gate both ways, one `$match` + `$sample` 20), 500 users | 2.1 ms | 4.2 ms |
| Context build per message, persona cache **miss** (load facts + voice + samples, select facts + exemplars) | 9.5 ms | 10.4 ms |
| Context build per message, persona cache **hit** | 1.6 ms | 3.0 ms |

- Discover uses index `gate.city_1_gate.gender_1_gate.age_1`; 187 profiles examined for one query.
- **Storage per user** (data + indexes): 88.3 KB → about **5,939 users fit in Atlas M0 (512 MB)**. Breakdown per user: users 0.3 KB, profiles 1.0 KB, kgfacts 41.2 KB, voiceprofiles 0.4 KB, voicesamples 45.3 KB.
- Shared concepts: 941.4 KB in total for 400 concepts (embedded once for everyone).

