// Plan 33 Q2: the question modules (GET /api/onboarding/modules) and saving one (POST /api/onboarding/module/:id).
import { useCallback, useEffect, useState } from 'react'
import { api, errMsg } from './api'

export function useModules() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => { setError(null); return api.get('/api/onboarding/modules').then((r) => setData(r.data)).catch((e) => setError(errMsg(e))) }, [])
  useEffect(() => { load() }, [load])
  return { data, error, load }
}

/** Every answer of a module (follow-ups included), blank ones too: a blank tells the server to drop an old answer. */
export const saveModule = (id, answers) => api.post(`/api/onboarding/module/${id}`, { answers }).then((r) => r.data)

/** How much of the brain map is filled, 0..1. */
export const strengthOf = (s) => (s?.total ? s.filled / s.total : 0)

/** The answers as the server wants them: trimmed text, "why" rows with a like only; a blank stays blank (= remove). */
export function cleanAnswers(mod, value = {}) {
  const out = {}
  for (const q of mod.questions.flatMap((x) => [x, ...x.subs])) {
    if (!(q.id in value)) continue
    const v = value[q.id]
    if (q.type === 'why') {
      const rows = (v ?? []).filter((r) => r.like?.trim()).map((r) => ({ like: r.like.trim(), gives: r.gives?.trim() ?? '', why: r.why?.trim() ?? '' }))
      out[q.id] = rows.length ? rows : ''
    } else out[q.id] = Array.isArray(v) ? v : String(v ?? '').trim()
  }
  return out
}

const filled = (v) => (Array.isArray(v) ? v.some((x) => (typeof x === 'string' ? x : x?.like)?.trim?.()) : String(v ?? '').trim().length > 0)
/** Answered questions of a module (follow-ups don't count; an old story answer counts for its question). */
export const answeredCount = (mod, answers = {}, fromStories = {}) => mod.questions.filter((q) => filled(answers[q.id]) || (q.alias && fromStories[q.id])).length
