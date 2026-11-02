import type { ESLint, Linter } from 'eslint';

export interface WrittenRule {
  id: string;
  rule: string;
  source: string;
  files: string[];
  ignores?: string[];
  selectors: string[];
  fix: string;
}

export const WRITTEN_RULES: WrittenRule[];
export const writtenRulesPlugin: ESLint.Plugin;
export const writtenRulesConfig: Linter.Config[];
