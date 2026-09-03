/**
 * The render audit's in-page measurement, as source text.
 *
 * Two callers run it inside a page: audit.mjs through Playwright, and the
 * verify-my151 harness through its Session.evalJson on Blink, WebKit and
 * Gecko. Nothing here touches Node: the function reads the DOM, measures
 * boxes, and returns plain JSON.
 *
 * cfg: { frame?: {w, h}, family?: string, minFont: number,
 *        annotate?: boolean (default true), checkFrame?: boolean (default true) }
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
    return r.width > 0 && r.height > 0;
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
    if (isTextLeaf(el) && hides(el) && el.scrollHeight > el.clientHeight + 1 && el.getAttribute('data-audit-clip') !== 'intended') {
      add('text-cut', 'error', el, \`\${el.scrollHeight - el.clientHeight}px of text hidden below the box\`);
    }
    // Clipped by an ancestor.
    for (let a = el.parentElement; a && a !== document.body && el !== root; a = a.parentElement) {
      if (!hides(a)) continue;
      if (a.getAttribute('data-audit-clip') === 'intended') break;
      const ar = rectOf(a);
      const acs = getComputedStyle(a);
      const box = {
        left: ar.left + parseFloat(acs.borderLeftWidth), top: ar.top + parseFloat(acs.borderTopWidth),
        right: ar.right - parseFloat(acs.borderRightWidth), bottom: ar.bottom - parseFloat(acs.borderBottomWidth),
      };
      const over = [];
      if (r.left < box.left - 1) over.push(\`left \${(box.left - r.left).toFixed(1)}px\`);
      if (r.right > box.right + 1) over.push(\`right \${(r.right - box.right).toFixed(1)}px\`);
      if (r.top < box.top - 1) over.push(\`top \${(box.top - r.top).toFixed(1)}px\`);
      if (r.bottom > box.bottom + 1) over.push(\`bottom \${(r.bottom - box.bottom).toFixed(1)}px\`);
      if (over.length) add('clipped', 'error', el, \`runs past its clipping container (\${pathOf(a)}) on the \${over.join(', ')}\`);
      break; // the nearest clipper decides
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
      if (!el.complete || el.naturalWidth === 0) add('image-broken', 'error', el, 'image did not load');
      else if (!el.closest('[data-audit-scale="intended"]')) {
        const scale = r.width / el.naturalWidth;
        const pixel = /pixelated|crisp-edges/.test(cs.imageRendering);
        if (pixel && Math.abs(scale - Math.round(scale)) > 0.01) {
          add('image-scale', 'error', el, \`pixel art drawn at \${scale.toFixed(2)}× (\${Math.round(r.width)}px from \${el.naturalWidth}px); use an integer scale\`);
        } else if (!pixel && scale > 2.05) {
          add('image-scale', 'warning', el, \`upscaled \${scale.toFixed(2)}× from \${el.naturalWidth}px\`);
        }
      }
    }

    // Text: size, wraps.
    if (isTextLeaf(el)) {
      const size = parseFloat(cs.fontSize);
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

  // Text over text: two text leaves from different branches sharing pixels.
  const texts = visuals.filter(isTextLeaf).map((el) => ({ el, vis: visibleRect(el) })).filter((t) => t.vis);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].el, b = texts[j].el;
      if (a.contains(b) || b.contains(a)) continue;
      const ra = texts[i].vis, rb = texts[j].vis;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) add('text-overlap', 'warning', a, \`overlaps "\${textOf(b)}" by \${ox.toFixed(0)}×\${oy.toFixed(0)}px\`);
    }
  }

  function lineTops(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [];
    for (const b of range.getClientRects()) {
      if (b.width < 1 || b.height < 1) continue;
      if (!tops.some((t) => Math.abs(t - b.top) < 3)) tops.push(b.top);
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

/** Findings that are defects wherever they appear; the other kinds are warnings to read. */
export const HARD_KINDS = ['clipped', 'text-cut', 'outside-frame', 'overflow-frame', 'image-broken', 'image-scale', 'truncated', 'font-fallback'];

/** One stable line per finding, for set comparison across runs. */
export function findingKey(f) {
  return `${f.kind} ${f.path}${f.text ? ` "${f.text}"` : ''}`;
}
