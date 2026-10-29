(() => {
  const RUNS_KEY = 'p151-trace-runs';
  const KEPT_RUNS = 5;
  const SPRITE_CACHE = 'p151-sprites-v2';
  const CARDS = ['dex', 'league', 'favorites'];
  const HUB_IMAGES = 'img[data-card-scene], [data-artwork] img';
  const GIVE_UP_MS = 15000;
  const TAIL_MS = 2000;
  const html = document.documentElement;
  const worker = navigator.serviceWorker;

  const trace = {
    url: location.pathname + location.search,
    startedAt: new Date().toISOString(),
    outcome: null,
    events: [],
    snapshot: null,
    summary: null,
  };
  let recording = true;

  function log(what, detail = null, t = performance.now()) {
    if (recording) trace.events.push({ t: Math.round(t), what, detail });
  }

  function file(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return 'data:';
    const parsed = new URL(url, location.href);
    const name = parsed.pathname === '/' ? '/' : parsed.pathname.split('/').pop();
    return parsed.origin === location.origin ? name : `${parsed.host}/${name}`;
  }

  log('trace start', {
    classes: html.className,
    readyState: document.readyState,
    visibility: document.visibilityState,
    prerendering: Boolean(document.prerendering),
    controlled: Boolean(worker && worker.controller),
  });

  const tokens = (value) => (value || '').split(/\s+/).filter(Boolean);
  new MutationObserver((records) => {
    const t = performance.now();
    records.forEach((record, index) => {
      const name = record.attributeName;
      const next = records.slice(index + 1).find((later) => later.attributeName === name);
      const value = next ? next.oldValue : html.getAttribute(name);
      if (name !== 'class') {
        if (value !== record.oldValue) log('attr', `${name}=${value}`, t);
        return;
      }
      const before = tokens(record.oldValue);
      const after = tokens(value);
      after.forEach((cls) => { if (!before.includes(cls)) log('class +', cls, t); });
      before.forEach((cls) => { if (!after.includes(cls)) log('class -', cls, t); });
    });
    check();
  }).observe(html, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-home-scene', 'data-home-slot'] });

  let lastFrame = 0;
  let loaded = document.readyState === 'complete';
  document.addEventListener('visibilitychange', () => {
    lastFrame = 0;
    log('visibilitychange', document.visibilityState);
  });
  addEventListener('pageshow', (event) => log('pageshow', { persisted: event.persisted }));
  addEventListener('pagehide', (event) => log('pagehide', { persisted: event.persisted }));
  document.addEventListener('DOMContentLoaded', () => log('DOMContentLoaded'));
  addEventListener('load', () => {
    loaded = true;
    log('load');
    check();
  });
  if (worker) worker.addEventListener('controllerchange', () => log('controllerchange'));

  const hubImage = (target) => target instanceof HTMLImageElement && target.matches(HUB_IMAGES);
  document.addEventListener('load', (event) => {
    const name = hubImage(event.target) && file(event.target.currentSrc || event.target.src);
    if (name && name !== 'data:') log('img load', name);
  }, true);
  document.addEventListener('error', (event) => {
    if (hubImage(event.target)) log('img error', file(event.target.currentSrc || event.target.src));
  }, true);

  const decode = HTMLImageElement.prototype.decode;
  if (decode) {
    HTMLImageElement.prototype.decode = function (...args) {
      const name = file(this.currentSrc || this.src);
      log('decode call', name);
      const promise = decode.apply(this, args);
      promise.then(() => log('decode ok', name), (error) => log('decode fail', `${name} ${error && error.name}`));
      return promise;
    };
  }

  function observe(type, record) {
    if (!(PerformanceObserver.supportedEntryTypes || []).includes(type)) {
      log('unsupported', type);
      return;
    }
    new PerformanceObserver((list) => list.getEntries().forEach(record)).observe({ type, buffered: true });
  }
  observe('paint', (entry) => log('paint', entry.name, entry.startTime));
  observe('largest-contentful-paint', (entry) => log('lcp', {
    tag: entry.element ? entry.element.tagName.toLowerCase() : null,
    url: file(entry.url),
    size: entry.size,
  }, entry.startTime));

  const seen = { title: false, dex: false, league: false, favorites: false };
  let frames = 0;
  // Computed visibility first: it needs style only, and a hidden element then
  // skips the layout that getClientRects forces.
  const visible = (node) => Boolean(node) && getComputedStyle(node).visibility === 'visible' && node.getClientRects().length > 0;

  function frame(timestamp) {
    if (!recording) return;
    if (!frames++) log('first frame');
    else if (lastFrame && timestamp - lastFrame > 50) log('frame gap', { ms: Math.round(timestamp - lastFrame) });
    lastFrame = timestamp;
    // Forcing layout while the HTML still streams can change when an engine
    // first paints. The hub stays hidden until this end marker exists anyway.
    if (document.getElementById('p151-end')) {
      if (!seen.title && Array.from(document.querySelectorAll('.hub-grid [data-card-title]')).some(visible)) {
        seen.title = true;
        log('cards visible');
      }
      CARDS.forEach((card) => {
        if (seen[card]) return;
        const line = document.querySelector(`[data-card-progress="${card}"] [data-progress-count]`);
        if (visible(line) && /\d/.test(line.textContent)) {
          seen[card] = true;
          log('count visible', { card, text: line.textContent.trim() });
        }
      });
    }
    check();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let tail = 0;
  const giveUp = setTimeout(() => finish('timed out'), GIVE_UP_MS);
  function check() {
    if (tail || !recording) return;
    const revealed = !html.classList.contains('p151-hub-images-pending') && !html.classList.contains('p151-wait');
    const counted = CARDS.every((card) => seen[card] || !html.classList.contains(`p151-saved-${card}`));
    if (revealed && loaded && counted) {
      log('finish condition met');
      clearTimeout(giveUp);
      tail = setTimeout(() => finish('done'), TAIL_MS);
    }
  }

  const round = (value) => (typeof value === 'number' ? Math.round(value) : value);
  function pick(entry, keys) {
    const picked = {};
    keys.forEach((key) => { if (entry && key in entry) picked[key] = round(entry[key]); });
    return picked;
  }
  const NAVIGATION_KEYS = ['type', 'workerStart', 'fetchStart', 'domainLookupStart', 'domainLookupEnd', 'connectStart', 'connectEnd',
    'secureConnectionStart', 'requestStart', 'responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventEnd',
    'loadEventEnd', 'transferSize', 'nextHopProtocol', 'activationStart'];
  const RESOURCE_KEYS = ['initiatorType', 'startTime', 'workerStart', 'requestStart', 'responseStart', 'responseEnd',
    'transferSize', 'encodedBodySize', 'nextHopProtocol'];
  const elapsed = (since) => Math.round((performance.now() - since) * 10) / 10;

  async function collect() {
    const entries = performance.getEntriesByType('resource');
    const entry = document.querySelector('script[type="module"][src]');
    const entryStarts = entry ? entries.filter((resource) => resource.name === entry.src).map((resource) => resource.startTime) : [];
    const snapshot = {
      navigation: pick(performance.getEntriesByType('navigation')[0], NAVIGATION_KEYS),
      resources: entries.map((resource) => ({ name: file(resource.name), ...pick(resource, RESOURCE_KEYS) })),
      appModule: entry ? { file: file(entry.src), startTime: entryStarts.length ? Math.round(Math.min(...entryStarts)) : null } : null,
      device: {
        userAgent: navigator.userAgent,
        devicePixelRatio,
        innerWidth,
        innerHeight,
        hardwareConcurrency: navigator.hardwareConcurrency,
      },
      storage: null,
      spriteCache: null,
    };
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        snapshot.storage = { usage, quota };
      }
    } catch (error) {
      snapshot.storage = { error: String(error) };
    }
    // Last, so the cache reads cannot compete with the load they describe.
    // caches.has first, because caches.open would create a missing cache.
    try {
      if (self.caches) {
        let since = performance.now();
        const exists = await caches.has(SPRITE_CACHE);
        snapshot.spriteCache = { exists, hasMs: elapsed(since) };
        if (exists) {
          since = performance.now();
          const cache = await caches.open(SPRITE_CACHE);
          snapshot.spriteCache.openMs = elapsed(since);
          const url = Array.from(document.querySelectorAll(HUB_IMAGES)).map((img) => img.currentSrc).find((src) => src && !src.startsWith('data:'));
          if (url) {
            since = performance.now();
            const hit = await cache.match(url);
            Object.assign(snapshot.spriteCache, { matchMs: elapsed(since), matchFile: file(url), hit: Boolean(hit) });
          }
          snapshot.spriteCache.entries = (await cache.keys()).length;
        }
      }
    } catch (error) {
      snapshot.spriteCache = { error: String(error) };
    }
    return snapshot;
  }

  const startOf = (tr) => tr.events.find((event) => event.what === 'trace start');
  function firstAt(tr, what, match = () => true) {
    const event = tr.events.find((candidate) => candidate.what === what && match(candidate.detail));
    return event ? event.t : null;
  }
  function lastAt(tr, what) {
    const matches = tr.events.filter((event) => event.what === what);
    return matches.length ? matches[matches.length - 1].t : null;
  }
  const is = (value) => (detail) => detail === value;
  // When the class was last removed; 0 when it never was on <html>, null when it still is.
  function goneAt(tr, cls) {
    let present = tokens(startOf(tr).detail.classes).includes(cls);
    let at = present ? null : 0;
    tr.events.forEach((event) => {
      if (event.detail !== cls) return;
      if (event.what === 'class +') { present = true; at = null; }
      if (event.what === 'class -') { present = false; at = event.t; }
    });
    return at;
  }
  function removedAt(tr, cls) {
    const at = goneAt(tr, cls);
    return at === 0 ? `≤${startOf(tr).t}` : at;
  }
  function navigation(tr, key) {
    const value = tr.snapshot.navigation[key];
    return typeof value === 'number' ? value : null;
  }
  function artReady(tr, card) {
    const ready = firstAt(tr, 'class +', is(`p151-hub-${card}-ready`));
    const fallback = firstAt(tr, 'class +', is(`p151-hub-${card}-fallback`));
    if (fallback !== null && (ready === null || fallback < ready)) return `${ready === null ? fallback : ready} fb`;
    return ready;
  }
  function revealedAt(tr) {
    const art = goneAt(tr, 'p151-hub-images-pending');
    const wait = goneAt(tr, 'p151-wait');
    return art === null || wait === null ? null : Math.max(art, wait);
  }

  const MILESTONES = [
    { name: 'request start', at: (tr) => navigation(tr, 'requestStart') },
    { name: 'first HTML byte', at: (tr) => navigation(tr, 'responseStart') },
    { name: 'HTML done', at: (tr) => navigation(tr, 'responseEnd') },
    { name: 'trace script loaded', at: (tr) => startOf(tr).t },
    { name: 'first frame', at: (tr) => firstAt(tr, 'first frame') },
    { name: 'first paint', at: (tr) => firstAt(tr, 'paint') },
    { name: 'font ready', at: (tr) => removedAt(tr, 'p151-hub-font-pending') },
    { name: 'DOM ready', at: (tr) => firstAt(tr, 'DOMContentLoaded') },
    ...CARDS.map((card) => ({ name: `${card} art ready`, at: (tr) => artReady(tr, card) })),
    { name: 'artwork revealed', at: revealedAt },
    { name: 'cards visible', at: (tr) => firstAt(tr, 'cards visible') },
    { name: 'app module requested', at: (tr) => (tr.snapshot.appModule ? tr.snapshot.appModule.startTime : null) },
    { name: 'load event', at: (tr) => firstAt(tr, 'load') },
    { name: 'hydration done', at: (tr) => firstAt(tr, 'class -', is('p151-hub-hydrating')) },
    ...CARDS.map((card) => ({ name: `${card} count`, at: (tr) => firstAt(tr, 'count visible', (detail) => detail.card === card) })),
    { name: 'LCP', at: (tr) => lastAt(tr, 'lcp') },
  ];

  function summarize(tr) {
    const summary = {};
    MILESTONES.forEach(({ name, at }) => {
      try { summary[name] = at(tr); } catch { summary[name] = null; }
    });
    return summary;
  }

  function readRuns() {
    try {
      const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || '[]');
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
    }
  }
  function writeRuns(runs) {
    try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs)); } catch { /* private mode or full storage */ }
  }

  async function finish(outcome) {
    if (!recording) return;
    clearTimeout(giveUp);
    clearTimeout(tail);
    log(outcome);
    recording = false;
    trace.outcome = outcome;
    trace.events.sort((a, b) => a.t - b.t);
    trace.snapshot = await collect();
    trace.summary = summarize(trace);
    const run = {
      facts: {
        time: new Date(trace.startedAt).toTimeString().slice(0, 8),
        'nav type': trace.snapshot.navigation.type || '-',
        'SW control': startOf(trace).detail.controlled ? 'yes' : 'no',
        outcome,
      },
      milestones: trace.summary,
    };
    const runs = [run, ...readRuns()].slice(0, KEPT_RUNS);
    writeRuns(runs);
    render(run, runs);
  }

  function el(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text != null) node.textContent = text;
    return node;
  }
  const show = (value) => (value === null || value === undefined ? '-' : String(value));
  function describe(detail) {
    if (detail === null) return '';
    if (typeof detail !== 'object') return String(detail);
    return Object.keys(detail).map((key) => `${key}=${detail[key]}`).join(' ');
  }
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

  const PANEL_CSS = 'all:initial;display:block;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;box-sizing:border-box;'
    + 'max-height:75vh;max-height:75dvh;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;'
    + 'background:#fff;color:#000;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
    + '-webkit-text-size-adjust:100%;text-size-adjust:100%;border-top:2px solid #000;box-shadow:0 -2px 8px rgba(0,0,0,.25);padding:0 8px 8px';
  const BUTTON_CSS = 'all:initial;font:inherit;font-size:13px;line-height:1.2;color:#000;background:#eee;border:1px solid #444;'
    + 'border-radius:4px;padding:8px 12px;cursor:pointer;white-space:nowrap';
  const CELL_CSS = 'padding:2px 0 2px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid #ddd;font:inherit';
  const LABEL_CSS = 'padding:2px 8px 2px 0;text-align:left;white-space:nowrap;border-bottom:1px solid #ddd;font:inherit;position:sticky;left:0;background:#fff';
  const HEADING_CSS = 'display:block;font-weight:bold;margin:10px 0 2px';
  const LINE_CSS = 'display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin:0';
  const EVENT_CSS = `${LINE_CSS};padding-left:7ch;text-indent:-7ch`;

  function table(runs) {
    const wrap = el('div', 'display:block;overflow-x:auto;max-width:100%;margin:2px 0');
    // Separate borders: WebKit drops collapsed borders on sticky cells.
    const grid = el('table', 'border-collapse:separate;border-spacing:0;font:inherit;color:inherit');
    const row = (label, cells, bold) => {
      const tr = el('tr');
      tr.appendChild(el(bold ? 'th' : 'td', `${LABEL_CSS}${bold ? ';font-weight:bold' : ''}`, label));
      cells.forEach((cell) => tr.appendChild(el(bold ? 'th' : 'td', `${CELL_CSS}${bold ? ';font-weight:bold' : ''}`, cell)));
      grid.appendChild(tr);
    };
    row('ms from nav start', runs.map((_, index) => `#${index + 1}`), true);
    Object.keys(runs[0].facts).forEach((fact) => row(fact, runs.map((run) => show(run.facts && run.facts[fact]))));
    MILESTONES.forEach(({ name }) => row(name, runs.map((run) => show(run.milestones && run.milestones[name]))));
    wrap.appendChild(grid);
    return wrap;
  }

  function facts() {
    const { navigation: nav, device, storage, spriteCache } = trace.snapshot;
    const lines = [
      `device ${device.userAgent}`,
      `screen ${device.innerWidth}x${device.innerHeight} @${device.devicePixelRatio}x, ${show(device.hardwareConcurrency)} cores`,
      [`html ${show(nav.nextHopProtocol)}`, nav.transferSize === undefined ? '' : kb(nav.transferSize), `workerStart ${show(nav.workerStart)}`,
        nav.activationStart === undefined ? '' : `activationStart ${nav.activationStart}`].filter(Boolean).join(' '),
      `storage ${!storage ? '-' : storage.error || `${mb(storage.usage)} of ${mb(storage.quota)}`}`,
      `sprite cache ${!spriteCache ? 'unavailable' : spriteCache.error || describe(spriteCache)}`,
    ];
    const block = el('div', 'display:block;margin:6px 0 0');
    lines.forEach((line) => block.appendChild(el('div', LINE_CSS, line)));
    return block;
  }

  function render(run, runs) {
    const panel = el('div', PANEL_CSS);
    panel.id = 'p151-trace';
    const bar = el('div', 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;position:sticky;top:0;z-index:1;background:#fff;padding:8px 0 6px');
    const status = el('div', 'display:block;margin:0 0 4px', `Hub load trace, ${trace.outcome}. #1 is this load.`);
    const legend = el('div', 'display:block;margin:0');
    ['≤ = before the trace script ran', 'fb = artwork fallback'].forEach((line) => legend.appendChild(el('div', LINE_CSS, line)));
    let grid = table(runs);
    let copyBox = null;

    const button = (label, action) => {
      const node = el('button', BUTTON_CSS, label);
      node.type = 'button';
      node.addEventListener('click', action);
      bar.appendChild(node);
    };
    button('Copy', () => {
      const text = JSON.stringify({ ...trace, runs });
      const fallback = () => {
        if (!copyBox) {
          copyBox = el('textarea', 'all:initial;display:block;box-sizing:border-box;width:100%;height:120px;font:16px/1.3 monospace;color:#000;background:#fff;border:1px solid #444;margin:0 0 6px');
          copyBox.readOnly = true;
          status.after(copyBox);
        }
        copyBox.value = text;
        copyBox.focus();
        copyBox.select();
        copyBox.setSelectionRange(0, text.length);
        let copied = false;
        try { copied = document.execCommand('copy'); } catch { /* unsupported */ }
        status.textContent = copied ? `Copied ${text.length} characters.` : 'Select the text below and copy it.';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => { status.textContent = `Copied ${text.length} characters.`; }, fallback);
      } else {
        fallback();
      }
    });
    button('Load again', () => location.assign(location.href));
    button('Clear runs', () => {
      try { localStorage.removeItem(RUNS_KEY); } catch { /* storage blocked */ }
      runs = [run];
      const next = table(runs);
      grid.replaceWith(next);
      grid = next;
      status.textContent = 'Cleared the saved runs. The next load starts a new comparison.';
    });
    button('Hide', () => panel.remove());

    panel.append(bar, status, grid, legend, facts());
    panel.appendChild(el('div', HEADING_CSS, `Events (${trace.events.length})`));
    trace.events.forEach((event) => {
      panel.appendChild(el('div', EVENT_CSS, `${String(event.t).padStart(6)} ${event.what}${event.detail === null ? '' : ` ${describe(event.detail)}`}`));
    });
    const resources = trace.snapshot.resources;
    panel.appendChild(el('div', HEADING_CSS, `Resources (${resources.length}), start-end`));
    resources.forEach((resource) => {
      const cached = resource.transferSize === 0 && resource.encodedBodySize > 0 ? ' cache' : '';
      const viaWorker = resource.workerStart > 0 ? ' sw' : '';
      const size = resource.encodedBodySize === undefined ? '' : ` ${kb(resource.encodedBodySize)}`;
      panel.appendChild(el('div', EVENT_CSS,
        `${String(resource.startTime).padStart(6)}-${resource.responseEnd} ${resource.name} ${resource.initiatorType}${size}${cached}${viaWorker}`));
    });
    (document.body || html).appendChild(panel);
  }
})();
