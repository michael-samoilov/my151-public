import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import plugin from './plugin.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const banned = [{ messageId: 'banned' }];

tester.run('my151/no-comments', plugin.rules['no-comments'], {
  valid: [
    '/* eslint-disable no-console */\nconsole.log(1);',
    '// eslint-disable-next-line no-console\nconsole.log(1);',
    '// @ts-expect-error untyped vendor field\nwindow.x = 1;',
    '/// <reference types="vite/client" />\nexport {};',
    "await import(/* @vite-ignore */ 'x');",
    'const x = /* #__PURE__ */ make();',
    '// keeps: the migration drops no saved picks\nexport {};',
    '// platform: iOS Safari zooms a field under 16px on focus.\nexport {};',
    'const a = <div>{/* platform: Radix ignores touch pointers. */}</div>;',
  ],
  invalid: [
    { code: 'const a = 1;\n// note\nconst b = 2;\n', output: 'const a = 1;\nconst b = 2;\n', errors: banned },
    { code: 'const a = 1; // note\n', output: 'const a = 1;\n', errors: banned },
    { code: 'const a = 1;\n\n// note\n\nconst b = 2;\n', output: 'const a = 1;\n\nconst b = 2;\n', errors: banned },
    { code: 'function f() {\n  g();\n\n  // note\n}\n', output: 'function f() {\n  g();\n}\n', errors: banned },
    { code: 'try { f(); } catch {\n  // ignore\n}\n', output: 'try { f(); } catch {}\n', errors: banned },
    { code: 'const a = typeof/* glue */b;', output: 'const a = typeof b;', errors: banned },
    { code: 'const a = f(/* note */ b);', output: 'const a = f(b);', errors: banned },
    { code: 'function f() {\n  return /*\n  */ 1;\n}', output: 'function f() {\n  return \n1;\n}', errors: banned },
    {
      code: 'const a = (\n  <div>\n    {/* note */}\n    <span />\n  </div>\n);\n',
      output: 'const a = (\n  <div>\n    <span />\n  </div>\n);\n',
      errors: banned,
    },
    { code: '// platform: two\n// lines are two comments\nexport {};', output: '// platform: two\nexport {};', errors: banned },
    { code: '/* platform: a block\n   that spans lines */\nexport {};', output: 'export {};', errors: banned },
  ],
});
