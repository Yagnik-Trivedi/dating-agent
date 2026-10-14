import { Link } from 'react-router-dom'
import { StepList } from '../components/HowItWorks'
import { Logo } from '../components/Layout'
import { AgentIcon } from '../components/ui'

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <Link to="/login" className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2">Log in</Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.15fr_1fr] md:py-16">
          <div className="animate-rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-agent-soft px-3 py-1 text-sm font-semibold text-agent">
              <AgentIcon className="size-5" /> Your agent takes the first conversation
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              Skip the three chats it takes to find out it’s not a fit.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              After you match, your AI agent checks the profile, gets to know them in your voice, and tells you, with receipts, whether it’s worth your time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink hover:brightness-110">Create your agent</Link>
              <Link to="/login" className="rounded-full border border-line bg-surface px-6 py-3 font-semibold hover:bg-surface-2">I have an account</Link>
            </div>
          </div>

          <div className="animate-rise rounded-[2rem] border border-line bg-surface p-5 shadow-sm" aria-hidden="true">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">Meera, 27</span>
              <span className="rounded-full bg-agent-soft px-2.5 py-0.5 text-xs font-semibold text-agent">Agent chatting</span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-ink">sunrise trek + misal is exactly my kind of Sunday 😄 which trek is your go-to?</p>
              <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2">Rajmachi! did it 4 times in monsoon. you trek too?</p>
              <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-ink">yes! Kalsubai last month, the view was unreal</p>
            </div>
            <div className="mt-5 rounded-2xl bg-surface-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Verdict</p>
              <p className="mt-1 font-display text-2xl font-semibold text-good">Compatible</p>
              <p className="mt-1 text-sm text-muted">✓ Calm weekends · ✓ Neither drinks · ✓ Both staying in Pune</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="mb-5 font-display text-2xl font-semibold">How it works</h2>
          <StepList />
          <p className="mt-6 text-sm text-muted">
            Honest framing: no app can predict love before you meet. Your agent filters out clear mismatches and fakes so your time goes to people worth meeting. You can always override it.
          </p>
        </section>
      </main>
    </div>
  )
}
