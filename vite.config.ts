import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    // Vercel deployment environment ('production' | 'preview' | ''), used to
    // gate the demo-seed mode to preview builds only. See src/lib/demoMode.ts.
    __DEPLOY_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
