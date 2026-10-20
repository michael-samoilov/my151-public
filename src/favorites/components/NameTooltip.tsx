import type { ReactElement } from 'react';
import { getLocale } from '@/i18n';
import type { PickerMon } from '../model/catalog';
import { sourceGameTitle } from '../model/sourceGame';
import { pickerLabelOf } from './spriteLabel';
import { PokemonNameTooltip } from '@/components/shared/PokemonNameTooltip';

export function NameTooltip({ mon, children }: { mon: PickerMon; children: ReactElement }) {
  return <PokemonNameTooltip label={() => pickerLabelOf(mon)} detail={() => sourceGameTitle(mon, getLocale())}
    testId="favorites-name-tooltip">{children}</PokemonNameTooltip>;
}
