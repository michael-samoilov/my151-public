/**
 * The render audit's in-page measurement, as source text.
 *
 * Two callers run it inside a page: audit.mjs through Playwright, and the
 * verify-my151 harness through its Session.evalJson on Blink, WebKit and
 * Gecko. Nothing here touches Node: the function reads the DOM, measures
 * boxes, and returns plain JSON.
 *
 * cfg: { frame?: {w, h}, family?: string, minFont: number,
 *        annotate?: boolean (default true), checkFrame?: boolean (default true),
 *        offCanvasOk?: boolean (default false; a running app parks panes off-canvas) }
 */
export const IN_PAGE_SOURCE = `function inPage(cfg) {
  const out = [];
  const seen = new Set();
  const add = (kind, severity, el, detail, rect) => {
    const key = kind + '|' + pathOf(el) + '|' + detail;
    if (seen.has(key)) return;
    seen.add(key);
    const r = rect ?? el.getBoundingClientRect();
    out.push({
      kind, severity, path: pathOf(el), text: textOf(el), detail,
      rect: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height },
    });
  };
  function pathOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift('#' + e.id); break; }
      const sib = [...(e.parentElement?.children ?? [])].filter((c) => c.tagName === e.tagName);
      if (sib.length > 1) s += \`:nth-of-type(\${sib.indexOf(e) + 1})\`;
      parts.unshift(s);
    }
    return parts.slice(-6).join(' > ');
  }
  function textOf(el) {
    const t = (el.tagName === 'IMG' ? (el.getAttribute('alt') || el.getAttribute('src')) : el.innerText || '').trim().replace(/\\s+/g, ' ');
    return t.length > 60 ? t.slice(0, 57) + '…' : t;
  }
  const all = [...document.body.querySelectorAll('*')];
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    // A box under 2px is hidden on purpose (sr-only text), not clipped.
    return r.width >= 2 && r.height >= 2;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join('').trim();
  const isTextLeaf = (el) => ownText(el).length > 0 && el.closest('svg') === null;
  /** A box the viewer sees as a shape: a fill, a border, or a shadow. A chip or a badge is one even when its icon sits safely inside. */
  const isPainted = (el) => {
    if (el.closest('svg') || el.hasAttribute('data-render-audit')) return false;
    const cs = getComputedStyle(el);
    const alpha = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); return m ? (m[1].split(',')[3] === undefined ? 1 : parseFloat(m[1].split(',')[3])) : 0; };
    if (alpha(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(cs[\`border\${side}Width\`]) > 0 && cs[\`border\${side}Style\`] !== 'none' && alpha(cs[\`border\${side}Color\`]) > 0);
  };
  const isVisual = (el) => (el.tagName === 'IMG' || (el.tagName === 'svg' && !el.parentElement.closest('svg')) || isTextLeaf(el) || isPainted(el)) && isVisible(el);
  // A scroll region bounds what is visible but hides nothing for good; only hidden/clip cuts content off.
  const bounds = (el) => { const o = getComputedStyle(el); return /hidden|clip|scroll|auto/.test(o.overflowX + o.overflowY); };
  const hides = (el) => { const o = getComputedStyle(el); return /hidden|clip/.test(o.overflowX + o.overflowY); };

  // Frame.
  const root = document.querySelector('x-dc > :not(helmet)') ?? document.body.firstElementChild ?? document.body;
  const frameW = cfg.frame?.w ?? root.getBoundingClientRect().width;
  const frameH = cfg.frame?.h ?? root.getBoundingClientRect().height;
  const de = document.documentElement;
  const checkFrame = cfg.checkFrame !== false;
  if (checkFrame && (de.scrollWidth > frameW + 1 || de.scrollHeight > frameH + 1)) {
    add('overflow-frame', 'error', root, \`page is \${de.scrollWidth}×\${de.scrollHeight}, frame is \${Math.round(frameW)}×\${Math.round(frameH)}\`,
      { left: 0, top: 0, width: de.scrollWidth, height: de.scrollHeight });
  }

  // Fonts.
  if (cfg.family && !document.fonts.check(\`16px "\${cfg.family}"\`)) {
    add('font-fallback', 'error', document.body, \`"\${cfg.family}" did not load; text is drawn in a fallback face\`);
  }

  const visuals = all.filter(isVisual);
  const rectOf = (el) => el.getBoundingClientRect();
  /** The part of an element a viewer can see: its box cut by every clipping ancestor. Null when nothing shows. */
  const visibleRect = (el) => {
    let r = rectOf(el);
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (!bounds(a)) continue;
      const ar = rectOf(a);
      box = { left: Math.max(box.left, ar.left), top: Math.max(box.top, ar.top), right: Math.min(box.right, ar.right), bottom: Math.min(box.bottom, ar.bottom) };
      if (box.right - box.left < 1 || box.bottom - box.top < 1) return null;
    }
    return box;
  };

  for (const el of visuals) {
    const cs = getComputedStyle(el);
    const r = rectOf(el);

    // Truncation by ellipsis.
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      add('truncated', 'error', el, \`\${el.scrollWidth - el.clientWidth}px of the text is cut and replaced by an ellipsis\`);
    }
    // Text cut by a height clip on the element itself.
    if (isTextLeaf(el) && hides(el) && el.scrollHeight > el.clientHeight + 1 && el.getAttribute('data-audit-clip') !== 'intended' && (cs.webkitLineClamp === 'none' || !cs.webkitLineClamp)) {
      add('text-cut', 'error', el, \`\${el.scrollHeight - el.clientHeight}px of text hidden below the box\`);
    }
    // Clipped by an ancestor, judged per axis: overflow-x hidden says nothing
    // about the bottom edge, and a scroll axis owns its overflow (the content
    // scrolls into view). An element wholly outside a clipper and moved there
    // by a transform is an off-canvas pane, not a clip; a running app
    // (cfg.offCanvasOk) parks panes off-canvas by position too.
    let needX = el !== root, needY = el !== root;
    let transformed = false;
    for (let a = el; a && a !== document.body && (needX || needY); a = a.parentElement) {
      if (a !== el) {
        const acs = getComputedStyle(a);
        const ox = acs.overflowX, oy = acs.overflowY;
        if (ox !== 'visible' || oy !== 'visible') {
          const intended = a.getAttribute('data-audit-clip') === 'intended';
          const ar = rectOf(a);
          const box = {
            left: ar.left + parseFloat(acs.borderLeftWidth), top: ar.top + parseFloat(acs.borderTopWidth),
            right: ar.right - parseFloat(acs.borderRightWidth), bottom: ar.bottom - parseFloat(acs.borderBottomWidth),
          };
          const wholly = r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom;
          const offCanvas = wholly && (transformed || cfg.offCanvasOk === true);
          const over = [];
          if (needX && ox !== 'visible') {
            if (/hidden|clip/.test(ox) && !intended && !offCanvas) {
              if (r.left < box.left - 1) over.push(\`left \${(box.left - r.left).toFixed(1)}px\`);
              if (r.right > box.right + 1) over.push(\`right \${(r.right - box.right).toFixed(1)}px\`);
            }
            needX = false;
          }
          if (needY && oy !== 'visible') {
            if (/hidden|clip/.test(oy) && !intended && !offCanvas) {
              if (r.top < box.top - 1) over.push(\`top \${(box.top - r.top).toFixed(1)}px\`);
              if (r.bottom > box.bottom + 1) over.push(\`bottom \${(r.bottom - box.bottom).toFixed(1)}px\`);
            }
            needY = false;
          }
          if (over.length) add('clipped', 'error', el, \`runs past its clipping container (\${pathOf(a)}) on the \${over.join(', ')}\`);
        }
      }
      if (getComputedStyle(a).transform !== 'none') transformed = true;
    }
    // Outside the frame: only the part a viewer can see counts, so content a
    // container clips away on purpose is not reported twice.
    const vis = visibleRect(el);
    if (vis && checkFrame) {
      const fr = { left: 0, top: 0, right: frameW, bottom: frameH };
      const outside = [];
      if (vis.left + scrollX < fr.left - 1) outside.push('left');
      if (vis.right + scrollX > fr.right + 1) outside.push('right');
      if (vis.top + scrollY < fr.top - 1) outside.push('top');
      if (vis.bottom + scrollY > fr.bottom + 1) outside.push('bottom');
      if (outside.length) add('outside-frame', 'error', el, \`extends past the frame's \${outside.join(', ')} edge\`);
    }

    // Images.
    if (el.tagName === 'IMG') {
      // Still loading (a lazy image below the fold) is not broken; a finished load with no pixels is.
      if (el.complete && el.naturalWidth === 0) add('image-broken', 'error', el, 'image did not load');
      else if (el.complete && !el.closest('[data-audit-scale="intended"]')) {
        const scale = r.width / el.naturalWidth;
        const pixel = /pixelated|crisp-edges/.test(cs.imageRendering);
        if (pixel && Math.abs(scale - Math.round(scale)) > 0.01) {
          add('image-scale', 'error', el, \`pixel art drawn at \${scale.toFixed(2)}× (\${Math.round(r.width)}px from \${el.naturalWidth}px); use an integer scale\`);
        } else if (!pixel && scale > 2.05) {
          add('image-scale', 'warning', el, \`upscaled \${scale.toFixed(2)}× from \${el.naturalWidth}px\`);
        }
      }
    }

    // Text: size, wraps, and space the box holds open but no line uses.
    if (isTextLeaf(el)) {
      const size = parseFloat(cs.fontSize);
      /**
       * A box far taller than the words in it, with the slack all on one side.
       *
       * This is what a torn layout looks like from the outside: a heading whose
       * first line was given a sprite's height still reads as text, still sits
       * inside its parent, still overlaps nothing -- and pushes the line under
       * it half a slot away. Nothing else here notices, because every other
       * rule asks whether something is cut or covered, and this is neither.
       *
       * Slack split evenly above and below is vertical centring, which is
       * deliberate everywhere, so only a lopsided box is reported.
       */
      const pad = (side) => parseFloat(cs[\`padding\${side}\`]) + parseFloat(cs[\`border\${side}Width\`]);
      const contentTop = r.top + pad('Top');
      const contentBottom = r.bottom - pad('Bottom');
      const own = ownTextRects(el);
      // A true leaf only. An element that holds child elements as well as text
      // has them filling the space under its own words, which is a stacked
      // label, not a hole.
      if (own.length && el.children.length === 0 && contentBottom > contentTop) {
        const above = Math.min(...own.map((b) => b.top)) - contentTop;
        const below = contentBottom - Math.max(...own.map((b) => b.bottom));
        const slack = above + below;
        if (slack > Math.max(10, size) && Math.min(above, below) < slack * 0.25) {
          add('stretched-box', 'warning', el, \`holds \${slack.toFixed(0)}px of height that no line of its text uses, nearly all \${above > below ? 'above' : 'below'} the words\`);
        }
      }
      if (size < cfg.minFont) add('tiny-text', 'warning', el, \`\${size.toFixed(1)}px is under the \${cfg.minFont}px floor\`);
      const text = ownText(el).replace(/\\s+/g, ' ');
      const lines = lineTops(el);
      if (lines.length >= 3 && text.length <= 30) {
        add('awkward-wrap', 'warning', el, \`\${text.length} characters wrapped onto \${lines.length} lines\`);
      } else if (lines.length >= 2) {
        const orphan = lastLineWord(el, lines);
        if (orphan !== null && orphan.length <= 4 && text.split(' ').length >= 3) {
          add('awkward-wrap', 'warning', el, \`the last line holds only "\${orphan}"\`);
        }
      }
    }
  }

  /**
   * Two things that share pixels when neither was placed to.
   *
   * Text runs, whole SVGs and painted boxes all count; an <img> does not,
   * because a sprite drawn larger than its cell is how this app makes a
   * creature stand in its tile. Nor does anything positioned or transformed:
   * a remove cross over a cell, a sprite over its pokeball, a drag overlay,
   * are all placed on top of something on purpose. What is left is elements
   * in normal flow, which the browser lays out side by side or stacked --
   * so two of those sharing pixels is a box that outgrew its column, which
   * is the badge that reached under its neighbour.
   */
  /**
   * The nearest ancestor that placed this element somewhere, or the body.
   *
   * Two elements are only judged against each other when they share one of
   * these. Inside a common flow root the browser lays things out side by side
   * or stacked, so two of them sharing pixels is a box that outgrew its
   * column -- the badge that reached under its neighbour. Across different
   * roots, something in between was positioned or transformed on purpose: a
   * slot laid over the grid, a cross over a cell, a pane slid into place.
   */
  const rootCache = new WeakMap();
  const flowRoot = (el) => {
    if (rootCache.has(el)) return rootCache.get(el);
    const off = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    let r = document.body;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const placed = cs.transform !== 'none'
        || !(cs.position === 'static'
             || (cs.position === 'relative' && off(cs.left) === 0 && off(cs.top) === 0));
      if (placed || e.getAttribute('data-audit-overlap') === 'intended') { r = e; break; }
    }
    rootCache.set(el, r);
    return r;
  };
  const inFlow = (el) => {
    const cs = getComputedStyle(el);
    const off = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    return cs.transform === 'none'
      && (cs.position === 'static'
          || (cs.position === 'relative' && off(cs.left) === 0 && off(cs.top) === 0))
      && !el.closest('[data-audit-overlap="intended"]');
  };
  const solid = visuals
    .filter((el) => el.tagName !== 'IMG' && (isTextLeaf(el) || isPainted(el) || el.tagName === 'svg') && inFlow(el))
    .map((el) => ({ el, vis: visibleRect(el) }))
    .filter((t) => t.vis)
    .sort((p, q) => p.vis.top - q.vis.top);
  // A sweep by top edge: once a later element starts below this one's bottom,
  // nothing after it can overlap either, so the scan stops. Without it a page
  // of 151 tiles is a quarter of a million rect comparisons.
  for (let i = 0; i < solid.length; i++) {
    const ra = solid[i].vis;
    for (let j = i + 1; j < solid.length; j++) {
      const rb = solid[j].vis;
      if (rb.top >= ra.bottom - 2) break;
      const a = solid[i].el, b = solid[j].el;
      if (a.contains(b) || b.contains(a)) continue;
      if (flowRoot(a) !== flowRoot(b)) continue;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      // Half a pixel, not two: the badge that started this rule reached under
      // its neighbour by 1.4px, which is a visible seam where two solid pills
      // meet and was under a two-pixel floor. Boxes laid out side by side
      // should share no pixels at all; the half-pixel allowance is for
      // fractional layout rounding, nothing more.
      if (ox > 0.5 && oy > 0.5) {
        const what = textOf(b) || pathOf(b);
        add('overlap', 'warning', a, \`overlaps "\${what}" by \${ox.toFixed(1)}×\${oy.toFixed(1)}px, and neither is positioned\`);
      }
    }
  }

  /** The boxes the element's own text nodes occupy, children excluded. */
  function ownTextRects(el) {
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const b of range.getClientRects()) if (b.width > 0.5 && b.height > 0.5) out.push(b);
    }
    return out;
  }

  /**
   * The tops of the lines the element's OWN text occupies.
   *
   * Ranging over the whole element counts its children's boxes as lines, so a
   * label group stacking three spans read as one run wrapped three times. Only
   * the element's own text nodes are its own run.
   */
  function lineTops(el) {
    const tops = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const b of range.getClientRects()) {
        if (b.width < 1 || b.height < 1) continue;
        if (!tops.some((t) => Math.abs(t - b.top) < 3)) tops.push(b.top);
      }
    }
    return tops.sort((p, q) => p - q);
  }
  /** The single word on the last line, or null when the last line holds more than one. */
  function lastLineWord(el, tops) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3);
    if (nodes.length !== 1) return null;
    const node = nodes[0];
    const s = node.textContent;
    const lastTop = tops[tops.length - 1];
    const words = [];
    const re = /\\S+/g;
    let m;
    while ((m = re.exec(s))) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const b = range.getBoundingClientRect();
      if (Math.abs(b.top - lastTop) < 3) words.push(m[0]);
    }
    return words.length === 1 ? words[0] : null;
  }

  // Draw the evidence.
  if (cfg.annotate !== false) out.forEach((f, i) => {
    const box = document.createElement('div');
    const colour = f.severity === 'error' ? '#e11d48' : '#f59e0b';
    box.setAttribute('data-render-audit', '');
    box.style.cssText = \`position:absolute;left:\${f.rect.x - 2}px;top:\${f.rect.y - 2}px;width:\${f.rect.w + 4}px;height:\${f.rect.h + 4}px;outline:2px solid \${colour};box-sizing:border-box;pointer-events:none;z-index:2147483647;\`;
    const tag = document.createElement('span');
    tag.textContent = String(i + 1);
    tag.style.cssText = \`position:absolute;left:-2px;top:-16px;background:\${colour};color:#fff;font:700 11px/14px system-ui,sans-serif;padding:0 4px;border-radius:3px;\`;
    box.appendChild(tag);
    document.body.appendChild(box);
  });
  return { frame: { w: frameW, h: frameH }, findings: out };
}
`;

/** A function body: runs the audit with cfg and returns { frame, findings }. */
export function auditBody(cfg) {
  return `${IN_PAGE_SOURCE}\nreturn inPage(${JSON.stringify(cfg)});`;
}

/** Findings that are defects on a static page or an export; the other kinds are warnings to read. */
export const HARD_KINDS = ['clipped', 'text-cut', 'outside-frame', 'overflow-frame', 'image-broken', 'image-scale', 'truncated', 'font-fallback', 'overlap'];

/**
 * Findings that are defects in a running app. On screen, pixel art is sized
 * by CSS and an ellipsis is a designed truncation, so those two stay
 * warnings there; a clipped box, cut text, or a broken image is a defect
 * anywhere.
 */
export const APP_HARD_KINDS = ['clipped', 'text-cut', 'image-broken', 'overlap'];

/** One stable line per finding, for set comparison across runs. */
export function findingKey(f) {
  return `${f.kind} ${f.path}${f.text ? ` "${f.text}"` : ''}`;
}
