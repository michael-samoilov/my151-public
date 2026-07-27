import type { en, MessageKey } from './catalogs/en';

export type { MessageKey };

/**
 * The placeholder names inside a message, read straight off its English text.
 * `'Reach {count} Pokémon'` yields `'count'`. This is what makes
 * `t(key, args)` type-check its arguments against the actual string.
 */
type Placeholders<S extends string> = S extends `${string}{${infer A}}${infer R}`
  ? A | Placeholders<R>
  : never;

type Source<K extends MessageKey> = (typeof en)[K] & string;

/** No placeholders → no second argument at all, rather than an empty object. */
export type ArgsOf<K extends MessageKey> = [Placeholders<Source<K>>] extends [never]
  ? []
  : [Record<Placeholders<Source<K>>, string | number>];

export type PluralCategory = Intl.LDMLPluralRule;

/** Every counted message must define `_other`; that variant defines the base. */
export type PluralBase = MessageKey extends infer K
  ? K extends `${infer B}_other`
    ? B
    : never
  : never;

type PluralKey = Extract<MessageKey, `${string}_${PluralCategory}`>;

/**
 * The shape every non-English catalog must satisfy.
 *
 * Non-counted keys are mandatory — omitting one is a compile error, which is
 * the whole point of hand-rolling this instead of using a library that falls
 * back to English silently.
 *
 * Plural variants are optional and open: a locale may drop categories English
 * has (ja/ko/zh only ever need `_other`) or add ones it lacks (`_many` in fr).
 */
export type Messages = Omit<Record<MessageKey, string>, PluralKey> &
  Partial<Record<PluralKey | `${PluralBase}_${PluralCategory}`, string>>;

export type TFn = <K extends MessageKey>(key: K, ...args: ArgsOf<K>) => string;

export type TnFn = (
  base: PluralBase,
  count: number,
  args?: Record<string, string | number>,
) => string;
