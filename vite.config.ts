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
    rollupOptions: {
      input: {
        // The dex builder, and the league builder's own crawlable page —
        // see docs/future-tools/HANDOFF.md for the multi-page SEO rationale.
        main: path.resolve(__dirname, 'index.html'),
        league: path.resolve(__dirname, 'pokemon-league-builder.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
