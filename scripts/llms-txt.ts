import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

interface SitePage {
  url: string;
  name: string;
  description: string;
}

interface Entry {
  file: string;
  type: unknown;
  page: SitePage;
}

const SITEMAP = 'public/sitemap.xml';
const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const NOINDEX = /<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bnoindex)[^>]*>/i;
const JSON_LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
const FIX = 'See docs/seo/PAGE-SEO-CONTRACT.md items 10 and 11.';
const DESCRIPTION_TAGS = ['name="description"', 'property="og:description"', 'name="twitter:description"'];
const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

function metaContent(html: string, attribute: string): string | undefined {
  const tag = new RegExp(`<meta\\s+${attribute}\\s+content="([^"]*)"`).exec(html)?.[1];
  return tag?.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity]);
}

function checkDescriptionTags(file: string, html: string, description: string) {
  for (const attribute of DESCRIPTION_TAGS) {
    const content = metaContent(html, attribute);
    if (content !== undefined && content !== description) {
      throw new Error(`llms-txt: the <meta ${attribute}> in ${file} differs from its JSON-LD description. Give both the same text. ${FIX}`);
    }
  }
}

function readEntry(root: string, input: string): Entry | null {
  const absolute = path.resolve(root, input);
  const file = path.relative(root, absolute);
  const html = fs.readFileSync(absolute, 'utf8');
  if (NOINDEX.test(html)) return null;
  const block = JSON_LD.exec(html)?.[1];
  if (!block) throw new Error(`llms-txt: ${file} has no JSON-LD block. Add one, or mark the page noindex. ${FIX}`);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(block);
  } catch (cause) {
    throw new Error(`llms-txt: the JSON-LD in ${file} is not valid JSON. Fix its syntax. ${FIX}`, { cause });
  }
  const field = (key: keyof SitePage) => {
    const value = data[key];
    if (typeof value !== 'string' || !value) throw new Error(`llms-txt: the JSON-LD in ${file} lacks "${key}". Add it. ${FIX}`);
    return value;
  };
  const page = { url: field('url'), name: field('name'), description: field('description') };
  checkDescriptionTags(file, html, page.description);
  return { file, type: data['@type'], page };
}

function sitePages(config: ResolvedConfig): SitePage[] {
  const locs = [...fs.readFileSync(path.join(config.root, SITEMAP), 'utf8').matchAll(LOC)].map((match) => match[1]);
  const input = config.build.rolldownOptions.input;
  const entries = Object.values(typeof input === 'string' ? [input] : input ?? {})
    .filter((file) => file.endsWith('.html'))
    .map((file) => readEntry(config.root, file))
    .filter((entry) => entry !== null);

  const byUrl = new Map<string, Entry>();
  for (const entry of entries) {
    const { url } = entry.page;
    const other = byUrl.get(url);
    if (other) throw new Error(`llms-txt: ${other.file} and ${entry.file} share the JSON-LD url ${url}. Give each page its own url. ${FIX}`);
    if (!locs.includes(url)) {
      throw new Error(`llms-txt: ${SITEMAP} does not list ${url}, the JSON-LD url in ${entry.file}. Add a <loc> for it, or mark the page noindex. ${FIX}`);
    }
    byUrl.set(url, entry);
  }

  const pages = locs.map((loc) => {
    const entry = byUrl.get(loc);
    if (!entry) throw new Error(`llms-txt: ${SITEMAP} lists ${loc}, but no indexable build entry has that JSON-LD url. Remove the <loc>, or fix the page's url. ${FIX}`);
    return entry;
  });
  if (pages[0]?.type !== 'WebSite') {
    throw new Error(`llms-txt: the first <loc> in ${SITEMAP} must be the hub, whose JSON-LD @type is WebSite. Move the hub's <loc> to the top. ${FIX}`);
  }
  const hub = pages[0].page;
  if (!hub.description.startsWith(hub.name)) {
    throw new Error(`llms-txt: the hub description must start with "${hub.name}". Without the brand name, Google picks other page text as the snippet for a brand search. ${FIX}`);
  }
  return pages.map((entry) => entry.page);
}

function render([hub, ...tools]: SitePage[]): string {
  const lines = tools.map((tool) => `- [${tool.name}](${tool.url}): ${tool.description}`);
  return [`# ${hub.name}`, '', `> ${hub.description}`, '', '## Tools', '', ...lines, ''].join('\n');
}

export function llmsTxt(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'llms-txt',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: render(sitePages(config)) });
    },
  };
}
