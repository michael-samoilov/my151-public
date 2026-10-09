import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { prerenderHub } from './scripts/prerender-hub'

/** Keep saved preview links on the canonical picker route in dev and preview. */
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

// SOURCE_DATE_EPOCH (seconds) pins the stamp, so two builds of different
// trees show the same build time. The verify-my151 visual diff sets it.
const BUILD_TIMESTAMP = (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date()).toISOString()

/**
 * Puts the build time in every page's HTML for src/lib/buildVersion.ts. In the
 * JavaScript it changed most chunk names on every deploy, and each renamed
 * chunk is one an open tab can no longer load (scripts/keep-previous-assets.ts).
 */
function buildTimestampMeta(): Plugin {
  return {
    name: 'build-timestamp-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'p151-build', content: BUILD_TIMESTAMP }, injectTo: 'head' }],
  }
}

/**
 * Runs each page's app code one frame after the first paint, not before it.
 *
 * When the code ran before Chrome's first frame, the page's own markup (the
 * hub's prerender, each tool's shell) stayed off screen while the code ran,
 * and in Google's phone runs Chrome then held that first frame for about 2 s:
 * the page had loaded at 0.4 s and showed nothing until 2.3 s, and Speed Index
 * read 4.1 s, not 1.8 s. The code still downloads at once (`modulepreload`);
 * only its start waits for the frame. A hidden tab, which draws no frames,
 * starts the code at once.
 */
function startAppAfterFirstPaint(): Plugin {
  const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>/
  return {
    name: 'start-app-after-first-paint',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const src = entry.exec(html)?.[1]
        if (!src) return html
        const start = `(function(){var go=function(){var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(src)};document.head.appendChild(s)};if(document.visibilityState!=='visible')go();else requestAnimationFrame(function(){setTimeout(go)})})()`
        return html
          .replace(entry, `<link rel="modulepreload" crossorigin href="${src}">`)
          .replace('</body>', `<script>${start}</script>\n  </body>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [pickerRouteRedirect(), react(), tailwindcss(), buildTimestampMeta(), startAppAfterFirstPaint(), prerenderHub()],
  define: {
    // Only the hub prerender's server build keeps this constant; the browser
    // reads the meta tag above.
    __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP),
    // Vercel deployment environment ('production' | 'preview' | ''), used to
    // gate the demo-seed mode to preview builds only. See src/lib/demoMode.ts.
    __DEPLOY_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        codeSplitting: {
          // These shared startup modules keep their common dependencies in one
          // chunk when a new lazy export entry changes automatic partitioning.
          // React DOM always loads with React. Keeping them together avoids
          // separate Brotli dictionaries and preserves first-load headroom.
          groups: [{
            name: 'shared-chrome',
            test: /(?:\/src\/(?:components\/shared\/PageFooter\.tsx|lib\/(?:feedbackContext|usePixelPerfectSprite)\.ts|hooks\/useJsErrorCounter\.ts)$|\/node_modules\/react-dom\/)/,
          }],
        },
      },
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
        favorites: path.resolve(__dirname, 'favorite-pokemon-picker.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The package's ESM entry (`index.js`) imports `../node_modules/fmin`,
      // which does not exist after npm hoists fmin. The UMD build inlines it.
      'venn.js': path.resolve(__dirname, 'node_modules/venn.js/build/venn.js'),
    },
  },
})
