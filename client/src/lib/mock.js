// Mock layer (VITE_USE_MOCKS=true) for backend plans 06–09 that aren't built yet.
// Adds a scripted demo match at /matches/demo: trust → brief → live agent↔agent chat → kg:update → verdict.
// Everything else (incl. onboarding + knowledge graph, real since plan 05) goes to the real backend.
// Delete once plans 06–09 land.
import axios from 'axios'

// --- tiny event bus; useSocketEvent listens to it next to the real socket
const listeners = new Map()
export const mockBus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(fn)
    return () => listeners.get(event).delete(fn)
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => fn(payload))
  },
}

export const DEMO_ID = 'demo'
export const isDemo = (id) => id === DEMO_ID

const MEERA = 'demo-meera'
const avatar = (seed) => `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f4d9cf`
let me = 'me' // set from GET /api/me

const meeraProfile = {
  _id: 'demo-profile',
  userId: MEERA,
  name: 'Meera',
  age: 27,
  city: 'Pune',
  photos: [avatar('Meera')],
  bio: 'Product designer who would rather be on a mountain. Chai over coffee, always.',
  prompts: [
    { q: 'A perfect Sunday', a: 'Sunrise trek, then misal at a tiny place in Lonavala.' },
    { q: 'I geek out on', a: 'Good typography and monsoon trek routes.' },
    { q: 'My friends rely on me for', a: 'Planning trips nobody else wants to plan.' },
  ],
  tags: { interests: ['trekking', 'yoga', 'design', 'board games'], lifestyle: { smoking: 'never', drinking: 'never' }, relationshipGoal: 'long-term' },
}

const trust = {
  score: 92,
  level: 'ok',
  flags: [],
  contradictions: [{ a: 'Tag: trekking (casual)', b: '"did Rajmachi 4 times in monsoon"', topic: 'trekking', severity: 1 }],
  clarify: ['trekking: tagged casual, sounds frequent'],
}

const agenda0 = [
  { id: 'a1', topic: 'drinking habits', why: 'Important to you', priority: 0.9, status: 'open' },
  { id: 'a2', topic: 'weekend energy: going out vs staying in', why: 'You value calm weekends', priority: 0.7, status: 'open' },
  { id: 'a3', topic: 'career vs life balance', why: 'You chose “balanced”', priority: 0.65, status: 'open' },
  { id: 'a4', topic: 'where to live long-term', why: 'You plan to stay in Pune', priority: 0.6, status: 'open' },
  { id: 'a5', topic: 'trekking: how often, really', why: 'Gentle clarification from the trust check', priority: 0.6, status: 'open' },
  { id: 'a6', topic: 'kids someday', why: 'Important to you', priority: 0.55, status: 'open' },
]

const brief = {
  summary: 'An outdoorsy designer with a calm, early-morning rhythm. Warm and a little playful in her prompts. Values her weekends.',
  overlaps: ['trekking', 'board games', 'quiet evenings'],
  openers: [{ text: "hey Meera! sunrise trek + misal is exactly my kind of Sunday 😄 which trek is your go-to?", hook: 'Prompt: A perfect Sunday' }],
  watchouts: ['She plans trips for her friends; she may like someone who takes initiative.'],
  earlyDealbreaker: null,
}

const fact = (id, predicate, object, weight, confidence, quote) => ({
  _id: `demo-f${id}`, subjectId: MEERA, predicate, object, weight, confidence, source: 'conversation', evidence: [{ quote }],
})

