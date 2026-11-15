const SRC = ['src/**/*.{ts,tsx}']
const SRC_TESTS = ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__fixtures__/**']
const API = ['api/**/*.ts']
const TOOLING = ['scripts/**/*.{ts,mjs,cjs,js}', 'e2e/**/*.ts']
const PLAYWRIGHT_CONFIGS = ['playwright.config.ts', 'e2e/**/*.config.ts', 'scripts/ci/playwright.config.ts']
const BEACONS = ['src/lib/minuteActivity.ts', 'src/lib/activeAttention.ts', 'src/lib/beaconScheduler.ts', 'src/lib/clientId.ts', 'src/hooks/*Beacon*.ts', 'src/favorites/hooks/favoriteBeaconDelivery.ts']
const VISIBLE_INTRO = ['src/components/home/HomePage.tsx', 'src/components/pokedex/IntroCard.tsx']

const anyString = pattern => [`Literal[value=${pattern}]`, `TemplateElement[value.raw=${pattern}]`]

export const WRITTEN_RULES = [
  {
    id: 'keep-saved-picks',
    rule: "Saved data: never wipe a user's picks.",
    source: 'Favorite Picker handoff, 2026-10-18; Bugfixes and reliability handoff, 2026-09-30',
    files: SRC,
    ignores: SRC_TESTS,
    selectors: [
      "CallExpression[callee.object.name=/^(localStorage|sessionStorage)$/][callee.property.name='clear']",
      "CallExpression[callee.property.name='clearStorage']",
      "CallExpression[callee.property.name='removeItem'][arguments.0.name=/^(POKEDEX|LEAGUE|FAVORITES)_STORAGE_KEY$/]",
    ],
    fix: 'Migrate the stored state with a version bump instead of deleting it.',
  },
  {
    id: 'versioned-store',
    rule: 'When a saved shape changes, bump the store version and migrate.',
    source: 'Favorite Picker handoff, 2026-10-18',
    files: SRC,
    ignores: SRC_TESTS,
    selectors: [
      "CallExpression[callee.name='persist'][arguments.length=2] > ObjectExpression:not(:has(> Property[key.name='version']))",
      "CallExpression[callee.name='persist'][arguments.length=2] > ObjectExpression:not(:has(> Property[key.name='migrate']))",
    ],
    fix: 'Give the persist options a `version` and a `migrate` function.',
  },
  {
    id: 'server-secrets-stay-server-side',
    rule: 'Never ask for, store, or use the production database credentials. Redis credentials must remain server-side.',
    source: 'Bugfixes and reliability handoff, 2026-09-30; docs/security/adversarial-review-2026-10-16.md',
    files: [...TOOLING, ...SRC],
    ignores: SRC_TESTS,
    selectors: [
      "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^UPSTASH_REDIS_REST_/]",
      "MemberExpression[object.property.name='env'][property.name=/^VITE_\\w*(TOKEN|SECRET|UPSTASH|REDIS)/]",
    ],
    fix: 'Reach the database only through the api/ endpoints.',
  },
  {
    id: 'one-deploy-constant',
    rule: 'Keep values that change on every deploy out of the JavaScript: one such value renames most chunks.',
    source: '.claude/rules/build-pipeline.md',
    files: SRC,
    ignores: ['src/lib/buildVersion.ts'],
    selectors: ["Identifier[name='__BUILD_TIMESTAMP__']"],
    fix: 'Import the build version from src/lib/buildVersion.ts.',
  },
  {
    id: 'revised-sprite-urls',
    rule: 'A replaced sprite file needs a new URL; src/lib/spriteUrl.ts adds the revision as ?v=.',
    source: '.claude/rules/ci-runner.md, check-sprite-revisions.mjs',
    files: SRC,
    ignores: [...SRC_TESTS, 'src/lib/spriteUrl.ts', 'src/data/type-icons.ts'],
    selectors: [
      "Literal[value=/^\\/sprites\\//]:not(CallExpression[callee.name='revisedSprite'] > Literal)",
      "TemplateLiteral[quasis.0.value.raw=/^\\/sprites\\//]:not(CallExpression[callee.name='revisedSprite'] > TemplateLiteral)",
    ],
    fix: 'Build the URL with a helper from src/lib/spriteUrl.ts, or wrap it in revisedSprite().',
  },
  {
    id: 'ontology-stays-off-the-browser',
    rule: 'The full graph never ships to a browser.',
    source: 'docs/data-model/pokemon-ontology.md',
    files: SRC,
    ignores: SRC_TESTS,
    selectors: [
      'ImportDeclaration[source.value=/(^|\\/)(data|scripts)\\/ontology(\\/|$)/]',
      'ImportExpression[source.value=/(^|\\/)(data|scripts)\\/ontology(\\/|$)/]',
    ],
    fix: 'Import the generated projection in src/data instead.',
  },
  {
    id: 'light-mode-only',
    rule: 'The app runs in light mode. Nothing applies the .dark class, so dark-themed additions mismatch the live UI.',
    source: 'CLAUDE.md, Deployment',
    files: SRC,
    selectors: anyString('/(^|\\s)dark:[\\w[!-]/'),
    fix: 'Delete the dark: variant.',
  },
  {
    id: 'img-alt',
    rule: 'Images that carry meaning have descriptive alt text. Decorative icons use alt="".',
    source: 'docs/seo/PAGE-SEO-CONTRACT.md',
    files: SRC,
    selectors: ["JSXOpeningElement[name.name='img']:not(:has(JSXAttribute[name.name='alt'])):not(:has(JSXSpreadAttribute))"],
    fix: 'Add alt text, or alt="" for a decorative image.',
  },
  {
    id: 'no-viewport-type',
    rule: 'Root font-size is JS-computed, not CSS vw. Avoid per-site text-[clamp(…vw…)].',
    source: '.claude/rules/responsive-sizing.md',
    files: SRC,
    selectors: [...anyString('/clamp\\([^)]*\\d[sdl]?v(w|min|max)/'), ...anyString('/\\btext-\\[[^\\]]*\\dv(w|min|max)/')],
    fix: 'Use rem utilities, which follow src/lib/layoutFontSize.ts, or a container-relative --tile-sprite or chartScale size.',
  },
  {
    id: 'intro-stack-loads-whole',
    rule: 'The hub and Pokédex intro screenshots have no smaller copies. Do not lazy-load part of a visible stack.',
    source: 'Bugfixes and reliability handoff, 2026-09-30; Performance audit note, 2026-10-15',
    files: VISIBLE_INTRO,
    selectors: [
      "JSXAttribute[name.name='loading'][value.value='lazy']",
      "JSXAttribute[name.name=/^srcs[eE]t$/] Literal[value=/\\d+w\\b/]",
      "JSXAttribute[name.name=/^srcs[eE]t$/] TemplateElement[value.raw=/\\d+w\\b/]",
    ],
    fix: 'Load every image of the stack eagerly, from one full-size file each.',
  },
  {
    id: 'hub-height-holds-still',
    rule: 'The hub scrolls the document, so its layout must not follow dvh. iOS changes dvh when the toolbar hides on scroll, and the hub spacers resize mid-scroll.',
    source: 'Michael, 2026-11-08: no layout shift while scrolling the hub on mobile',
    files: ['src/components/home/**/*.{ts,tsx}'],
    selectors: anyString('/dvh\\b/'),
    fix: 'Use svh, which stays at the height with the toolbar shown.',
  },
  {
    id: 'resize-observer-fallback-first',
    rule: 'Every page entry imports src/lib/resizeObserverFallback first. Some Safari builds ship no ResizeObserver, and components construct one without a check.',
    source: 'Crash report 2026-11-11: League Builder, "Can\'t find variable: ResizeObserver"',
    files: ['src/main.tsx', 'src/*/main.tsx'],
    selectors: ['Program:not(:has(> ImportDeclaration:first-child[source.value=/\\/lib\\/resizeObserverFallback$/]))'],
    fix: "Make `import '../lib/resizeObserverFallback'` the first line of the entry.",
  },
  {
    id: 'specs-record-their-files',
    rule: 'A browser spec imports test from e2e/support/test, so the test-map recording sees which source files it runs. CI picks browser tests from that map.',
    source: '.claude/rules/ci-runner.md',
    files: ['e2e/**/*.spec.ts'],
    selectors: ["ImportDeclaration[source.value='@playwright/test'] > ImportSpecifier[imported.name='test']"],
    fix: "Import test (and expect) from './support/test' instead of '@playwright/test'.",
  },
  {
    id: 'league-zoom-floor',
    rule: 'Do not lower the 0.55 zoom floor.',
    source: 'League Builder handoff, 2026-09-30',
    files: ['src/league/**/*.{ts,tsx}'],
    selectors: [
      "CallExpression[callee.name='useFitScale'] > Literal[value<0.55]",
      "AssignmentPattern[left.name='floor'] > Literal[value<0.55]",
    ],
    fix: 'Keep the floor at 0.55 or above.',
  },
  {
    id: 'no-contact-in-user-agent',
    rule: 'When a site asks for contact details in a user agent, send a generic tool name with no contact details.',
    source: 'CLAUDE.md, Personal data',
    files: [...TOOLING, ...API],
    selectors: [
      "Property[key.value=/^user-agent$/i] Literal[value=/@|mailto:/]",
      "Property[key.value=/^user-agent$/i] TemplateElement[value.raw=/@|mailto:/]",
    ],
    fix: 'Send a generic tool name. Skip the site if it refuses.',
  },
  {
    id: 'no-automation-stealth',
    rule: 'Do not use stealth plugins or --disable-blink-features=AutomationControlled on the live site.',
    source: 'AGENTS.md, Visits to the live site',
    files: TOOLING,
    ignores: ['scripts/eslint/**'],
    selectors: anyString('/AutomationControlled|stealth/i'),
    fix: 'Keep navigator.webdriver set, so the server stores nothing for agent visits.',
  },
  {
    id: 'no-test-retries',
    rule: 'No mode retries a failing browser test into a pass. Full Playwright traces are opt-in.',
    source: 'CLAUDE.md, Build Verification',
    files: PLAYWRIGHT_CONFIGS,
    selectors: [
      "Property[key.name='retries'][value.type!='Literal']",
      "Property[key.name='retries'][value.type='Literal'][value.value>0]",
      "Property[key.name='trace'][value.value=/^(on|retain)/]",
    ],
    fix: "Set retries: 0 and trace: 'off'. Turn traces on per run with --trace on --retries 0.",
  },
  {
    id: 'no-beacon-heartbeat',
    rule: 'Do not add an autonomous retry heartbeat. There is no idle heartbeat or history retry timer.',
    source: 'Admin Dashboard handoff, 2026-09-30; Minute activity design note, 2026-10-11',
    files: BEACONS,
    selectors: ["CallExpression[callee.name='setInterval']", "CallExpression[callee.property.name='setInterval']"],
    fix: 'Send on a real event, such as a state change or pagehide.',
  },
  {
    id: 'tune-hook-in-one-place',
    rule: '?tune exposes window.__pokedexStore on local builds and previews only. Production ignores it.',
    source: 'Bugfixes and reliability handoff, 2026-09-30',
    files: SRC,
    ignores: [...SRC_TESTS, 'src/components/pokedex/MilestoneBar.tsx'],
    selectors: ["AssignmentExpression[left.type='MemberExpression'][left.property.name=/^__/]"],
    fix: 'Expose debug handles only in src/components/pokedex/MilestoneBar.tsx, behind PRODUCTION_DEPLOY.',
  },
  {
    id: 'admin-token-in-header',
    rule: 'The token is accepted only via the Authorization header, never a query string, so it cannot land in access logs.',
    source: 'api/_shared.ts, requireAdmin',
    files: API,
    selectors: [
      "MemberExpression[object.property.name='query'][property.name=/token/i]",
      "CallExpression[callee.property.name='get'][callee.object.property.name='searchParams'][arguments.0.value=/token/i]",
    ],
    fix: 'Read the token in requireAdmin from the Authorization header.',
  },
  {
    id: 'no-precise-location',
    rule: 'Skip city, postal code, and latitude/longitude to keep stored data low-sensitivity.',
    source: 'api/_shared.ts, client records',
    files: API,
    selectors: anyString('/^x-vercel-ip-(city|postal-code|latitude|longitude)$/i'),
    fix: 'Use the country, region, and timezone headers only.',
  },
  {
    id: 'vercel-insights-follow-opt-out',
    rule: 'Load Vercel Web Analytics and Speed Insights only through installVisitCounting. It skips an opted-out browser and one that sends Global Privacy Control, and it drops events after the privacy switch turns on.',
    source: 'Michael, 2026-11-11: a privacy page with a visible opt-out that honors Global Privacy Control',
    files: SRC,
    ignores: ['src/lib/visitCounting.ts'],
    selectors: [
      'ImportExpression[source.value=/^@vercel\\/(analytics|speed-insights)/]',
      'ImportDeclaration[source.value=/^@vercel\\/(analytics|speed-insights)/]',
    ],
    fix: 'Call installVisitCounting() from src/lib/visitCounting.ts.',
  },
  {
    id: 'no-secret-logging',
    rule: 'Never print, log, or commit PAGESPEED_API_KEY or the database token.',
    source: '.claude/rules/speed-work.md; Admin Dashboard handoff, 2026-09-30',
    files: [...TOOLING, ...API],
    selectors: [
      "CallExpression[callee.object.name='console'] > MemberExpression[property.name=/^(PAGESPEED_API_KEY|UPSTASH_REDIS_REST_TOKEN)$/]",
      "CallExpression[callee.object.name='console'] > TemplateLiteral > MemberExpression[property.name=/^(PAGESPEED_API_KEY|UPSTASH_REDIS_REST_TOKEN)$/]",
    ],
    fix: 'Log whether the value is set, never the value.',
  },
  {
    id: 'one-redis-command-per-request',
    rule: 'Never one command per item in a loop. Use multi-key commands or one Lua script.',
    source: 'Admin Dashboard handoff, 2026-09-30',
    files: API,
    selectors: [
      "CallExpression[callee.property.name=/^(map|forEach|flatMap)$/] > :function CallExpression[callee.object.name='redis']",
      ":matches(ForOfStatement, ForInStatement) CallExpression[callee.object.name='redis']",
    ],
    fix: 'Read every key in one multi-key command or one EVAL script.',
  },
  {
    id: 'page-visitor-hashes',
    rule: 'Never read a visitor hash with one HGETALL. Upstash refuses a reply over 10 MB, and the clients hash passed it on 2026-11-08.',
    source: 'api/_hashScan.ts; Vercel error log for /api/submissions, 2026-11-08',
    files: API,
    ignores: ['api/_hashScan.ts'],
    selectors: [
      "CallExpression[callee.property.name=/^(hgetall|hvals)$/][arguments.0.name=/CLIENTS_KEY$/]",
      "CallExpression[callee.property.name=/^(hgetall|hvals)$/][arguments.0.value=/clients$/]",
    ],
    fix: 'Read it with readHashInPages from api/_hashScan.ts.',
  },
]

const selectorRule = ({ rule, source, fix, selectors }) => ({
  meta: { type: 'problem', schema: [], messages: { broken: `${rule} (${source}) ${fix}` } },
  create(context) {
    const report = node => context.report({ node, messageId: 'broken' })
    return Object.fromEntries(selectors.map(selector => [selector, report]))
  },
})

export const writtenRulesPlugin = {
  meta: { name: 'my151-written' },
  rules: Object.fromEntries(WRITTEN_RULES.map(entry => [entry.id, selectorRule(entry)])),
}

export const writtenRulesConfig = WRITTEN_RULES.map(({ id, files, ignores = [] }) => ({
  files,
  ignores,
  plugins: { written: writtenRulesPlugin },
  rules: { [`written/${id}`]: 'error' },
}))
