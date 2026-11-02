import type { ESLint, Rule } from 'eslint';

declare const plugin: ESLint.Plugin & { rules: { 'no-comments': Rule.RuleModule } };
export default plugin;
