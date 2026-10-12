import type { ReactElement } from 'react';
import type { PickerMon } from '../model/catalog';
import { pickerLabelOf } from './spriteLabel';
import { PokemonNameTooltip } from '@/components/shared/PokemonNameTooltip';

export function NameTooltip({ mon, children }: { mon: PickerMon; children: ReactElement }) {
  return <PokemonNameTooltip label={() => pickerLabelOf(mon)} testId="favorites-name-tooltip">{children}</PokemonNameTooltip>;
}
