// Plan 30 S3.2 profile view /u/:id (design: Discover.jsx#ProfileView): photos and prompts interleaved, like a photo or
// prompt with a comment, Pass, and report / block from the more menu.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Ban, Flag, MapPin, MoreHorizontal, UserX, X } from 'lucide-react'
import { Btn, Empty, IconBtn, Shell, Shimmer } from '../components/r7'
import { LikeSheet, Photo, ProfileBody, photosOf, useLikeFlow } from '../components/ProfileParts'
import { BlockSheet, ReportSheet } from '../components/Safety'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

export default function ProfileView() {
  const { id } = useParams()
  const mobile = useMobile()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [p, setP] = useState(null)
  const [error, setError] = useState(null)
  const [liking, setLiking] = useState(null)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(null) // 'report' | 'block'
  const { send, busy, ui } = useLikeFlow()
  const { user } = useAuth()
  useEffect(() => { api.get(`/api/profiles/${id}`).then((r) => setP(r.data.profile)).catch((e) => setError(errMsg(e))) }, [id])

  const back = () => (state?.from ? navigate(-1) : navigate('/discover'))
  const done = () => navigate(state?.from === 'likes' ? '/likes' : '/discover', { replace: true })
  const decide = async (liked, target, comment) => { if (await send(p, { liked, target, comment })) { setLiking(null); if (!liked) done() } }

  if (error) return <Shell title="Profile" back><Empty icon={UserX} title="This profile isn’t available" action={<Btn kind="secondary" onClick={back}>Go back</Btn>}>{error}</Empty></Shell>
  if (!p) return <Shell title="Profile" back><div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /></div></Shell>
  const photos = photosOf(p)
  const own = String(p.userId) === String(user?._id) // preview of my own profile: nothing to like or report
  const like = own ? undefined : setLiking
  const more = own ? null : (
    <span className="menu-wrap">
      <IconBtn icon={MoreHorizontal} label={`More: report or block ${p.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} />
      {menu && <div className="menu-pop right" role="menu">
        <button type="button" role="menuitem" onClick={() => { setMenu(false); setSheet('report') }}><Flag size={16} strokeWidth={1.8} aria-hidden="true" />Report {p.name}</button>
        <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); setSheet('block') }}><Ban size={16} strokeWidth={1.8} aria-hidden="true" />Block {p.name}</button>
      </div>}
    </span>
  )
  const sheets = <>
    {ui}
    <LikeSheet like={liking} p={p} photos={photos} busy={busy} onClose={() => setLiking(null)} onSend={(c) => decide(true, liking, c)} />
    <ReportSheet open={sheet === 'report'} name={p.name} userId={p.userId} onClose={() => setSheet(null)} onDone={({ blocked }) => (blocked ? done() : setSheet(null))} />
    <BlockSheet open={sheet === 'block'} name={p.name} userId={p.userId} onClose={() => setSheet(null)} onDone={done} onReport={() => setSheet('report')} />
  </>
  const comment = state?.like?.comment && <div className="nbox"><b>{p.name} said:</b> {state.like.comment}</div>
  const actions = own ? <p className="small">This is how others see your profile.</p> : <Btn kind="secondary" icon={X} onClick={() => decide(false)} disabled={busy}>Pass</Btn>

  if (mobile) return (
    <Shell title={`${p.name}${p.age ? `, ${p.age}` : ''}`} back right={more} tab={false} className="discover profile-view">
      <div className="d-stack">
        {comment}
        <Photo src={photos[0]} i={0} n={photos.length} name={p.name} h={440} onLike={like} busy={busy} />
        <ProfileBody p={p} photos={photos} mobile onLike={like} busy={busy} />
        <div className="pv-actions">{actions}</div>
      </div>
      {sheets}
    </Shell>
  )
  return (
    <Shell className="discover">
      <div className="d-sub"><button type="button" className="link" onClick={back}>← Back{state?.from === 'likes' ? ' to Likes you' : ''}</button></div>
      <div className="d-grid">
        <div className="d-left"><Photo src={photos[0]} i={0} n={photos.length} name={p.name} h={600} onLike={like} busy={busy} /><div className="d-under">{actions}</div></div>
        <div className="d-right">
          <header className="d-head"><div><h1 className="h1">{p.name}{p.age ? `, ${p.age}` : ''}</h1>{p.city && <p className="d-meta"><MapPin size={16} strokeWidth={1.7} aria-hidden="true" />{p.city}</p>}</div>{more}</header>
          {comment}
          <ProfileBody p={p} photos={photos} onLike={like} busy={busy} />
        </div>
      </div>
      {sheets}
    </Shell>
  )
}
