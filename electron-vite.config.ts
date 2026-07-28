import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import crypto from 'node:crypto'

if (typeof (crypto as any).hash !== 'function') {
  (crypto as any).hash = (algorithm: string, data: crypto.BinaryLike, outputEncoding?: crypto.BinaryToTextEncoding) => {
    const hash = crypto.createHash(algorithm).update(data)
    return outputEncoding ? hash.digest(outputEncoding) : hash.digest()
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [tailwindcss(), react()]
  }
})
