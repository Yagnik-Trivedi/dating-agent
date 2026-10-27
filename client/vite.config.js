import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // A wrong API URL looks exactly like a sleeping server in the browser (plan 30 S0): fail the build instead.
    // UI polish B8: an EMPTY VITE_API_URL is allowed and means "same site" (the Vercel /api rewrite); unset still fails.
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const url = env.VITE_API_URL ?? process.env.VITE_API_URL
    const ok = (u, empty) => (empty && u === '') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u) || /^https:\/\/[^/]+$/.test(u)
    if (url === undefined || !ok(url, true)) {
      throw new Error(`VITE_API_URL must be https://<host> with no trailing slash, http://localhost:<port>, or empty for the same site, got "${url ?? '(unset)'}"`)
    }
    const sock = env.VITE_SOCKET_URL ?? process.env.VITE_SOCKET_URL
    if (sock !== undefined && sock !== '' && !ok(sock, false)) throw new Error(`VITE_SOCKET_URL must be https://<host> with no trailing slash, got "${sock}"`)
  }
  return {
    plugins: [react(), tailwindcss()],
    build: { target: ['es2020', 'safari15', 'firefox115', 'chrome100'] }, // Safari 15+, Firefox ESR
  }
})
