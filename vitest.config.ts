import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Reuses the app's Vite config so the `@/` alias, the Tailwind/React plugins
// and the `__BUILD_TIMESTAMP__`/`__DEPLOY_ENV__` defines all resolve exactly as
// they do in a real build. Tests live next to the code they cover.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
    },
  }),
)
