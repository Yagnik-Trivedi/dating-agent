// Dev only (not shipped): the phone pass (UI polish M9). Opens every route, logged out and logged in, at phone and
// small-tablet widths against a LOCAL dev stack, saves a screenshot of each, and flags what breaks on a phone:
// sideways scroll, anything off the screen edge, tap targets under 44 × 44 px, controls covered by another element
// (checked after scrolling each into view) and text cut off without an ellipsis.
//
//   API=http://localhost:5000 APP=http://localhost:5174 AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/mobile-audit.mjs
//   (optional) AUDIT_WIDTHS=360,375  AUDIT_ONLY=discover|room  AUDIT_OUT=./audit
// The logged-in account should be onboarded and have at least one match with a letter. Uses Playwright from server/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = await import(pathToFileURL(resolve(here, '../../server/node_modules/playwright/index.mjs')).href)
const APP = process.env.APP ?? 'http://localhost:5174'
const API = process.env.API ?? 'http://localhost:5000'
const WIDTHS = (process.env.AUDIT_WIDTHS ?? '360,375,390,414,768').split(',').map(Number)
const OUT = resolve(process.env.AUDIT_OUT ?? resolve(here, '../.audit'))
const ONLY = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY) : null
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(API)) throw new Error('mobile-audit runs against a local dev stack only')

const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${API}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) })
  return r.json()
}
const login = async () => {
  if (!process.env.AUDIT_EMAIL || !process.env.AUDIT_PASSWORD) throw new Error('set AUDIT_EMAIL and AUDIT_PASSWORD (an onboarded local test account)')
  const r = await call('POST', '/auth/login', { body: { email: process.env.AUDIT_EMAIL, password: process.env.AUDIT_PASSWORD } })
  if (!r.token) throw new Error(`login failed: ${r.error?.message ?? 'no token'}`)
  return r
}

const me = await login()
const fresh = await call('POST', '/auth/signup', { body: { name: 'Audit', email: `audit-${Date.now()}@check.test`, password: 'password123', consentAgent: true, dob: '1996-05-05', gender: 'man', interestedIn: ['woman'], city: 'Pune' } })
const { matches = [] } = await call('GET', '/matches', { token: me.token })
const lettered = matches.find((m) => ['compatible', 'maybe', 'incompatible', 'handed_off'].includes(m.status)) ?? matches[0]
const M = lettered?._id
const ROUTES = [
  ['landing', null, '/'], ['signup', null, '/signup'], ['login', null, '/login'],
  ...[1, 2, 3, 4, 5].map((s) => [`onboarding-${s}`, 'fresh', '/onboarding', { step: s }]),
  ['world', 'me', '/onboarding/world'], ['welcome', 'me', '/welcome'],
  ['discover', 'me', '/discover'], ['likes', 'me', '/likes'], ['matches', 'me', '/matches'],
  ...(M ? [['room', 'me', `/matches/${M}`], ['letter', 'me', `/matches/${M}/report`], ['replay', 'me', `/matches/${M}/replay`]] : []),
  ['you-graph', 'me', '/you'], ['you-brain', 'me', '/you', { tab: 'Brain' }], ['you-list', 'me', '/you', { tab: 'List' }],
  ['inbox', 'me', '/inbox'], ['teach', 'me', '/teach'], ['settings', 'me', '/settings'], ['profile', 'me', '/profile'],
].filter(([n]) => !ONLY || ONLY.test(n))

