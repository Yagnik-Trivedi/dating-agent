// Plan 30 S2 "Teach your agent more": the optional blocks (pages/Onboarding.jsx#Teach).
import { useNavigate } from 'react-router-dom'
import { BookOpen, MessagesSquare, Smartphone, UserRound } from 'lucide-react'

const TEACH = [
  ['stories', BookOpen, 'Tell a story', 'A trip, a bad day, a good one. 3 minutes.'],
  ['replies', MessagesSquare, '10 more replies', 'Helps your agent get your humour right. 4 minutes.'],
  ['personality', UserRound, 'A short personality check', 'Twenty quick statements. 3 minutes.'],
  ['texting', Smartphone, 'How you text', 'Emoji, short bursts, capitals. A few taps.'], // plan 32 KP1
]

export default function TeachCards({ only }) {
  const navigate = useNavigate()
  return (
    <div className="teach">
      {TEACH.filter(([k]) => !only || only.includes(k)).map(([k, I, t, d]) => (
        <button key={k} type="button" className="teach-c card" onClick={() => navigate(`/teach/${k}`)}><I size={20} strokeWidth={1.7} aria-hidden="true" /><b>{t}</b><span>{d}</span></button>
      ))}
    </div>
  )
}