// [delayMs, who, text, after-effects]
const SCRIPT = [
  [2500, 'me', brief.openers[0].text],
  [4500, 'her', 'haha finally someone who gets it! Rajmachi is my favourite, did it 4 times in monsoon. you trek too?', {
    facts: [fact(1, 'likes', 'trekking', 0.85, 0.75, 'Rajmachi is my favourite'), fact(2, 'likes', 'monsoon treks', 0.6, 0.6, 'did it 4 times in monsoon')],
    agenda: { a5: 'answered' },
  }],
  [4000, 'me', 'yes! did Kalsubai last month, the view at the top was unreal. are you an early-morning person in general?'],
  [4500, 'her', "very much. up by 6 most days, I teach a yoga class before work. nights out are rare for me tbh", {
    facts: [fact(3, 'lifestyle', 'early riser', 0.7, 0.8, 'up by 6 most days'), fact(4, 'likes', 'yoga', 0.6, 0.75, 'I teach a yoga class'), fact(5, 'lifestyle', 'prefers quiet evenings', 0.65, 0.6, 'nights out are rare for me')],
    agenda: { a2: 'answered' },
  }],
  [4000, 'me', "that's some discipline haha. I'm a cosy-evening person too, board games > clubs for me. how's work treating you?"],
  [5000, 'her', "busy! product designer at a fintech startup. but I protect my weekends, career matters but not at the cost of everything", {
    facts: [fact(6, 'background', 'product designer', 0.5, 0.85, 'product designer at a fintech startup'), fact(7, 'values', 'work-life balance', 0.8, 0.75, 'I protect my weekends')],
    agenda: { a3: 'answered' },
  }],
  [4000, 'me', 'love that you protect your weekends, same here. do you see yourself staying in Pune long-term?'],
  [5000, 'her', "I think so, family's here and I love the city. maybe a year abroad for a masters someday. also random q, do you have pets?", {
    facts: [fact(8, 'goal', 'stay in Pune long-term', 0.7, 0.65, "I love the city"), fact(9, 'values', 'close to family', 0.7, 0.6, "family's here")],
    agenda: { a4: 'answered' },
  }],
  [4500, 'me', "haha that's a story for later 😄 okay important question: chai or coffee?", {
    inbox: { _id: 'demo-q1', matchId: DEMO_ID, question: 'Meera asked: “do you have pets?” What should your agent know?', status: 'open', createdAt: new Date().toISOString() },
  }],
  [4500, 'her', "chai, always. and I don't drink alcohol at all, so cafés are my scene 😄", {
    facts: [fact(10, 'lifestyle', "doesn't drink alcohol", 0.85, 0.9, "I don't drink alcohol at all"), fact(11, 'likes', 'chai and cafés', 0.5, 0.8, 'chai, always'), fact(1, 'likes', 'trekking', 0.85, 0.85, 'Rajmachi is my favourite')],
    agenda: { a1: 'answered' },
  }],
  [4000, 'me', 'chai gang! I barely drink either. this has been really fun, Meera'],
]

const report = () => ({
  verdict: 'compatible',
  score: 0.78,
  summary: 'You two line up on the things you said matter most: calm weekends, no drinking, staying in Pune. The conversation flowed easily with plenty of back-and-forth.',
  dimensions: {
    dealbreakers: { score: 1, confidence: 0.85 },
    valuesGoals: { score: 0.82, confidence: 0.7 },
    lifestyle: { score: 0.88, confidence: 0.75 },
    interests: { score: 0.74, confidence: 0.7 },
    communication: { score: 0.8, confidence: 0.6 },
    personality: { score: 0.62, confidence: 0.4 },
  },
  chemistry: 0.76,
  reasons: [
    { text: 'You both treat weekends as sacred and prefer quiet evenings', messageIds: ['demo-m4', 'demo-m6'] },
    { text: "Neither of you drinks, which you marked as important", messageIds: ['demo-m10'] },
    { text: 'Shared love of treks, with real stories on both sides', messageIds: ['demo-m2', 'demo-m3'] },
    { text: 'Both plan to stay in Pune', messageIds: ['demo-m8'] },
  ],
  concerns: [{ text: 'She might spend a year abroad for a masters', messageIds: ['demo-m8'] }],
  askYourself: ['Kids never came up. Is that something you want to ask early?', 'How do you feel about a possible year of long distance?'],
  icebreakers: ['Ask which monsoon trek she’d pick for a first-timer', 'Challenge her to a board game café showdown', 'Swap your best misal spots in Pune'],
  evaluatedAt: new Date().toISOString(),
})

