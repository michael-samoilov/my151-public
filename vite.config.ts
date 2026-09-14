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
        // One served HTML file per page, each with its own head and crawlable
        // copy — see docs/seo/PAGE-SEO-CONTRACT.md. `cleanUrls` in vercel.json
        // serves `<name>.html` at `/<name>`; index.html is the hub at `/`.
        main: path.resolve(__dirname, 'index.html'),
        pokedex: path.resolve(__dirname, 'pokedex-builder.html'),
        league: path.resolve(__dirname, 'custom-gym-leader.html'),
        // A preview-only diagnostic for the league builder's level model.
        // The entry refuses to mount on the production deploy, and the page
        // is noindex wherever it is reachable.
        levels: path.resolve(__dirname, 'evolution-levels.html'),
        // The ace/partner slot, with its two halves loose so their placement
        // can be settled by hand. Same production gate as `levels`.
        slotlab: path.resolve(__dirname, 'slot-lab.html'),
        // Preview-only lighting studio for the league export card.
        foilworkshop: path.resolve(__dirname, 'foil-workshop.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
