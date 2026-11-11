import { execFileSync } from 'node:child_process';

export const PRODUCTION_REF = 'origin/claude/pokedex-region-builder-AviYF';
const PUBLIC_CLONE_REFS = ['origin/main', 'main'];

const isCommit = (root: string, ref: string) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export function defaultBase(root: string = process.cwd()): string {
  return [PRODUCTION_REF, ...PUBLIC_CLONE_REFS].find((ref) => isCommit(root, ref)) ?? PRODUCTION_REF;
}