// --- demo state
const demo = {
  started: false,
  timers: [],
  status: 'trust_check',
  agentActive: true,
  decision: null,
  messages: [],
  facts: [],
  agenda: structuredClone(agenda0),
  report: null,
  inbox: [],
  t0: Date.now(),
}

const senderOf = (who) => (who === 'me' ? me : MEERA)

function view(msg) {
  const m = { ...msg }
  if (m.senderId !== me && demo.status !== 'handed_off') delete m.authoredBy
  return m
}

function statusEvent() {
  mockBus.emit('match:status', { matchId: DEMO_ID, status: demo.status, agentActive: demo.agentActive })
}

function pushMessage(who, text, authoredBy = 'agent') {
  const msg = {
    _id: `demo-m${demo.messages.length + 1}`,
    matchId: DEMO_ID,
    senderId: senderOf(who),
    authoredBy,
    text,
    createdAt: new Date().toISOString(),
  }
  demo.messages.push(msg)
  mockBus.emit('message:new', { message: view(msg) })
  return msg
}

function upsertFacts(facts) {
  for (const f of facts) {
    const i = demo.facts.findIndex((x) => x._id === f._id)
    if (i === -1) demo.facts.push(f)
    else demo.facts[i] = f
  }
}

function schedule(ms, fn) {
  demo.timers.push(setTimeout(fn, ms))
}

function stopScript() {
  demo.timers.forEach(clearTimeout)
  demo.timers = []
}

/** Start the scripted conversation (idempotent). Called when the demo match room opens. */
export function startDemo() {
  if (demo.started) return
  demo.started = true
  schedule(1200, () => { demo.status = 'briefing'; statusEvent() })
  let t = 2200
  schedule(t, () => { demo.status = 'agent_chatting'; statusEvent() })
  for (const [delay, who, text, fx] of SCRIPT) {
    t += delay
    const typingFrom = t - Math.min(2200, delay - 400)
    schedule(typingFrom, () => mockBus.emit('typing', { matchId: DEMO_ID, userId: senderOf(who) }))
    schedule(t, () => {
      if (!demo.agentActive && who === 'me') return
      pushMessage(who, text)
      if (fx?.facts) {
        upsertFacts(fx.facts)
        Object.entries(fx.agenda ?? {}).forEach(([id, status]) => { demo.agenda.find((a) => a.id === id).status = status })
        schedule(900, () => mockBus.emit('kg:update', { matchId: DEMO_ID, facts: fx.facts, agenda: structuredClone(demo.agenda) }))
      }
      if (fx?.inbox) {
        demo.inbox.push(fx.inbox)
        mockBus.emit('inbox:new', { item: fx.inbox })
      }
    })
  }
  t += 2500
  schedule(t, () => { demo.status = 'evaluating'; statusEvent() })
  schedule(t + 3500, () => {
    demo.report = report()
    demo.status = 'compatible'
    statusEvent()
    mockBus.emit('report:ready', { matchId: DEMO_ID })
  })
}

const listItem = () => {
  const last = demo.messages.at(-1)
  return {
    _id: DEMO_ID,
    status: demo.status,
    createdAt: new Date(demo.t0).toISOString(),
    lastMessageAt: last?.createdAt ?? null,
    agentActive: demo.agentActive,
    other: { userId: MEERA, name: 'Meera (demo)', age: 27, city: 'Pune', photo: meeraProfile.photos[0] },
    lastMessage: last ? view(last) : null,
    unread: 0,
  }
}

const detail = () => ({
  _id: DEMO_ID,
  status: demo.status,
  createdAt: new Date(demo.t0).toISOString(),
  agentActive: demo.agentActive,
  decision: demo.decision,
  other: { userId: MEERA, name: 'Meera', age: 27, city: 'Pune', photo: meeraProfile.photos[0] },
  otherProfile: meeraProfile,
  trust: trust,
  brief: demo.status === 'trust_check' ? null : { ...brief, agenda: structuredClone(demo.agenda) },
  report: demo.report,
})

