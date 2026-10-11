// Prints the hub card's egg icon (EggIcon in src/components/shared/AppIcons.tsx),
// rebuilt from the sprite trace: node docs/design/tools-menu-icons/egg-trace/print.mjs
import { buildIcon } from './icons.mjs';
import { CANDIDATES } from './variants.mjs';

const chosen = CANDIDATES.find((c) => c.id === 'large-spots-turn');
process.stdout.write(buildIcon(chosen.opts).svg);
