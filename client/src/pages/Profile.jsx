import { useState } from 'react'
import { Avatar, Button, Card, Chip, ErrorBox, Field } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const AVATAR_STYLES = ['notionists', 'lorelei', 'adventurer', 'personas']
const avatarUrl = (style, seed) => `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f4d9cf,dbe9e4,f3e6c4`
const PROMPT_QUESTIONS = [
  'A perfect Sunday', 'I geek out on', 'My friends rely on me for', 'A hill I’d die on', 'The way to win me over',
  'Two truths and a lie', 'Best travel story', 'My simple pleasures',
]
const INTERESTED_IN = { woman: 'Women', man: 'Men', nonbinary: 'Non-binary people' }
const LIFESTYLE = { smoking: ['never', 'socially', 'regularly'], drinking: ['never', 'socially', 'regularly'], workout: ['rarely', 'sometimes', 'often'], diet: ['veg', 'non-veg', 'vegan', 'jain', 'eggetarian', 'no preference'] }

function toForm(p, user) {
  return {
    name: p?.name ?? user.name,
    age: p?.age ?? '',
    city: p?.city ?? '',
    gender: p?.gender ?? '',
    interestedIn: p?.interestedIn ?? [],
    photos: p?.photos ?? [],
    bio: p?.bio ?? '',
    prompts: [0, 1, 2].map((i) => p?.prompts?.[i] ?? { q: PROMPT_QUESTIONS[i], a: '' }),
    interests: (p?.tags?.interests ?? []).join(', '),
    lifestyle: { smoking: '', drinking: '', workout: '', diet: '', ...p?.tags?.lifestyle },
    wantsKids: p?.tags?.wantsKids ?? '',
    relationshipGoal: p?.tags?.relationshipGoal ?? '',
    religionImportance: p?.tags?.religionImportance ?? '',
    dealbreakers: (p?.dealbreakers ?? []).join(', '),
  }
}

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
const drop = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''))

export default function Profile() {
  const { user, profile, setProfile } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(() => toForm(profile, user))
  const [seed, setSeed] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleIn = (g) => setForm((f) => ({ ...f, interestedIn: f.interestedIn.includes(g) ? f.interestedIn.filter((x) => x !== g) : [...f.interestedIn, g] }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = {
        name: form.name,
        ...(form.age !== '' && { age: Number(form.age) }),
        city: form.city,
        gender: form.gender,
        interestedIn: form.interestedIn,
        photos: form.photos,
        bio: form.bio,
        prompts: form.prompts.filter((p) => p.a.trim()),
        tags: drop({
          interests: list(form.interests),
          lifestyle: drop(form.lifestyle),
          wantsKids: form.wantsKids,
          relationshipGoal: form.relationshipGoal,
          religionImportance: form.religionImportance,
        }),
        dealbreakers: list(form.dealbreakers),
      }
      const { data } = await api.put('/api/profile', body)
      setProfile(data.profile)
      toast('Profile saved')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="page profile-page space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Your profile</h1>
        <Button type="submit" loading={busy}>Save</Button>
      </div>

      <Card className="space-y-4">
        <h2 className="font-semibold">Photo</h2>
        <div className="flex items-center gap-4">
          <Avatar src={form.photos[0]} name={form.name} className="size-20" />
          <p className="text-sm text-muted">Demo avatars from DiceBear. Pick a style, or shuffle for a new face.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {AVATAR_STYLES.map((style) => {
            const url = avatarUrl(style, seed)
            return (
              <button type="button" key={style} onClick={() => setForm((f) => ({ ...f, photos: [url] }))} aria-label={`Use ${style} avatar`} aria-pressed={form.photos[0] === url}
                className={`rounded-full p-0.5 ring-2 ${form.photos[0] === url ? 'ring-accent' : 'ring-transparent hover:ring-line'}`}>
                <img src={url} alt="" className="size-14 rounded-full bg-surface-2" />
              </button>
            )
          })}
          <Button type="button" variant="secondary" size="sm" onClick={() => setSeed(Math.random().toString(36).slice(2, 8))}>Shuffle</Button>
        </div>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={set('name')} required maxLength={60} />
        <Field label="Age" type="number" min={18} max={100} value={form.age} onChange={set('age')} />
        <Field label="City" value={form.city} onChange={set('city')} maxLength={80} />
        <Field label="I am" as="select" value={form.gender} onChange={set('gender')}>
          <option value="">Prefer not to say</option>
          <option value="woman">A woman</option>
          <option value="man">A man</option>
          <option value="nonbinary">Non-binary</option>
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold">Interested in</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(INTERESTED_IN).map(([g, label]) => <Chip key={g} selected={form.interestedIn.includes(g)} onClick={() => toggleIn(g)}>{label}</Chip>)}
          </div>
        </div>
        <Field className="sm:col-span-2" label="Bio" as="textarea" value={form.bio} onChange={set('bio')} maxLength={500} hint={`${form.bio.length}/500`} />
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Prompts</h2>
        {form.prompts.map((p, i) => (
          <div key={i} className="space-y-2">
            <Field label={`Prompt ${i + 1}`} as="select" value={p.q} onChange={(e) => setForm((f) => ({ ...f, prompts: f.prompts.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) }))}>
              {PROMPT_QUESTIONS.map((q) => <option key={q}>{q}</option>)}
            </Field>
            <Field label="Your answer" as="textarea" value={p.a} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, prompts: f.prompts.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) }))} />
          </div>
        ))}
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Interests" value={form.interests} onChange={set('interests')} hint="Comma separated, e.g. trekking, board games, filter coffee" />
        {Object.entries(LIFESTYLE).map(([k, opts]) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)} as="select" value={form.lifestyle[k]} onChange={(e) => setForm((f) => ({ ...f, lifestyle: { ...f.lifestyle, [k]: e.target.value } }))}>
            <option value="">—</option>
            {opts.map((o) => <option key={o}>{o}</option>)}
          </Field>
        ))}
        <Field label="Kids someday" as="select" value={form.wantsKids} onChange={set('wantsKids')}>
          <option value="">—</option>
          {['yes', 'no', 'open', 'have already'].map((o) => <option key={o}>{o}</option>)}
        </Field>
        <Field label="Looking for" as="select" value={form.relationshipGoal} onChange={set('relationshipGoal')}>
          <option value="">—</option>
          {['long-term', 'open to long-term', 'short-term', 'figuring it out'].map((o) => <option key={o}>{o}</option>)}
        </Field>
        <Field label="Religion in my own life" as="select" value={form.religionImportance} onChange={set('religionImportance')}>
          <option value="">Prefer not to say</option>
          {['central', 'somewhat', 'not really'].map((o) => <option key={o}>{o}</option>)}
        </Field>
        <Field className="sm:col-span-2" label="Dealbreakers" value={form.dealbreakers} onChange={set('dealbreakers')} hint="Comma separated. Only your agent sees these." />
      </Card>

      {error && <ErrorBox message={error} />}
      <Button type="submit" size="lg" className="w-full" loading={busy}>Save profile</Button>
    </form>
  )
}
