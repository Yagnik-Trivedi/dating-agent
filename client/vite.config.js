import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // A wrong API URL looks exactly like a sleeping server in the browser (plan 30 S0): fail the build instead.
    const url = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? process.env.VITE_API_URL
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url ?? '')
    if (!url || url.endsWith('/') || !(local || /^https:\/\/[^/]+$/.test(url))) {
      throw new Error(`VITE_API_URL must be https://<host> with no trailing slash (or http://localhost:<port>), got "${url ?? ''}"`)
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    build: { target: ['es2020', 'safari15', 'firefox115', 'chrome100'] }, // Safari 15+, Firefox ESR
  }
})
