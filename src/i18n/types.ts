import type { en, MessageKey } from './catalogs/en';

export type { MessageKey };

type Placeholders<S extends string> = S extends `${string}{${infer A}}${infer R}`
  ? A | Placeholders<R>
  : never;

type Source<K extends MessageKey> = (typeof en)[K] & string;

export type ArgsOf<K extends MessageKey> = [Placeholders<Source<K>>] extends [never]
  ? []
  : [Record<Placeholders<Source<K>>, string | number>];

export type PluralCategory = Intl.LDMLPluralRule;

export type PluralBase = MessageKey extends infer K
  ? K extends `${infer B}_other`
    ? B
    : never
  : never;

type PluralKey = Extract<MessageKey, `${string}_${PluralCategory}`>;

export type Messages = Omit<Record<MessageKey, string>, PluralKey> &
  Partial<Record<PluralKey | `${PluralBase}_${PluralCategory}`, string>>;

export type NoArgKey = { [K in MessageKey]: ArgsOf<K> extends [] ? K : never }[MessageKey];

export type TFn = <K extends MessageKey>(key: K, ...args: ArgsOf<K>) => string;

export type TnFn = (
  base: PluralBase,
  count: number,
  args?: Record<string, string | number>,
) => string;
