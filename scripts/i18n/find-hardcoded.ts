import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const ALLOWLIST_PATH = 'scripts/i18n/hardcoded-allowlist.json';

const SCAN_ROOTS = [
  'src/App.tsx',
  'src/main.tsx',
  'src/components',
  'src/home',
  'src/hooks',
  'src/league',
  'src/favorites',
  'src/lib',
];

const EXCLUDE: RegExp[] = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /^src\/components\/admin\//,
  /^src\/lib\/(usageFunnels|sankey[A-Za-z]*|whoOrigin|searchPerformance[A-Za-z]*|crossTool[A-Za-z]*|dashboardRange|aggregate|platformStacks)\./,
];

const TEXT_ATTRS = new Set([
  'aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'aria-placeholder',
  'title', 'placeholder', 'alt', 'label', 'heading', 'description', 'hint', 'caption', 'tooltip',
  'emptyText', 'emptyLabel', 'ariaLabel', 'subtitle', 'text', 'message', 'confirmLabel', 'cancelLabel',
]);

const NON_TEXT_ATTRS = new Set([
  'className', 'class', 'id', 'key', 'type', 'role', 'href', 'src', 'srcSet', 'sizes', 'rel',
  'target', 'name', 'htmlFor', 'form', 'method', 'action', 'lang', 'dir', 'loading', 'decoding',
  'fetchPriority', 'crossOrigin', 'referrerPolicy', 'inputMode', 'enterKeyHint', 'autoComplete',
  'autoCapitalize', 'spellCheck', 'pattern', 'accept', 'viewBox', 'd', 'fill', 'stroke',
  'strokeLinecap', 'strokeLinejoin', 'fillRule', 'clipRule', 'xmlns', 'preserveAspectRatio',
  'textAnchor', 'dominantBaseline', 'fontFamily', 'fontWeight', 'transform', 'gradientUnits',
  'mode', 'variant', 'size', 'side', 'align', 'tone', 'kind', 'icon', 'as', 'testId', 'slot',
  'aria-hidden', 'aria-live', 'aria-current', 'aria-haspopup', 'aria-controls', 'aria-labelledby',
  'aria-describedby', 'aria-orientation', 'aria-sort', 'aria-autocomplete', 'aria-relevant',
  'draggable', 'tabIndex', 'width', 'height', 'color', 'shape', 'position', 'placement', 'layout',
  'surface', 'scope', 'source', 'origin', 'tool', 'context', 'location', 'route', 'path', 'tab',
  'view', 'orientation', 'direction', 'axis', 'format', 'locale', 'storageKey', 'event',
]);

const TEXT_PROPS = new Set([
  'label', 'title', 'placeholder', 'alt', 'ariaLabel', 'aria-label', 'description', 'hint',
  'heading', 'caption', 'tooltip', 'emptyText', 'emptyLabel', 'subtitle', 'shortLabel',
  'longLabel', 'tinyLabel', 'buttonLabel', 'confirmLabel', 'cancelLabel', 'message', 'text',
  'body', 'help', 'summary', 'legend', 'unit', 'suffix', 'prefix', 'name', 'displayName',
]);

