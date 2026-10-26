// UX P0-1: someone with no approved photos sees this on Discover, Likes you and Edit profile until they add some.
// Dismissing hides it for this browser session only.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImagePlus, X } from 'lucide-react'
import { IconBtn } from './r7'
import { useAuth } from '../hooks/useAuth'

const KEY = 'twine.photoNudge'
const dismissed = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

export default function PhotoNudge() {
  const { profile } = useAuth()
  const [hidden, setHidden] = useState(dismissed)
  if (!profile || profile.photos?.length || hidden) return null
  const close = () => { try { sessionStorage.setItem(KEY, '1') } catch { /* storage blocked */ } setHidden(true) }
  return (
    <div className="nbox photo-nudge" role="status">
      <ImagePlus size={18} strokeWidth={1.7} aria-hidden="true" />
      <span><Link className="link" to="/profile#photos">Add 2 photos</Link> so people can see you.</span>
      <IconBtn icon={X} label="Hide this for now" className="sm" onClick={close} />
    </div>
  )
}
