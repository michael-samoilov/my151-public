import { builtinModules } from 'node:module'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import my151 from './scripts/eslint/plugin.mjs'

const sharedRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    destructuredArrayIgnorePattern: '^_',
  }],
}

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: { ...sharedRules },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__fixtures__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: builtinModules.map(name => ({ name, allowTypeImports: true })),
        patterns: [
          {
            regex: '^(?:node:|@upstash(?:/|$)|@vercel/node(?:/|$))',
            allowTypeImports: true,
            message: 'Keep server runtime dependencies out of browser code.',
          },
          {
            regex: '(?:^|/)api/(?:_shared|_feedbackStore|_exportStats|_activityHistoryStore|_searchPerformance|_dashboard|[^/_][^/]*)(?:\\.[cm]?[jt]s)?$',
            allowTypeImports: true,
            message: 'Use HTTP endpoints from browser code. Import only pure API helpers or erased types.',
          },
        ],
      }],
    },
  },

  {
    files: [
      'api/**/*.ts',
      'scripts/**/*.{ts,mjs,cjs,js}',
      'e2e/**/*.ts',
      '*.config.{ts,js}',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { ...sharedRules },
  },

  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: [
      'src/**/*.{ts,tsx}',
      'api/**/*.ts',
      'scripts/**/*.ts',
      'e2e/**/*.ts',
      '*.config.ts',
      '**/*.{js,mjs,cjs}',
    ],
    ignores: ['.claude/vendor/**', 'src/components/export/hover-tilt/**'],
    plugins: { my151 },
    rules: { 'my151/no-comments': 'error' },
  },
])
