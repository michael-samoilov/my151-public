/**
 * The English catalog is the source of truth for every user-facing string, and
 * the type oracle for the whole i18n layer: `MessageKey` is `keyof typeof en`,
 * and each message's placeholder set is derived from its own text, so
 * `t('nav.analyticsLocked', { count })` fails to compile if the argument is
 * misspelled or missing. Every other locale is typed as `Messages`, which makes
 * `tsc -b` the key-parity gate — a missing or misspelled key fails the build.
 *
 * Conventions:
 *  - Keys are namespaced by surface and kept in sorted order (a unit test
 *    enforces both, so a merge conflict can't silently duplicate one).
 *  - Placeholders are `{name}`. Inline ICU is deliberately unsupported: nested
 *    braces make the template-literal type parser both slow and wrong.
 *  - Counted messages use sibling `_one` / `_other` keys resolved through
 *    `Intl.PluralRules`. Locales that need more categories (`_many` in fr,
 *    `_few` in some Slavic languages) may add them; locales that need fewer
 *    (ja, ko, zh supply only `_other`) may omit them.
 *
 * Not covered by design: `src/components/admin/AdminPage.tsx`. It sits behind
 * `?admin`, only the owner ever sees it, and translating it would add ~13% to
 * the corpus for no user-visible benefit.
 */
export const en = {
  'nav.analytics': 'Analytics',
  'nav.analyticsLocked': 'Analytics locked. Reach {count} Pokémon to unlock',
  'nav.analyticsUnlockTip': 'Reach {count} Pokémon to unlock Analytics',
  'nav.build': 'Build',
  'nav.view': 'View',
} as const;

export type MessageKey = keyof typeof en;
