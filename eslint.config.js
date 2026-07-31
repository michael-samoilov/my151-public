import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Honour the `_name` convention for deliberately-unused bindings — the codebase
// already uses it for destructured-but-ignored props (e.g. `minorXTicks: _minorXTicks`).
const unusedVars = {
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
    destructuredArrayIgnorePattern: '^_',
  }],
}

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),

  // Browser app code. The React rules only apply here — api/ and scripts/ have
  // no components, and react-refresh would flag their non-component exports.
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
    rules: { ...unusedVars },
  },

  // Node code: Vercel serverless routes, build/data scripts, e2e specs and the
  // root config files. These use process/Buffer/__dirname, which the browser
  // globals set does not declare. The browser globals are merged in as well
  // because the Playwright-driving files pass callbacks to `page.evaluate()`,
  // whose bodies are serialised and run in the page, not in Node.
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
    rules: { ...unusedVars },
  },

  // CommonJS scripts. `require()` is the correct call there, not a smell.
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

])