// --- axios adapter: [method, path regex, handler({ body, m, real })]
const json = (r) => (typeof r.data === 'string' && r.data ? JSON.parse(r.data) : r.data)
const fail = (status, code, message) => ({ status, data: { error: { code, message } } })

const routes = [
  ['GET', /^\/api\/me$/, async ({ real }) => {
    const data = json(await real())
    me = data.user._id
    return data
  }],
  ['GET', /^\/api\/matches$/, async ({ real }) => {
    const data = json(await real())
    return { matches: [listItem(), ...data.matches] }
  }],
  ['GET', /^\/api\/matches\/demo$/, () => ({ match: detail() })],
  ['GET', /^\/api\/matches\/demo\/messages$/, () => ({ messages: demo.messages.map(view) })],
  ['GET', /^\/api\/matches\/demo\/kg$/, () => ({ facts: demo.facts })],
  ['POST', /^\/api\/matches\/demo\/messages$/, ({ body }) => {
    if (demo.agentActive) return fail(409, 'AGENT_ACTIVE', 'Take over to type')
    const text = String(body?.text ?? '').trim()
    if (!text) return fail(400, 'VALIDATION', 'Message is empty')
    return { status: 201, data: { message: view(pushMessage('me', text, 'human')) } }
  }],
  ['POST', /^\/api\/matches\/demo\/takeover$/, () => {
    demo.agentActive = false
    stopScript()
    if (['briefing', 'trust_check', 'evaluating'].includes(demo.status)) demo.status = 'agent_chatting'
    statusEvent()
    return { match: detail() }
  }],
  ['POST', /^\/api\/matches\/demo\/decision$/, ({ body }) => {
    demo.decision = body.decision
    demo.agentActive = false
    demo.status = body.decision === 'continue' ? 'handed_off' : 'closed' // demo: Meera already chose continue
    statusEvent()
    return { match: detail() }
  }],
  ['GET', /^\/api\/matches\/demo\/date-ideas$/, () => ({
    ideas: [
      { title: 'Sunrise walk up Vetal Tekdi, then chai', why: 'Both early risers who love the hills', link: 'https://en.wikipedia.org/wiki/Vetal_Hill' },
      { title: 'Board game café evening in Koregaon Park', why: 'You both prefer cosy evenings to clubs', link: 'https://www.google.com/search?q=board+game+cafe+koregaon+park' },
      { title: 'Day trip to Rajmachi in the monsoon', why: 'Her favourite trek, your first time there', link: 'https://en.wikipedia.org/wiki/Rajmachi' },
    ],
    icebreakers: report().icebreakers,
  })],
  ['GET', /^\/api\/inbox$/, async ({ real }) => {
    const data = json(await real())
    return { items: [...demo.inbox.filter((i) => i.status === 'open'), ...data.items] }
  }],
  ['POST', /^\/api\/inbox\/(demo-q\d+)\/answer$/, ({ body, m }) => {
    const item = demo.inbox.find((i) => i._id === m[1])
    Object.assign(item, { status: 'answered', answer: body.answer, answeredAt: new Date().toISOString() })
    return { item }
  }],
]

export function installMocks(api) {
  const real = axios.getAdapter(api.defaults.adapter ?? axios.defaults.adapter)
  api.defaults.adapter = async (config) => {
    const method = config.method.toUpperCase()
    const path = new URL(config.url, 'http://x').pathname
    for (const [verb, re, handler] of routes) {
      const m = verb === method && re.exec(path)
      if (!m) continue
      const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : config.data
      const out = await handler({ body, m, real: () => real(config) })
      const { status = 200, data = out } = out && 'status' in out && 'data' in out ? out : {}
      const response = { data, status, statusText: String(status), headers: {}, config, request: {} }
      if (status >= 400) throw new axios.AxiosError(data.error.message, 'ERR_BAD_REQUEST', config, {}, response)
      return response
    }
    return real(config)
  }
  console.info('[mock] VITE_USE_MOCKS=true: demo match at /matches/demo')
}
