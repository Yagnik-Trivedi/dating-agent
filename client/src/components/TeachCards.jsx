// "Teach your agent more" (plan 33 Q2): the brain meter and the question modules (pages/Modules.jsx), compact, for
// Welcome and This is you. The full list with the extra blocks is at /teach.
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ModuleList } from '../pages/Modules'
import { useModules } from '../lib/modules'
import { Shimmer } from './r7'

export default function TeachCards() {
  const { data } = useModules()
  if (!data) return <Shimmer w="60%" />
  return (
    <>
      <ModuleList data={data} compact limit={3} />
      <Link className="link teach-all" to="/teach">See all modules, replies and how you text<ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" /></Link>
    </>
  )
}
