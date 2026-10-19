/**
 * Own picture resources independently of live media queries after parsing.
 * This self-contained function also runs inline before the app downloads.
 */
export function installHomeArtwork(poses) {
  if (window.p151HomeArtwork) {
    return window.p151HomeArtwork.refresh();
  }
  const root = document.documentElement;
  const keys = ['dex', 'league', 'favorites'];
  const media = matchMedia('(max-width:480px) and (hover:none) and (pointer:coarse) and (any-hover:none) and (scripting:enabled)');
  const snapshots = new Map();
  const decoding = new WeakMap();
  let generation = 0;
  let committed = target();
  let slot = 0;
  let revealed = false;
  let queued = false;
  let currentNodes = [];
  let currentReadiness = Promise.resolve();
  let readinessGeneration = 0;
  let readinessTimer;
  let finishReadiness = () => {};
  const empty = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function target() {
    if (!poses.length || !media.matches) return { mode: 'standard', width: 0 };
    const width = innerWidth;
    const pose = poses.reduce((best, next) => Math.abs(next.viewportWidth - width) < Math.abs(best.viewportWidth - width) ? next : best);
    return { mode: 'mobile', width: pose.viewportWidth };
  }
  function same(a, b) { return a.mode === b.mode && a.width === b.width; }
  function picture(id) { return document.querySelector('[data-home-picture="' + id + '"]'); }
  function snapshot(id) {
    const node = picture(id);
    if (node) {
      const img = node.querySelector('img');
      const data = { src: img.getAttribute('src'), sources: Array.from(node.querySelectorAll('source')).map(source => ({
        srcSet: source.getAttribute('srcset'),
        ...(source.hasAttribute('media') ? { media: source.getAttribute('media') } : {}),
        ...(source.hasAttribute('type') ? { type: source.getAttribute('type') } : {}),
      })) };
      snapshots.set(id, data);
      return data;
    }
    return snapshots.get(id);
  }
  function remember(node) { snapshot(node.getAttribute('data-home-picture')); }
  function active() {
    return Array.from(document.querySelectorAll(committed.mode === 'mobile'
      ? '[data-card-scene][data-scene-slot="' + slot + '"]'
      : '[data-artwork] img[alt]:not([alt=""])'));
  }
  function placement(next) {
    if (next.mode !== 'mobile') return;
    const pose = poses.find(pose => pose.viewportWidth === next.width);
    pose.cards.forEach(card => Object.entries(card.placement).forEach(([name, value]) => {
      root.style.setProperty('--scene-' + card.key + '-' + name, (100 * value / card.panel.width) + 'cqw');
    }));
  }
  function expose(next, nextSlot) {
    placement(next);
    root.dataset.homeScene = next.mode;
    root.dataset.homeSlot = String(nextSlot);
    committed = next;
    slot = nextSlot;
  }
  // Freeze the parser's selected media before any viewport change can replace
  // an outgoing image. Keep native AVIF/WebP selection for the first request.
  function freeze() {
    document.querySelectorAll('[data-home-picture] source').forEach(source => {
      const query = source.getAttribute('media');
      source.media = !query || matchMedia(query).matches ? 'all' : 'not all';
    });
    document.querySelectorAll('[data-home-picture]').forEach(remember);
  }
  function decode(img, deadline = 8000) {
    const url = img.currentSrc || img.src;
    const previous = decoding.get(img);
    if (previous && previous.url === url) return previous.promise;
    const promise = new Promise((resolve, reject) => {
      let done = false;
      const timer = deadline ? setTimeout(() => finish(new Error('Artwork did not load')), deadline) : undefined;
      function finish(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', failed);
        if (error) reject(error); else resolve();
      }
      function failed() { finish(new Error('Artwork is unavailable')); }
      function loaded() {
        if (!img.naturalWidth || img.currentSrc === empty || img.src === empty && !img.currentSrc) { failed(); return; }
        img.decode().then(() => finish(), failed);
      }
      img.addEventListener('load', loaded);
      img.addEventListener('error', failed);
      if (img.complete && img.currentSrc) loaded();
    });
    decoding.set(img, { url, promise });
    return promise;
  }
  function reveal() {
    if (keys.every(key => root.classList.contains('p151-hub-' + key + '-ready') || root.classList.contains('p151-hub-' + key + '-fallback'))) {
      revealed = true;
      root.classList.remove('p151-hub-images-pending');
      finishReadiness();
      request();
    }
  }
  function initial() {
    const nodes = active();
    if (!nodes.length) return Promise.resolve();
    currentNodes = nodes;
    const epoch = ++readinessGeneration;
    currentReadiness = new Promise(resolve => { finishReadiness = resolve; });
    keys.forEach(key => root.classList.remove('p151-hub-' + key + '-ready', 'p151-hub-' + key + '-fallback'));
    clearTimeout(readinessTimer);
    readinessTimer = setTimeout(() => {
      if (epoch !== readinessGeneration) return;
      keys.forEach(key => {
        if (!root.classList.contains('p151-hub-' + key + '-ready')) root.classList.add('p151-hub-' + key + '-fallback');
      });
      reveal();
    }, 8000);
    const tasks = keys.map(key => {
      const images = nodes.filter(img => img.closest('[data-hub-card]')?.getAttribute('data-hub-card') === key);
      return Promise.all(images.map(img => decode(img, 0))).then(() => {
        if (epoch !== readinessGeneration || !images.length || !images.every(img => img.isConnected && currentNodes.includes(img))) return;
        root.classList.remove('p151-hub-' + key + '-fallback');
        root.classList.add('p151-hub-' + key + '-ready');
        reveal();
      }, () => {
        if (epoch !== readinessGeneration || !images.every(img => img.isConnected && currentNodes.includes(img))) return;
        root.classList.add('p151-hub-' + key + '-fallback');
        reveal();
      });
    });
    void Promise.all(tasks).then(() => { if (epoch === readinessGeneration) clearTimeout(readinessTimer); });
    return currentReadiness;
  }
  function resource(node, url) {
    const img = node.querySelector('img');
    node.querySelectorAll('source').forEach(source => { source.media = 'not all'; });
    img.src = url;
    decoding.delete(img);
    remember(node);
    return img;
  }
  async function stage(next, nextSlot, token) {
    if (next.mode === 'standard') {
      const nodes = Array.from(document.querySelectorAll('[data-artwork] [data-home-picture]'));
      nodes.forEach(node => {
        node.querySelectorAll('source').forEach(source => { source.media = source.type === 'image/avif' ? 'all' : 'not all'; });
        remember(node);
      });
      await Promise.all(nodes.map(node => { const img = node.querySelector('img'); decoding.delete(img); return decode(img); }));
    } else {
      const pose = poses.find(pose => pose.viewportWidth === next.width);
      await Promise.all(pose.cards.map(async card => {
        const node = picture(card.key + '-mobile-' + nextSlot);
        if (!node) throw new Error('Artwork layer is not mounted');
        try { await decode(resource(node, '/assets/home-mobile/' + card.avif.file)); }
        catch {
          if (token !== generation || root.classList.contains('p151-hub-hydrating')) throw new Error('Artwork request was superseded');
          await decode(resource(node, '/assets/home-mobile/' + card.webp.file));
        }
      }));
    }
  }
  async function change() {
    queued = false;
    const next = target();
    const token = ++generation;
    if (!revealed || same(next, committed) || root.classList.contains('p151-hub-hydrating')) return;
    const nextSlot = next.mode === 'mobile' ? 1 - slot : slot;
    try {
      await stage(next, nextSlot, token);
      if (token !== generation || !same(next, target())) return;
      // React reads a resource snapshot on its first render. Avoid committing
      // a different snapshot while those existing nodes are being hydrated.
      if (root.classList.contains('p151-hub-hydrating')) return;
      expose(next, nextSlot);
      keys.forEach(key => {
        root.classList.remove('p151-hub-' + key + '-fallback');
        root.classList.add('p151-hub-' + key + '-ready');
      });
      currentNodes = active();
    } catch {
      // A failed replacement leaves the committed, decoded bank visible.
    }
  }
  function request() {
    generation++;
    if (!queued) { queued = true; requestAnimationFrame(change); }
  }
  function refresh(attached = true) {
    if (attached) root.classList.remove('p151-hub-hydrating');
    const nodes = active();
    if (nodes.length && (nodes.length !== currentNodes.length || nodes.some((node, index) => node !== currentNodes[index]))) {
      generation++;
      const ready = initial();
      request();
      return ready;
    }
    request();
    return currentReadiness;
  }
  window.p151HomeArtwork = { snapshot, refresh };
  freeze();
  expose(committed, slot);
  void initial();
  addEventListener('resize', request);
  media.addEventListener('change', request);
  const observer = new MutationObserver(() => { void refresh(false); });
  const host = document.getElementById('root');
  if (host) observer.observe(host, { childList: true, subtree: true });
  return Promise.resolve();
}
