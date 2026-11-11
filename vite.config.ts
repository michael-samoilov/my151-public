import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'node:fs'
import { prerenderHub } from './scripts/prerender-hub'
import { staticFaq } from './scripts/static-faq'
import { llmsTxt } from './scripts/llms-txt'
import { pickerSpritePacks } from './scripts/picker-sprite-packs'
import { npmPackageIndex, stripCreditNotes } from './scripts/acknowledgements-build'
import { scriptCsp } from './scripts/script-csp'

function pickerRouteRedirect(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? '';
      const queryStart = url.indexOf('?');
      const pathname = queryStart < 0 ? url : url.slice(0, queryStart);
      if (pathname !== '/favorite-pokemon-by-type' && pathname !== '/favorite-pokemon-by-type.html') {
        next();
        return;
      }
      response.statusCode = 308;
      response.setHeader('Location', `/favorite-pokemon-picker${queryStart < 0 ? '' : url.slice(queryStart)}`);
      response.end();
    });
  };
  return { name: 'picker-route-redirect', configureServer: install, configurePreviewServer: install };
}

const BUILD_TIMESTAMP = (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date()).toISOString()

function buildTimestampMeta(): Plugin {
  return {
    name: 'build-timestamp-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'p151-build', content: BUILD_TIMESTAMP }, injectTo: 'head' }],
  }
}

const START_AFTER_FIRST_PAINT: Record<string, string> = {
  '/favorite-pokemon-picker.html': 'favorite-picker',
  '/pokedex-builder.html': 'personal-151-pokedex-v3',
}

function startAppAfterFirstPaint(): Plugin {
  const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>/
  const preload = /\s*<link rel="modulepreload" crossorigin href="([^"]+)">/g
  const charset = /<meta charset="UTF-8" \/>/
  return {
    name: 'start-app-after-first-paint',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { path }) {
        const src = entry.exec(html)?.[1]
        const savedKey = START_AFTER_FIRST_PAINT[path]
        if (!src || !savedKey || !charset.test(html)) return html
        const files = JSON.stringify([src, ...[...html.matchAll(preload)].map((m) => m[1])])
        const saved = `var saved=null;try{saved=localStorage.getItem(${JSON.stringify(savedKey)})}catch(e){}`
        const preloadAll = `${files}.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})`
        const run = `var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(src)};document.head.appendChild(s)`

        const early = `(function(){${saved}if(saved)${preloadAll}})()`
        const late = `(function(){${saved}if(saved){${run};return}var go=function(){${preloadAll};${run}};if(document.visibilityState!=='visible')go();else requestAnimationFrame(function(){setTimeout(go)})})()`
        return html
          .replace(entry, '')
          .replace(preload, '')
          .replace(charset, (tag) => `${tag}\n    <script>${early}</script>`)
          .replace('</body>', `<script>${late}</script>\n  </body>`)
      },
    },
  }
}

const artworkFile = path.resolve(__dirname, 'src/assets/home/mobile/manifest.json');
const artwork = fs.existsSync(artworkFile) ? JSON.parse(fs.readFileSync(artworkFile, 'utf8')) : { poses: [] };
const artworkPoses = artwork.poses.map((pose: { viewportWidth: number; cards: Record<string, unknown>[] }) => ({
  viewportWidth: pose.viewportWidth,
  cards: pose.cards.map(({ key, panel, placement, avif, webp }) => ({ key, panel: { width: (panel as { width: number }).width }, placement,
    avif: { file: (avif as { file: string }).file }, webp: { file: (webp as { file: string }).file } })),
}));

export default defineConfig({
  plugins: [pickerRouteRedirect(), react(), tailwindcss(), buildTimestampMeta(), startAppAfterFirstPaint(), staticFaq(), llmsTxt(), prerenderHub(), pickerSpritePacks(), npmPackageIndex(), stripCreditNotes(), scriptCsp()],
  define: {
    __HOME_ARTWORK_CAPTURE__: process.env.MY151_HOME_ARTWORK_CAPTURE === '1',
    __HOME_MOBILE_ARTWORK__: JSON.stringify(artworkPoses),

    __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP),

    __DEPLOY_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  build: {
    chunkSizeWarningLimit: 1000,

    license: { fileName: 'licenses/npm-packages.txt' },
    rollupOptions: {
      output: {
        codeSplitting: {

          groups: [{
            name: 'shared-chrome',
            test: /(?:\/src\/(?:components\/shared\/PageFooter\.tsx|lib\/(?:feedbackContext|usePixelPerfectSprite)\.ts|hooks\/useJsErrorCounter\.ts)$|\/node_modules\/react-dom\/)/,
          }],
        },
      },
      input: {

        main: path.resolve(__dirname, 'index.html'),
        pokedex: path.resolve(__dirname, 'pokedex-builder.html'),
        league: path.resolve(__dirname, 'custom-gym-leader.html'),

        levels: path.resolve(__dirname, 'evolution-levels.html'),

        slotlab: path.resolve(__dirname, 'slot-lab.html'),
        foilworkshop: path.resolve(__dirname, 'foil-workshop.html'),
        favorites: path.resolve(__dirname, 'favorite-pokemon-picker.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // platform: venn.js's ESM entry imports ../node_modules/fmin, which npm hoisting moves; the UMD build inlines it.
      'venn.js': path.resolve(__dirname, 'node_modules/venn.js/build/venn.js'),
    },
  },
})
