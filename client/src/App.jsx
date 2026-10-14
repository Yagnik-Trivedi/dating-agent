import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { api } from './lib/api'

function Home() {
  const [health, setHealth] = useState('loading…')

  useEffect(() => {
    api.get('/health')
      .then((res) => setHealth(JSON.stringify(res.data, null, 2)))
      .catch((err) => setHealth(`error: ${err.message}`))
  }, [])

  return (
    <main className="min-h-screen p-8 font-sans">
      <h1 className="text-3xl font-bold">dating-agent</h1>
      <pre className="mt-4 rounded bg-gray-100 p-4 text-sm">{health}</pre>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
