import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // single-scene 3D app: one bundle (three + r3f + postprocessing + the rapier physics wasm) is intentional
  build: { chunkSizeWarningLimit: 4500 },
})
