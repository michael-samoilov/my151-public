export const SURFACES = [
  { surface: 'blink', engine: 'blink', persona: null },
  { surface: 'blink-ios-safari', engine: 'blink', persona: 'ios-safari' },
  { surface: 'blink-ios-chrome', engine: 'blink', persona: 'ios-chrome' },
  { surface: 'blink-android', engine: 'blink', persona: 'android-chrome' },
  { surface: 'webkit', engine: 'webkit', persona: null },
  { surface: 'gecko', engine: 'gecko', persona: null },
] as const;
export type SurfaceDef = typeof SURFACES[number];

export function parseArgs(argv: string[]) {
  let index = 0;
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[index++] : 'absolute';
  if (mode !== 'absolute' && mode !== 'diff') throw new Error(`Unknown mode ${mode}; use absolute or diff`);
  const args: {
    mode: 'absolute' | 'diff'; base?: string; surfaces?: string[]; screens?: string[];
    noBuild: boolean; video: boolean; noVisual: boolean; visualOnly: boolean;
  } = { mode, noBuild: false, video: false, noVisual: false, visualOnly: false };
  const value = (flag: string): string => {
    const next = argv[index++];
    if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  const list = (flag: string): string[] => {
    const values = value(flag).split(',').map((entry) => entry.trim());
    if (values.some((entry) => !entry)) throw new Error(`${flag} needs a nonempty comma-separated list`);
    return values;
  };
  while (index < argv.length) {
    const flag = argv[index++];
    switch (flag) {
      case '--base': args.base = value(flag); break;
      case '--surfaces': args.surfaces = list(flag); break;
      case '--screens': args.screens = list(flag); break;
      case '--no-build': args.noBuild = true; break;
      case '--video': args.video = true; break;
      case '--no-visual': args.noVisual = true; break;
      case '--visual-only': args.visualOnly = true; break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  const known: string[] = SURFACES.map((surface) => surface.surface);
  const unknown = args.surfaces?.filter((surface) => !known.includes(surface));
  if (unknown?.length) throw new Error(`Unknown surface ${unknown.join(',')}; use ${known.join(',')}`);
  if (mode === 'diff' && !args.base) throw new Error('diff mode needs --base <ref>');
  if (args.visualOnly && (mode !== 'diff' || args.noVisual)) throw new Error('--visual-only needs diff mode and cannot use --no-visual');
  return args;
}
