# Scale test (no LLM calls)

Generated 2026-10-17 13:45 UTC by `node scripts/eval/scale-test.js` on a local in-memory replica set (never Atlas), every production index created.
2,000 synthetic users × (60 facts, ~90% linked to 400 shared concepts; 1 voice profile; 20 voice samples), int8 vectors of 2048 dims. Seeding took 24 s.

| Measure | p50 | p95 |
|---|---|---|
| Discover (gate both ways, one `$match` + `$sample` 20), 500 users | 2.1 ms | 4.6 ms |
| Context build per message, persona cache **miss** (load facts + voice + samples, select facts + exemplars) | 9.9 ms | 10.9 ms |
| Context build per message, persona cache **hit** | 1.7 ms | 3.2 ms |

- Discover uses index `gate.city_1_gate.gender_1_gate.age_1`; 187 profiles examined for one query.
- **Storage per user** (data + indexes): 88.4 KB → about **5,930 users fit in Atlas M0 (512 MB)**. Breakdown per user: users 0.3 KB, profiles 1.0 KB, kgfacts 41.3 KB, voiceprofiles 0.4 KB, voicesamples 45.3 KB.
- Shared concepts: 941.4 KB in total for 400 concepts (embedded once for everyone).
- **Judge queue throughput** (real queue, judge concurrency 2, stubbed judge reading the user's graph + events): 300 jobs in 3.0 s = **5,915 jobs/min**. With the real LLM judge the bound is the provider (one smart/mid call per job).

### `storage-report.js` on this database (BSON sizes, before indexes)

```
users: 2000
collection           docs        total      vectors     per user
voicesamples        40000   89218.8 KB   80195.3 KB      44.6 KB
kgfacts            120000   75200.4 KB   24058.6 KB      37.6 KB
profiles             2000    1362.8 KB       0.0 KB       0.7 KB
concepts              400     889.4 KB     802.0 KB       shared
voiceprofiles        2000     710.9 KB       0.0 KB       0.4 KB
users                2000     470.1 KB       0.0 KB       0.2 KB
per-user data: 83.5 KB/user; shared: 889.4 KB → ~6,269 users fit in M0 (before indexes)
```

