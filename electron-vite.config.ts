import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

if (typeof (crypto as any).hash !== 'function') {
  (crypto as any).hash = (algorithm: string, data: crypto.BinaryLike, outputEncoding?: crypto.BinaryToTextEncoding) => {
    const hash = crypto.createHash(algorithm).update(data)
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest()
  }
}

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(filePath)) return env
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        env[key] = val
      }
    }
  } catch (err) {
    console.warn(`[build] Failed to read env file ${filePath}:`, err)
  }
  return env
}

const localEnv = loadEnvFile(path.resolve(__dirname, '.env.local'))
const rootEnv = loadEnvFile(path.resolve(__dirname, '.env'))

const lastFmApiKey = process.env.LASTFM_API_KEY || localEnv.LASTFM_API_KEY || rootEnv.LASTFM_API_KEY || ''
const lastFmSharedSecret = process.env.LASTFM_SHARED_SECRET || localEnv.LASTFM_SHARED_SECRET || rootEnv.LASTFM_SHARED_SECRET || ''

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.LASTFM_API_KEY': JSON.stringify(lastFmApiKey),
      'process.env.LASTFM_SHARED_SECRET': JSON.stringify(lastFmSharedSecret)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [tailwindcss(), react()]
  }
})
