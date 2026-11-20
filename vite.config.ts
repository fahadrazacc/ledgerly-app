import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`         -> dist/        (host on any website, and used for the Android app)
// `npm run build:single`  -> dist-single/ (one self-contained index.html)
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify('0.3.' + (process.env.GITHUB_RUN_NUMBER ?? 'dev')) },
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}))