function isTextLike(value: string): boolean {
  const s = value.replace(/&[a-z]+;|&#\d+;/g, ' ').trim();
  if (!/[A-Za-z]/.test(s)) return false;
  if (/^[a-z][\w-]*(\.[\w-]+)+$/.test(s)) return false;
  if (/^(https?:|mailto:|\/|#|\.\/|data:)/.test(s)) return false;
  if (/^(rgba?|hsla?|var|calc|url|linear-gradient|radial-gradient)\(/.test(s)) return false;
  if (/\b\d+(\.\d+)?(px|rem|em|vh|vw|%)\b/.test(s) && !/\s[a-z]{4,}\s[a-z]{4,}/.test(s)) return false;
  if (/^[a-z][a-z0-9]*([-_:][a-z0-9]+)+$/.test(s)) return false;
  if (/^[a-z]+[A-Z]\w*$/.test(s)) return false;
  if (/^(bold|italic|normal|\d{3})\s/.test(s)) return false;
  return true;
}

function readsAsWords(value: string): boolean {
  const s = value.trim();
  if (!isTextLike(s)) return false;
  if (/^[A-Z][a-z]+(\s|$)/.test(s)) return true;
  return /^[a-z]+(\s[a-z]+){2,}[.!?]?$/.test(s) && !/(^|\s)(flex|grid|block|inline|hidden|absolute|relative|w|h|p|m)(\s|$)/.test(s);
}

interface Finding {
  file: string;
  line: number;
  kind: 'jsx-text' | 'jsx-expr' | 'attr' | 'prop' | 'canvas';
  where: string;
  text: string;
}

interface AllowEntry { text?: string; file?: string; reason: string }

function walkFiles(path: string, out: string[]): void {
  const full = join(ROOT, path);
  if (statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) walkFiles(join(path, name), out);
    return;
  }
  if (!/\.(ts|tsx)$/.test(path)) return;
  if (EXCLUDE.some((re) => re.test(path))) return;
  out.push(path);
}

function renderedStrings(node: ts.Expression, out: { text: string; node: ts.Node }[]): void {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    renderedStrings(node.expression, out);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push({ text: node.text, node });
  } else if (ts.isTemplateExpression(node)) {
    const fixed = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('{…}');
    out.push({ text: fixed, node });
  } else if (ts.isConditionalExpression(node)) {
    renderedStrings(node.whenTrue, out);
    renderedStrings(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      renderedStrings(node.right, out);
    } else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) {
      renderedStrings(node.left, out);
      renderedStrings(node.right, out);
    }
  }
}

const fixedText = (text: string) => text.replace(/\{…\}/g, ' ');

function attrName(attr: ts.JsxAttribute): string {
  return attr.name.getText();
}

function scanFile(path: string): Finding[] {
  const source = readFileSync(join(ROOT, path), 'utf8');
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const add = (node: ts.Node, kind: Finding['kind'], where: string, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    findings.push({ file: path, line, kind, where, text: text.replace(/\s+/g, ' ').trim() });
  };

  const visit = (node: ts.Node): void => {

    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening?.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'data-i18n-exempt')) return;
    if (ts.isJsxText(node)) {
      const text = node.getText(sf);
      if (isTextLike(text)) add(node, 'jsx-text', 'child', text);
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const hits: { text: string; node: ts.Node }[] = [];
      renderedStrings(node.expression, hits);
      for (const hit of hits) if (isTextLike(fixedText(hit.text))) add(hit.node, 'jsx-expr', 'child', hit.text);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = attrName(node);
      const isText = TEXT_ATTRS.has(name);
      if (isText || !(NON_TEXT_ATTRS.has(name) || name.startsWith('data-') || /^on[A-Z]/.test(name))) {
        const hits: { text: string; node: ts.Node }[] = [];
        if (ts.isStringLiteral(node.initializer)) hits.push({ text: node.initializer.text, node: node.initializer });
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) renderedStrings(node.initializer.expression, hits);
        for (const hit of hits) {
          const text = fixedText(hit.text);
          if (isText ? isTextLike(text) : readsAsWords(text)) add(hit.node, 'attr', name, hit.text);
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      if (TEXT_PROPS.has(name)) {
        const hits: { text: string; node: ts.Node }[] = [];
        renderedStrings(node.initializer, hits);
        for (const hit of hits) {
          const text = fixedText(hit.text);
          if (isTextLike(text) && (name !== 'name' || /^[A-Z]|\s/.test(text))) add(hit.node, 'prop', name, hit.text);
        }
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if ((method === 'fillText' || method === 'strokeText') && node.arguments[0]) {
        const hits: { text: string; node: ts.Node }[] = [];
        renderedStrings(node.arguments[0], hits);
        for (const hit of hits) if (isTextLike(fixedText(hit.text))) add(hit.node, 'canvas', method, hit.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function main(): void {
  const json = process.argv.includes('--json');
  const allow = JSON.parse(readFileSync(join(ROOT, ALLOWLIST_PATH), 'utf8')) as { entries: AllowEntry[] };
  const matches = (e: AllowEntry, f: Finding) =>
    (e.text === undefined || e.text === f.text) && (!e.file || e.file === f.file);
  const allowed = (f: Finding) => allow.entries.some((e) => matches(e, f));

  const files: string[] = [];
  for (const root of SCAN_ROOTS) walkFiles(root, files);
  const all = files.flatMap(scanFile);
  const open = all.filter((f) => !allowed(f));

  const stale = allow.entries.filter((e) => !all.some((f) => matches(e, f)));

  if (json) {
    console.log(JSON.stringify({ scanned: files.length, findings: open, stale }, null, 2));
  } else {
    for (const f of open) console.log(`${relative(ROOT, join(ROOT, f.file))}:${f.line}  [${f.kind} ${f.where}]  ${JSON.stringify(f.text)}`);
    for (const e of stale) console.log(`allowlist entry matches nothing: ${JSON.stringify(e.text ?? '*')}${e.file ? ` in ${e.file}` : ''}`);
    console.log(`\n${files.length} files scanned, ${open.length} hardcoded string(s), ${all.length - open.length} allowlisted, ${stale.length} stale allowlist entr${stale.length === 1 ? 'y' : 'ies'}`);
  }
  process.exit(open.length || stale.length ? 1 : 0);
}

main();
