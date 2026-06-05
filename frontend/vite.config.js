import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath, URL } from 'node:url'

// Backend (Express) host:port to proxy API/uploads to. Always same PC.
const BACKEND = process.env.VITE_PROXY_TARGET || 'http://localhost:3000'

// HTTPS is OFF by default (comfortable local dev: plain http://localhost:5173,
// no certificate warnings, reachable on every network interface). Turn it ON
// only when you need the microphone (speech-to-text) on a real phone, because
// getUserMedia requires a secure context on non-localhost addresses:
//   Windows PowerShell:  $env:VITE_HTTPS=1; npm run dev    (or: npm run dev:https)
const useHttps = process.env.VITE_HTTPS === '1' || process.env.VITE_HTTPS === 'true'

// Proxy /api and /uploads to the backend so the whole app is served from a
// SINGLE origin. This is what makes the demo work on any unknown network:
//   • Phones load https://<this-pc-ip>:5173 and the API is a relative /api URL,
//     so there is no IP to hard-code and no CORS.
//   • Serving over HTTPS gives a secure context, which the browser REQUIRES for
//     getUserMedia() — without it the microphone (speech-to-text) is blocked on
//     any non-localhost address.
const proxy = {
  '/api':     { target: BACKEND, changeOrigin: true },
  '/uploads': { target: BACKEND, changeOrigin: true },
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  envDir: '..',
  server: {
    host: '0.0.0.0',   // listen on the LAN so phones can reach it
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    proxy,
  },
  plugins: [
    vue(),
    tailwindcss(),
    // Self-signed HTTPS (generated locally, no internet needed) — only when requested.
    ...(useHttps ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
