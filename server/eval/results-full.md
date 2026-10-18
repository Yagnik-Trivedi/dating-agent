# Evaluation results

Generated 2026-10-18 04:36 UTC by `node scripts/eval.js` on **nvidia** (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, mid `nvidia/nemotron-3-super-120b-a12b`, smart `nvidia/nemotron-3-ultra-550b-a55b`).
20 labelled pairs from `seed/pairs.json`. Agent↔agent, no pacing. "Predicted" is the match verdict: the lower of the two agents' verdicts.

## Confusion matrix (rows = expected, columns = predicted)

| expected \ predicted | compatible | maybe | incompatible | other |
|---|---|---|---|---|
| **compatible** | 0 | 6 | 1 | 0 |
| **maybe** | 0 | 2 | 2 | 0 |
| **incompatible** | 0 | 4 | 2 | 0 |

- **Accuracy** (non-fake pairs): 4/17 = 24%
- **Harmful error rate** (compatible ↔ incompatible swapped): 1/17 = 6%
- **Gate**: 1/1 gated pairs never became a chat
- **Fake detection**: 2/2 fake pairs flagged; 0 genuine pairs wrongly flagged
- **Fallback rate** (template or filler, target < 5%): 7% of agent messages; constrained regenerations: 17
- **Mean turns to verdict**: 17.3 messages
- **Mean tokens per pair**: 101,380 (fake pairs: 2,939); total 1,729,341 tokens across 20 runs
- **Cost per pair** at the configured `LLM_PRICE_*`: $0.0000 (NVIDIA free tier: prices are 0)
- **Smart-tier calls**: 41 (max 2 per pair: one judge per side; a fallback to mid is recorded per decision)

## Every pair

| pair | people | expected | predicted | judges (confidence) | stop | turns | fallbacks | tokens | why it was labelled | transcript |
|---|---|---|---|---|---|---|---|---|---|---|
| c1 | Meera × Ishaan | compatible | ✖ maybe | compatible (0.75) / maybe (0.6) | dealbreaker | 16 | 1/16 | 92,534 | Trekking, reading, cooking; both long-term, staying in Pune, talk conflicts out, never smoke | [link](transcripts/c1-full-run1.md) |
| c2 | Riya × Aditya | compatible | ✖ incompatible | incompatible (0.85) / maybe (0.6) | natural | 19 | 2/19 | 97,415 | Indie music and cycling in Bengaluru; both want kids, balanced careers, long-term | [link](transcripts/c2-full-run1.md) |
| c3 | Sana × Leela | compatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 1/17 | 109,295 | Books, pottery, old-city food walks; both life-first, never drink, need lots of alone time | [link](transcripts/c3-full-run1.md) |
| c4 | Dev × Nikhil | compatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 0/17 | 68,959 | Films and running in Mumbai; both career-first, need space in conflicts, long-term | [link](transcripts/c4-full-run1.md) |
| c5 | Ananya × Karthik | compatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 0/17 | 114,223 | Carnatic music, filter coffee, family-first, veg, want kids (Ananya has a mild drinking inconsistency) | [link](transcripts/c5-full-run1.md) |
| c6 | Pooja × Rohit | compatible | ✖ maybe | maybe (0.65) / maybe (0.65) | natural | 17 | 3/17 | 115,543 | Stand-up comedy and fitness in Delhi; both career-first, high energy, want kids (Rohit has a mild workout inconsistency) | [link](transcripts/c6-full-run1.md) |
| c7 | Hetal × Parth | compatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 2/17 | 117,280 | Food and startups in Ahmedabad; family-first, veg, never drink, want kids (Hetal has a mild interests inconsistency) | [link](transcripts/c7-full-run1.md) |
| f1 | Leela × Elena | flagged_fake | ✓ flagged_fake | — / — | — | 0 | 0/0 | 3,164 | Elena: abroad, crypto story, pushes to Telegram, no photos | [link](transcripts/f1-full-run1.md) |
| f2 | Pooja × Daniel | flagged_fake | ✓ flagged_fake | — / — | — | 0 | 0/0 | 2,713 | Daniel: army doctor abroad, forex investment, pushes off-app, no photos | [link](transcripts/f2-full-run1.md) |
| i1 | Nisha × Varun | gated | ✓ gated | — / — | — | 0 | 0/0 | 0 | Nisha's dealbreaker is kids (yes only); Varun doesn't want any and it's not in his public tags. The gate must keep them apart: never a match. | [link](transcripts/i1-full-run1.md) |
| i2 | Tara × Sameer | incompatible | ✓ incompatible | incompatible (0.85) / maybe (0.6) | natural | 18 | 2/18 | 86,272 | Tara can't be around smoke (dealbreaker); Sameer smokes regularly (hidden from his tags) | [link](transcripts/i2-full-run1.md) |
| i3 | Meghna × Kunal | incompatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 1/17 | 125,809 | Meghna needs long-term (dealbreaker); Kunal wants short-term (hidden from his tags) | [link](transcripts/i3-full-run1.md) |
| i4 | Aisha × Vikram | incompatible | ✓ incompatible | incompatible (0.75) / incompatible (0.85) | natural | 18 | 0/18 | 79,378 | Aisha will never leave Hyderabad (dealbreaker); Vikram is moving abroad (not a profile tag) | [link](transcripts/i4-full-run1.md) |
| i5 | Gauri × Arnav | incompatible | ✖ maybe | maybe (0.6) / maybe (0.6) | natural | 17 | 4/17 | 146,670 | Gauri needs a non-drinker (dealbreaker); Arnav brews beer and drinks regularly (hidden from his tags) | [link](transcripts/i5-full-run1.md) |
| i6 | Zoya × Omkar | incompatible | ✖ maybe | maybe (0.55) / maybe (0.55) | natural | 17 | 1/17 | 97,376 | Lifestyle and values: nightlife, drinks regularly, no kids, figuring it out vs family-first, never drinks, wants kids soon, long-term (important to him) | [link](transcripts/i6-full-run1.md) |
| i7 | Kabir × Hetal | incompatible | ✖ maybe | maybe (0.5) / maybe (0.6) | natural | 17 | 1/17 | 77,962 | Lifestyle and values: smoker, non-veg, drinks vs veg (important), never drinks, family-first; no shared interests | [link](transcripts/i7-full-run1.md) |
| m1 | Meera × Arjun | maybe | ✓ maybe | compatible (0.85) / maybe (0.6) | natural | 17 | 0/17 | 89,959 | Shared trekking and cooking, both long-term; differ on where to live, career pace and conflict style | [link](transcripts/m1-full-run1.md) |
| m2 | Ira × Parth | maybe | ✖ incompatible | maybe (0.6) / incompatible (0.85) | interest | 18 | 1/18 | 88,159 | Ira's profile and replies are too thin to judge | [link](transcripts/m2-full-run1.md) |
| m3 | Ananya × Varun | maybe | ✖ incompatible | incompatible (0.85) / maybe (0.6) | natural | 18 | 0/18 | 106,861 | Warm and family-minded vs travel-first; kids (important to her, not a dealbreaker) and different cities | [link](transcripts/m3-full-run1.md) |
| m4 | Pooja × Arnav | maybe | ✓ maybe | maybe (0.6) / maybe (0.7) | natural | 17 | 3/17 | 109,769 | Fun, social energy and both career-driven in Delhi, but he brews beer and drinks regularly and their weekend interests barely overlap | [link](transcripts/m4-full-run1.md) |