// Runs in the page. → [{ kind, what, detail }]
const audit = () => {
  const W = innerWidth, H = innerHeight
  const flags = []
  const add = (kind, el, detail) => flags.push({ kind, what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} "${(el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 30)}"`, detail })
  // Screen-reader-only text and the content of a closed <details> (Chrome keeps its layout) aren't on screen.
  const hidden = (el) => el.closest('.sr-only') || (el.closest('details:not([open])') && !el.closest('summary'))
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && !el.closest('[aria-hidden="true"]') && !hidden(el) }
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; return false }
  if (document.documentElement.scrollWidth > W + 1) flags.push({ kind: 'h-scroll', what: 'page', detail: `${document.documentElement.scrollWidth - W}px wider than the screen` })
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('svg, canvas') && visible(el))
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el) && getComputedStyle(el).position !== 'fixed') add('off-screen', el, `${Math.round(r.left)}..${Math.round(r.right)} of ${W}`)
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const s = getComputedStyle(el)
    if (own && el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis') add('cut-off', el, `text ${el.scrollWidth}px in a ${el.clientWidth}px box`)
  }
  const TAP = 'button, a[href], [role=button], [role=tab], [role=radio], [role=switch], [role=option], [role=menuitem], input:not([type=hidden]), select, textarea, summary'
  for (const el of all.filter((x) => x.matches(TAP))) {
    const r = el.getBoundingClientRect()
    const after = getComputedStyle(el, '::after')
    const hit = after.content !== 'none' && after.position === 'absolute' ? { w: r.width - 2 * parseFloat(after.left || 0), h: r.height - 2 * parseFloat(after.top || 0) } : { w: r.width, h: r.height }
    const holder = el.closest('label') ?? (el.matches('input, textarea, select') ? el.parentElement : null)
    const hr = holder?.getBoundingClientRect()
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    if (!inline && (hit.w < 44 || hit.h < 44) && !(hr && hr.width >= 44 && hr.height >= 44)) add('small-tap', el, `${Math.round(hit.w)}×${Math.round(hit.h)}`)
  }
  return flags.filter((f, i, a) => a.findIndex((g) => g.kind === f.kind && g.what === f.what) === i)
}
// Covered controls: scroll each into the middle of the screen, then check what sits on top of its centre.
async function covered(page) {
  return page.evaluate(async () => {
    const out = []
    const els = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=tab]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]') && !(el.closest('details:not([open])') && !el.closest('summary')) && getComputedStyle(el).visibility !== 'hidden' }).slice(0, 120)
    for (const el of els) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      await new Promise((r) => requestAnimationFrame(() => r()))
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
      const top = document.elementFromPoint(x, y)
      if (top && !el.contains(top) && !top.contains(el) && !el.closest('label')?.contains(top)) {
        out.push({ kind: 'covered', what: `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`, detail: `under ${top.tagName.toLowerCase()}.${String(top.className).trim().split(/\s+/).slice(0, 2).join('.')}` })
      }
    }
    scrollTo(0, 0)
    return out
  })
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = []
for (const W of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W >= 768 ? 1024 : 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  for (const [name, who, path, opt = {}] of ROUTES) {
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)))
    await page.goto(`${APP}/login`)
    const token = who === 'me' ? me.token : who === 'fresh' ? fresh.token : null
    await page.evaluate(({ token, step, id }) => {
      localStorage.clear(); sessionStorage.clear()
      if (token) { localStorage.setItem('token', token); sessionStorage.setItem('token', token) }
      if (step) localStorage.setItem(`onboarding-v2:${id}`, JSON.stringify({ step }))
      localStorage.setItem('twine.swipeHint', '1')
    }, { token, step: opt.step, id: fresh.user?._id })
    await page.goto(APP + path)
    await page.waitForTimeout(2500)
    if (opt.tab) { await page.getByRole('tab', { name: opt.tab }).click().catch(() => {}); await page.waitForTimeout(800) }
    const flags = [...await page.evaluate(audit), ...await covered(page), ...errors.map((e) => ({ kind: 'page-error', what: 'page', detail: e }))]
    await page.screenshot({ path: `${OUT}/${W}-${name}.png`, fullPage: true })
    report.push({ width: W, route: name, url: page.url().replace(APP, ''), flags })
    await page.close()
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
const total = report.reduce((n, r) => n + r.flags.length, 0)
for (const r of report.filter((x) => x.flags.length)) {
  console.log(`✗ ${r.width} ${r.route} (${r.url})`)
  for (const f of r.flags.slice(0, 8)) console.log(`    ${f.kind.padEnd(10)} ${f.what} · ${f.detail}`)
  if (r.flags.length > 8) console.log(`    … ${r.flags.length - 8} more in report.json`)
}
console.log(`\n${report.length} screens, ${total} flags. Screenshots + report.json in ${OUT}`)
process.exitCode = total ? 1 : 0
