// Generates the nine .dc.html artboards for the home-page design canvas.
//
// Nine hand-written copies of the same four cards drift apart, so the copy,
// the palette and the card anatomy live here once and the artboards are
// emitted from them. Run it from the repo root:
//
//   node docs/future-tools/home-page/build-artboards.mjs
//
// Palette and type ramp are lifted from src/index.css and
// src/components/layout/Header.tsx so the mockups match the live app.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'canvas');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- tokens

const C = {
  bg: '#f7f7f8',
  card: '#ffffff',
  fg: '#0a0a0a',
  mut: '#737373',
  bd: '#e5e5e5',
  pri: '#dc2626',
  sec: '#f5f5f5',
  sub: '#525252',
};

const FONT = "'Inter', 'Inter Variable', system-ui, -apple-system, sans-serif";

// ---------------------------------------------------------------- content

// One <h2> per card, each an exact-match phrase for the slug beneath it.
// Blurbs stay inside what the app does today or has a settled spec for:
// section template (src/data/slot-template.ts), export image
// (src/lib/exportImage.ts), league card model
// (docs/future-tools/league-builder/DECISIONS.md).
const TOOLS = [
  {
    key: 'dex',
    h2: 'Custom Pokédex Builder',
    slug: '/custom-pokedex-builder',
    long: 'Pick your 151 from all 1,025 Pokémon into a region template of starters, routes and biomes. Compare your type coverage to the National Dex, then export the image.',
    short: 'Pick your 151 from all 1,025 Pokémon, into starters, routes and biomes.',
    cta: 'Open the builder',
    status: 'live',
    shot: 'tool-dex.webp',
    shotB: 'tool-dex-b.webp',
    shotC: 'tool-dex-c.webp',
  },
  {
    key: 'league',
    h2: 'Pokémon League Builder',
    slug: '/pokemon-league-builder',
    long: 'Design a gym leader, Elite Four and champion roster. Eight badges, tiered teams, and level thresholds that evolve your picks for you.',
    short: 'Gym leaders, an Elite Four and a champion. Eight badges, tiered teams.',
    cta: 'See the preview',
    status: 'build',
    shot: 'tool-league.webp',
    shotB: 'tool-league-b.webp',
    shotC: 'tool-league-c.webp',
  },
  {
    key: 'fav',
    h2: 'Favorite Pokémon Picker',
    slug: '/favorite-pokemon-picker',
    long: 'Lock in one favorite for every type and every generation, then use that shortlist as a filter in the other tools.',
    short: 'One favorite per type, per generation — and a filter for the other tools.',
    cta: 'Get told when it lands',
    status: 'planned',
    shot: 'tool-fav.webp',
    shotB: 'tool-fav-b.webp',
    shotC: 'tool-fav-c.webp',
  },
  {
    key: 'next',
    h2: 'What should we build next?',
    slug: '#suggest',
    long: 'Team planner, box tracker, nuzlocke tracker, something nobody has made yet — tell us which Pokémon tool you want and it goes on the list.',
    short: 'Team planner? Box tracker? Nuzlocke? Tell us what to build next.',
    cta: 'Send an idea',
    status: 'open',
    shot: null,
  },
];

const HERO = {
  eyebrow: 'FREE POKÉMON TOOLS · NO SIGN-UP',
  h1: 'Make a custom Pokédex, Gym Leader, and more',
  p: 'my151 is a set of free Pokémon tools and templates. Build a custom region &amp; Pokédex by choosing your favorites from each generation, make custom gym leader trainer cards, &amp; pick your favorite Pokémon per type per generation.',
  note: 'No account. Your picks save in this browser and can export as a shareable image.',
  // Used where the whole page has to fit one viewport and the long
  // paragraph would push the cards off the bottom.
  pShort:
    'Free tools to build a custom Pokédex from all 1,025 Pokémon, lay out a region of routes and biomes, and design a gym leader league.',
};

// Poster-card copy. At the reference's card proportions the text block is the
// binding constraint, so the blurb is one line and there is a short display
// title available for the permutation that wants the reference's exact balance.
const POSTER_BLURB = {
  dex: 'Your 151 from all 1,025.',
  league: 'Gym leaders and an Elite Four.',
  fav: 'One favorite per type.',
  next: 'Tell us what to build next.',
};

const POSTER_SHORT_TITLE = {
  dex: 'Dex Builder',
  league: 'Gym Leader Builder',
  fav: 'Favorite Picker',
  next: 'What next?',
};

const STATUS = {
  live: { label: 'Live now', bg: C.pri, fg: '#ffffff', bd: C.pri },
  build: { label: 'In build', bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
  planned: { label: 'Planned', bg: C.sec, fg: C.mut, bd: C.bd },
  open: { label: 'Your call', bg: C.sec, fg: C.mut, bd: C.bd },
};

// ---------------------------------------------------------------- pieces

const arrow = (size, color) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;

const globe = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${C.mut}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z"></path></svg>`;

const ball = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="flex-shrink: 0;"><circle cx="16" cy="16" r="15" fill="#fafafa" stroke="${C.pri}" stroke-width="1.5"></circle><path d="M2 16 A14 14 0 0 1 30 16" fill="${C.pri}"></path><line x1="2" y1="16" x2="30" y2="16" stroke="#fafafa" stroke-width="2"></line><circle cx="16" cy="16" r="4.5" fill="#fafafa" stroke="${C.pri}" stroke-width="2"></circle></svg>`;

const spark = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${C.mut}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M12 8v6"></path><path d="M9 11h6"></path></svg>`;

function chip(status, scale = 1) {
  const s = STATUS[status];
  return `<span style="display: inline-flex; align-items: center; flex-shrink: 0; padding: ${
    2 * scale
  }px ${8 * scale}px; border-radius: 999px; border: 1px solid ${s.bd}; background: ${
    s.bg
  }; color: ${s.fg}; font-size: ${Math.round(
    10 * scale,
  )}px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; box-shadow: 0 1px 4px rgba(10, 10, 10, 0.18);">${s.label}</span>`;
}

/** The suggestion box that stands in for the fourth tool's screenshot. */
function suggestPanel({ height, radius = 12, pad = 16, badge = '' }) {
  const ctl = Math.max(28, Math.round(height * 0.14));
  return `<div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(
    pad * 0.5,
  )}px; height: ${height}px; padding: ${pad}px; box-sizing: border-box; border: 1.5px dashed ${
    C.bd
  }; border-radius: ${radius}px; background: #fafafa;">
      ${badge}
      ${spark(Math.max(20, Math.round(height * 0.16)))}
      <div style="display: flex; align-items: center; gap: 6px; width: 100%; max-width: 260px;">
        <span style="flex-grow: 1; height: ${ctl}px; border: 1px solid ${
          C.bd
        }; border-radius: 8px; background: ${C.card};"></span>
        <span style="display: flex; align-items: center; justify-content: center; height: ${ctl}px; padding: 0 10px; border-radius: 8px; background: ${
          C.pri
        }; color: #ffffff; font-size: 11px; font-weight: 700;">Send</span>
      </div>
    </div>`;
}

/**
 * The screenshot, with the status chip pinned inside its bottom-right corner.
 * The chip sits on the shot rather than beside the <h2> so the heading keeps
 * the card's full width — at 390px two-up that is the difference between a
 * two-line and a three-line title.
 */
function shotFrame({ tool, height, pop, tilt = 0, fit = 'cover', radius = 12, chipScale = 1 }) {
  const badge = `<span style="position: absolute; bottom: 10px; right: 10px; z-index: 2;">${chip(
    tool.status,
    chipScale,
  )}</span>`;
  if (!tool.shot) {
    return `<div style="margin-top: -${pop}px;">${suggestPanel({
      height,
      radius,
      badge,
    })}</div>`;
  }
  const rotate = tilt ? ` transform: rotate(${tilt}deg);` : '';
  return `<div style="position: relative; margin-top: -${pop}px; height: ${height}px; border-radius: ${radius}px; overflow: hidden; background: ${
    C.bg
  }; border: 1px solid ${
    C.bd
  }; box-shadow: 0 10px 24px rgba(10, 10, 10, 0.14), 0 2px 6px rgba(10, 10, 10, 0.08);${rotate}">
      ${badge}
      <img src="${tool.shot}" alt="${tool.h2} screenshot" style="display: block; width: 100%; height: 100%; object-fit: ${fit}; object-position: top center;">
    </div>`;
}

/**
 * One tool card. The screenshot carries a negative margin-top so it breaks the
 * card's top edge; the grid reserves that space with its own padding-top.
 */
function card({ tool, shotH, pop, tilt = 0, titleSize, blurbSize, blurb, pad, gap, fit }) {
  return `<a href="${tool.slug}" style="display: flex; flex-direction: column; gap: ${gap}px; padding: ${pad}px; margin-top: ${pop}px; background: ${
    C.card
  }; border: 1px solid ${
    C.bd
  }; border-radius: 14px; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.04); color: ${
    C.fg
  }; text-decoration: none;">
  ${shotFrame({
    tool,
    height: shotH,
    pop,
    tilt,
    fit,
    chipScale: titleSize >= 20 ? 1.2 : 1,
  })}
  <h2 style="margin: 0; font-size: ${titleSize}px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; color: ${
    C.fg
  };">${tool.h2}</h2>
  <p style="margin: 0; font-size: ${blurbSize}px; line-height: 1.45; color: ${
    C.mut
  }; text-wrap: pretty;">${blurb}</p>
  <span style="display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 2px; font-size: ${blurbSize}px; font-weight: 600; color: ${
    C.pri
  };">${tool.cta}${arrow(Math.round(blurbSize * 1.05), C.pri)}</span>
</a>`;
}

function header({ width, links }) {
  const nav = links
    ? `<nav style="display: flex; align-items: center; gap: 4px;">
      ${TOOLS.slice(0, 3)
        .map(
          (t, i) =>
            `<a href="${t.slug}" style="padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${
              i === 0 ? C.fg : C.mut
            }; text-decoration: none;">${
              ['Pokédex builder', 'League builder', 'Favorites'][i]
            }</a>`,
        )
        .join('\n      ')}
      <span style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">${globe(
        18,
      )}</span>
    </nav>`
    : `<span style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">${globe(
        20,
      )}</span>`;
  return `<header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: ${
    width < 500 ? '4px 12px' : '8px 24px'
  }; background: ${C.card}; border-bottom: 1px solid ${C.bd};">
    <span style="font-size: ${
      width < 500 ? 22 : 26
    }px; font-weight: 800; letter-spacing: -0.025em;"><span style="color: ${
      C.pri
    };">my151</span><span style="color: ${C.fg};">.app</span></span>
    ${nav}
  </header>`;
}

function hero({ align, h1Size, pSize, maxW, pad, showNote = true }) {
  const isCentre = align === 'center';
  return `<section style="display: flex; flex-direction: column; align-items: ${
    isCentre ? 'center' : 'flex-start'
  }; gap: 12px; padding: ${pad}; text-align: ${isCentre ? 'center' : 'left'};">
    <span style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: ${
      C.mut
    };">${ball(14)}${HERO.eyebrow}</span>
    <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; color: ${
      C.fg
    }; text-wrap: balance;">${HERO.h1}</h1>
    <p style="margin: 0; max-width: ${maxW}px; font-size: ${pSize}px; line-height: 1.55; color: ${
      C.sub
    }; text-wrap: pretty;">${HERO.p}</p>
    ${
      showNote
        ? `<p style="margin: 0; max-width: ${maxW}px; font-size: ${
            pSize - 2
          }px; line-height: 1.5; color: ${C.mut};">${HERO.note}</p>`
        : ''
    }
  </section>`;
}

function foot(pad) {
  return `<footer style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: ${pad}; border-top: 1px solid ${
    C.bd
  }; font-size: 12px; color: ${C.mut};">
    ${TOOLS.map(
      (t) =>
        `<a href="${t.slug}" style="color: ${C.mut}; text-decoration: none;">${t.h2}</a>`,
    ).join('<span style="color: #d4d4d4;">·</span>\n    ')}
  </footer>`;
}

function page({ width, minHeight, body }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&amp;display=swap">
  <style>
    body { margin: 0; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
    a { color: ${C.pri}; text-decoration: none; }
    a:hover { color: #b91c1c; }
    h1, h2 { text-wrap: balance; }
  </style>
</helmet>
<div style="width: ${width}px; min-height: ${minHeight}px; box-sizing: border-box; background: ${C.bg}; color: ${C.fg}; display: flex; flex-direction: column;">
${body}
</div>
</x-dc>
</body>
</html>
`;
}

// ---------------------------------------------------------- A · Sketch grid

/** Two-by-two everywhere, screenshots tilted — the attached sketch, literally. */
function sketch({ width, minHeight, cols, gridPad, gap, shotH, pop, titleSize, blurbSize, blurb, pad, h1Size, pSize, maxW, links, heroPad }) {
  const cards = TOOLS.map((t, i) =>
    card({
      tool: t,
      shotH,
      pop,
      tilt: i % 2 === 0 ? -1.6 : 1.6,
      titleSize,
      blurbSize,
      blurb: t[blurb],
      pad,
      gap: Math.round(pad * 0.55),
      fit: 'cover',
    }),
  ).join('\n');
  return page({
    width,
    minHeight,
    body: `${header({ width, links })}
${hero({ align: 'center', h1Size, pSize, maxW, pad: heroPad })}
<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px; padding: ${gridPad}; box-sizing: border-box;">
${cards}
</div>
<div style="flex-grow: 1;"></div>
${foot(width < 500 ? '20px 16px' : '24px 32px')}`,
  });
}

// ------------------------------------------------------------ B · Marquee

/** Left-aligned editorial hero, straight screenshots, four abreast on desktop. */
function marquee({ width, minHeight, cols, gridPad, gap, shotH, pop, titleSize, blurbSize, blurb, pad, h1Size, pSize, maxW, links, heroPad, fit }) {
  const cards = TOOLS.map((t) =>
    card({
      tool: t,
      shotH,
      pop,
      titleSize,
      blurbSize,
      blurb: t[blurb],
      pad,
      gap: Math.round(pad * 0.5),
      fit,
    }),
  ).join('\n');
  return page({
    width,
    minHeight,
    body: `${header({ width, links })}
<div style="display: flex; flex-direction: column; gap: 4px; padding: ${heroPad};">
${hero({ align: 'left', h1Size, pSize, maxW, pad: '0' })}
</div>
<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px; padding: ${gridPad}; box-sizing: border-box;">
${cards}
</div>
<div style="flex-grow: 1;"></div>
${foot(width < 500 ? '20px 16px' : '24px 32px')}`,
  });
}

// ----------------------------------------------------------- C · Featured

/** The one shipped tool leads; the other three sit in a supporting row. */
function featured({ width, minHeight, split, heroPad, h1Size, pSize, maxW, featShotH, featPop, restCols, restGap, restShotH, restPop, gridPad, links }) {
  const [dex, ...rest] = TOOLS;

  const featCopy = `<div style="display: flex; flex-direction: column; justify-content: center; gap: 10px; flex-grow: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <h2 style="margin: 0; font-size: ${
          split ? 28 : 22
        }px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.15; color: ${
          C.fg
        };">${dex.h2}</h2>
        ${chip('live', 1.2)}
      </div>
      <p style="margin: 0; font-size: ${
        split ? 16 : 14
      }px; line-height: 1.5; color: ${C.mut}; text-wrap: pretty;">${dex.long}</p>
      <span style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; align-self: flex-start; min-height: 44px; padding: 0 20px; border-radius: 10px; background: ${
        C.pri
      }; color: #ffffff; font-size: 15px; font-weight: 700;">${dex.cta}${arrow(
        18,
        '#ffffff',
      )}</span>
    </div>`;

  const featShot = `<div style="position: relative; width: ${
    split ? '420px' : '100%'
  }; flex-shrink: 0; align-self: flex-start; margin-top: -${featPop}px; height: ${featShotH}px; border-radius: 14px; overflow: hidden; background: ${
    C.bg
  }; border: 1px solid ${
    C.bd
  }; box-shadow: 0 16px 36px rgba(10, 10, 10, 0.16), 0 3px 8px rgba(10, 10, 10, 0.08);">
      <img src="${dex.shot}" alt="${
        dex.h2
      } screenshot" style="display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center;">
    </div>`;

  const feature = `<a href="${dex.slug}" style="display: flex; flex-direction: ${
    split ? 'row' : 'column'
  }; align-items: stretch; gap: ${split ? 32 : 16}px; margin-top: ${featPop}px; padding: ${
    split ? 28 : 18
  }px; background: ${C.card}; border: 1px solid ${
    C.bd
  }; border-radius: 18px; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.04); color: ${
    C.fg
  }; text-decoration: none;">
    ${featShot}
    ${featCopy}
  </a>`;

  const restCards = rest
    .map((t) =>
      card({
        tool: t,
        shotH: restShotH,
        pop: restPop,
        titleSize: restCols === 3 ? 17 : 15,
        blurbSize: restCols === 3 ? 13 : 12,
        blurb: t.short,
        pad: 14,
        gap: 8,
        fit: 'cover',
      }),
    )
    .join('\n');

  return page({
    width,
    minHeight,
    body: `${header({ width, links })}
${hero({ align: 'left', h1Size, pSize, maxW, pad: heroPad, showNote: false })}
<div style="padding: ${gridPad}; box-sizing: border-box;">
${feature}
</div>
<div style="display: grid; grid-template-columns: repeat(${restCols}, minmax(0, 1fr)); gap: ${restGap}px; padding: ${gridPad}; margin-top: 28px; box-sizing: border-box;">
${restCards}
</div>
<div style="flex-grow: 1;"></div>
${foot(width < 500 ? '20px 16px' : '24px 32px')}`,
  });
}

// ------------------------------------------------------- D · Poster cards

/** Red-card palette. The copy sits on #dc2626, so it needs its own ramp. */
const R = {
  card: C.pri,
  fg: '#ffffff',
  sub: 'rgba(255, 255, 255, 0.86)',
};

/**
 * Tallest source aspect (width / height) across the screenshots. A phone is
 * sized by width alone and takes its height from the image, so this is the
 * worst case when checking that a phone outruns the card's bottom edge.
 */
const SHOT_ASPECT = 340 / 560;

/** The stand-in artwork for the fourth card: an empty phone with the form on it. */
function suggestPhone({ phoneW }) {
  // Everything scales off the phone's width, so the form reads the same at 116px
  // as at 224px instead of swamping the small one.
  const ctl = Math.round(phoneW * 0.17);
  const rad = Math.round(phoneW * 0.05);
  return `<div style="display: flex; flex-direction: column; align-items: center; gap: ${Math.round(
    phoneW * 0.08,
  )}px; width: 100%; aspect-ratio: ${
    340 / 560
  }; padding: 11% 8% 0; box-sizing: border-box; background: #fafafa;">
        ${spark(Math.round(phoneW * 0.17))}
        <div style="display: flex; align-items: center; gap: ${Math.round(
          phoneW * 0.035,
        )}px; width: 100%;">
          <span style="flex-grow: 1; height: ${ctl}px; border: 1px solid ${
            C.bd
          }; border-radius: ${rad}px; background: ${C.card};"></span>
          <span style="display: flex; align-items: center; justify-content: center; height: ${ctl}px; padding: 0 ${Math.round(
            phoneW * 0.07,
          )}px; border-radius: ${rad}px; background: ${
            C.pri
          }; color: #ffffff; font-size: ${Math.round(
            phoneW * 0.085,
          )}px; font-weight: 700;">Send</span>
        </div>
      </div>`;
}

/**
 * One phone: a whole mobile viewport screenshot, sized by WIDTH only.
 *
 * No height and no object-fit, so the image keeps its own proportions and
 * nothing is cropped or blown up — the right edge and both top corners stay
 * visible. It runs off the bottom of its clipping box instead, and the gradient
 * hides that cut.
 */
function phone({ src, alt, w, x, y, tilt, radius }) {
  const body = src
    ? `<img src="${src}" alt="${alt}" style="display: block; width: 100%;">`
    : alt;
  return `<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; transform: rotate(${tilt}deg); transform-origin: 0 0; border-radius: ${radius}px; overflow: hidden; background: ${
    C.card
  }; border: 1px solid #d4d4d4; box-shadow: 0 14px 30px rgba(10, 10, 10, 0.24), 0 3px 8px rgba(10, 10, 10, 0.12);">
      ${body}
    </div>`;
}

/**
 * A poster card: a red tile with a fan of phone screenshots laid across it.
 *
 * - The phones OVERHANG the card's top and left. Nothing clips them there.
 * - They run off the card's BOTTOM, the only edge that cuts them.
 * - The gradient that carries the copy is a layer on the CARD, so it stops at
 *   the card's outline, rounded corners included. Below it, the sliver of
 *   artwork still hanging off the left stays unscrimmed — which is what the
 *   reference does too.
 */
function posterCard({ tool, tilts, offsets, phoneW, phoneTop, dropStep, cardW, popTop, popLeft, radius, tone, copyBand, fade, titleSize, blurbSize, pad, shortTitle }) {
  const onRed = tone === 'red';
  const ink = onRed ? R.fg : C.fg;
  const inkSub = onRed ? R.sub : C.mut;
  const wash = onRed ? '220, 38, 38' : '255, 255, 255';
  const phoneRadius = Math.round(phoneW * 0.09);
  const shots = [tool.shotC, tool.shotB, tool.shot];

  // Back to front, so the front phone paints over the ones behind it. The back
  // ones sit LOWER, as in the reference, so index 0 takes the largest drop.
  const fan = tilts
    .map((tilt, i) =>
      phone({
        src: tool.shot ? shots[shots.length - tilts.length + i] : null,
        alt: tool.shot ? `${tool.h2} screenshot` : suggestPhone({ phoneW }),
        w: phoneW,
        x: offsets[i],
        y: phoneTop + (tilts.length - 1 - i) * dropStep,
        tilt,
        radius: phoneRadius,
      }),
    )
    .join('\n    ');

  return `<a href="${tool.slug}" style="position: relative; display: block; height: 100%; border-radius: ${radius}px; background: ${
    onRed ? R.card : C.card
  }; border: 1px solid ${
    onRed ? R.card : C.bd
  }; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.06); text-decoration: none;">
  <div style="position: absolute; top: -${popTop}px; left: -${popLeft}px; right: 0; bottom: 0; overflow: hidden;">
    ${fan}
  </div>
  <div style="position: absolute; left: 0; right: 0; bottom: 0; height: ${
    copyBand + fade
  }px; border-radius: 0 0 ${radius - 1}px ${
    radius - 1
  }px; background: linear-gradient(to top, rgb(${wash}) 0, rgb(${wash}) ${Math.round(
    copyBand * 0.55,
  )}px, rgba(${wash}, 0.92) ${copyBand}px, rgba(${wash}, 0) ${copyBand + fade}px);"></div>
  <div style="position: absolute; left: ${pad}px; right: ${pad}px; bottom: ${pad}px; display: flex; flex-direction: column; gap: 3px;">
    <h2 style="margin: 0; font-size: ${titleSize}px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; color: ${ink};">${
      shortTitle ? POSTER_SHORT_TITLE[tool.key] : tool.h2
    }</h2>
    <p style="margin: 0; font-size: ${blurbSize}px; line-height: 1.35; color: ${inkSub}; text-wrap: pretty;">${
      POSTER_BLURB[tool.key]
    }</p>
  </div>
</a>`;
}

/**
 * One-viewport page: a fixed-height flex column whose card grid sits below the
 * hero. Row heights are fixed, not `1fr`, so the card height the checks below
 * reason about is the height that actually renders; the hero takes the slack.
 */
function poster({ width, height, cols, rows, cardW, cardH, tilts, offsets, phoneW, phoneTop, dropStep, popTop, popLeft, radius, tone, copyBand, fade, gap, padTop, padX, padBottom, titleSize, blurbSize, pad, shortTitle, heroPad, h1Size, pSize, maxW, links, splitHero }) {
  // Four ways this card silently stops working. Each is worth failing the build
  // for, because each one only shows up as "the design looks slightly off".
  //
  // 1. A phone that stops above the card's bottom shows its own bottom edge,
  //    and the effect collapses into "a picture pasted on a tile".
  const phoneH = phoneW / SHOT_ASPECT;
  if (phoneH < cardH + popTop + 10) {
    throw new Error(
      `phone too short: ${phoneW}px wide is ${Math.round(
        phoneH,
      )}px tall, needs to clear ${cardH + popTop} (card ${cardW}x${cardH} + ${popTop} overhang)`,
    );
  }
  // 2. The first row's overhang reaches `popTop` above the grid, so anything
  //    less than that in the grid's top padding puts artwork on the hero.
  if (padTop < popTop) {
    throw new Error(
      `grid top padding ${padTop} is under the ${popTop} overhang: the first row's artwork lands on the hero`,
    );
  }
  // 3. A phone that reaches the card's right edge reads as clipped there, which
  //    is the whole thing this layout exists to avoid.
  const rightEdge = Math.max(...offsets) + phoneW - popLeft;
  const strip = cardW - rightEdge;
  if (strip < cardW * 0.16) {
    throw new Error(
      `phone too wide: right edge lands ${Math.round(
        strip,
      )}px from the card's right edge, wanted at least ${Math.round(cardW * 0.16)}`,
    );
  }

  const heroBody = splitHero
    ? `<section style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; padding: ${heroPad};">
    <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 56px;">
      <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: ${
        C.fg
      };">${HERO.h1}</h1>
      <div style="display: flex; flex-direction: column; gap: 10px; max-width: 520px;">
        <p style="margin: 0; font-size: ${pSize}px; line-height: 1.5; color: ${
          C.sub
        }; text-wrap: pretty;">${HERO.p}</p>
        <p style="margin: 0; font-size: ${pSize - 1}px; line-height: 1.5; color: ${
          C.mut
        };">${HERO.note}</p>
      </div>
    </div>
  </section>`
    : `<section style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: ${heroPad};">
    <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; color: ${
      C.fg
    }; text-wrap: balance;">${HERO.h1}</h1>
    <p style="margin: 0; max-width: ${maxW}px; font-size: ${pSize}px; line-height: 1.45; color: ${
      C.sub
    }; text-wrap: pretty;">${HERO.p}</p>
    <p style="margin: 0; max-width: ${maxW}px; font-size: ${
      pSize - 1
    }px; line-height: 1.45; color: ${C.mut};">${HERO.note}</p>
  </section>`;

  const cards = TOOLS.map((t) =>
    posterCard({
      tool: t,
      tilts,
      offsets,
      phoneW,
      phoneTop,
      dropStep,
      cardW,
      popTop,
      popLeft,
      radius,
      tone,
      copyBand,
      fade,
      titleSize,
      blurbSize,
      pad,
      shortTitle,
    }),
  ).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&amp;display=swap">
  <style>
    body { margin: 0; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
    a { color: ${C.pri}; text-decoration: none; }
    a:hover { color: #b91c1c; }
    h1, h2 { text-wrap: balance; }
  </style>
</helmet>
<div style="width: ${width}px; height: ${height}px; box-sizing: border-box; background: ${
    C.bg
  }; color: ${C.fg}; display: flex; flex-direction: column; overflow: hidden;">
${header({ width, links })}
${heroBody}
<div style="flex-shrink: 0; display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, ${cardH}px); column-gap: ${
    popLeft + gap
  }px; row-gap: ${popTop + gap}px; padding: ${padTop}px ${padX}px ${padBottom}px; box-sizing: border-box;">
${cards}
</div>
</div>
</x-dc>
</body>
</html>
`;
}

// ------------------------------------------------------------ artboards

/** Frame height per artboard, in canvas px. Also each root's min-height. */
const H = {
  'SketchMobile.dc.html': 1130,
  'SketchTablet.dc.html': 1320,
  'Main.dc.html': 1660,
  'MarqueeMobile.dc.html': 1680,
  'MarqueeTablet.dc.html': 1290,
  'MarqueeDesktop.dc.html': 1120,
  'FeaturedMobile.dc.html': 1790,
  'FeaturedTablet.dc.html': 1360,
  'FeaturedDesktop.dc.html': 1280,

  // D · Poster cards. These are real device viewports, not page heights: the
  // whole router has to fit without scrolling, so the frame IS the constraint.
  'PosterMobile.dc.html': 844,
  'PosterMobileBand.dc.html': 844,
  'PosterMobileC.dc.html': 844,
  'PosterMobileD.dc.html': 844,
  'PosterTablet.dc.html': 1112,
  'PosterDesktop.dc.html': 900,
};

const FILES = {
  // A · Sketch grid — Main holds the leading candidate (desktop).
  'Main.dc.html': sketch({
    width: 1440, minHeight: H['Main.dc.html'], cols: 2, gap: 40,
    gridPad: '20px 200px 0', shotH: 320, pop: 150,
    titleSize: 26, blurbSize: 15, blurb: 'long', pad: 24,
    h1Size: 60, pSize: 18, maxW: 780, links: true, heroPad: '56px 32px 0',
  }),
  'SketchTablet.dc.html': sketch({
    width: 834, minHeight: H['SketchTablet.dc.html'], cols: 2, gap: 26,
    gridPad: '16px 57px 0', shotH: 246, pop: 122,
    titleSize: 20, blurbSize: 14, blurb: 'long', pad: 18,
    h1Size: 42, pSize: 16, maxW: 640, links: true, heroPad: '40px 32px 0',
  }),
  'SketchMobile.dc.html': sketch({
    width: 390, minHeight: H['SketchMobile.dc.html'], cols: 2, gap: 12,
    gridPad: '10px 16px 0', shotH: 152, pop: 78,
    titleSize: 13, blurbSize: 11, blurb: 'short', pad: 12,
    h1Size: 30, pSize: 14, maxW: 340, links: false, heroPad: '24px 20px 0',
  }),

  // B · Marquee row
  'MarqueeDesktop.dc.html': marquee({
    width: 1440, minHeight: H['MarqueeDesktop.dc.html'], cols: 4, gap: 24,
    gridPad: '20px 80px 0', shotH: 250, pop: 116, fit: 'cover',
    titleSize: 19, blurbSize: 13, blurb: 'short', pad: 18,
    h1Size: 56, pSize: 17, maxW: 700, links: true, heroPad: '56px 80px 0',
  }),
  'MarqueeTablet.dc.html': marquee({
    width: 834, minHeight: H['MarqueeTablet.dc.html'], cols: 2, gap: 22,
    gridPad: '16px 40px 0', shotH: 210, pop: 104, fit: 'cover',
    titleSize: 19, blurbSize: 13, blurb: 'long', pad: 18,
    h1Size: 40, pSize: 16, maxW: 620, links: true, heroPad: '40px 40px 0',
  }),
  'MarqueeMobile.dc.html': marquee({
    width: 390, minHeight: H['MarqueeMobile.dc.html'], cols: 1, gap: 16,
    gridPad: '10px 16px 0', shotH: 150, pop: 62, fit: 'cover',
    titleSize: 18, blurbSize: 13, blurb: 'short', pad: 16,
    h1Size: 32, pSize: 15, maxW: 350, links: false, heroPad: '24px 16px 0',
  }),

  // C · Featured
  'FeaturedDesktop.dc.html': featured({
    width: 1440, minHeight: H['FeaturedDesktop.dc.html'], split: true,
    heroPad: '56px 80px 0', h1Size: 54, pSize: 17, maxW: 720,
    featShotH: 360, featPop: 132, restCols: 3, restGap: 24,
    restShotH: 190, restPop: 84, gridPad: '0 80px', links: true,
  }),
  'FeaturedTablet.dc.html': featured({
    width: 834, minHeight: H['FeaturedTablet.dc.html'], split: false,
    heroPad: '40px 40px 0', h1Size: 40, pSize: 16, maxW: 620,
    featShotH: 320, featPop: 132, restCols: 3, restGap: 16,
    restShotH: 150, restPop: 66, gridPad: '0 40px', links: true,
  }),
  'FeaturedMobile.dc.html': featured({
    width: 390, minHeight: H['FeaturedMobile.dc.html'], split: false,
    heroPad: '24px 16px 0', h1Size: 32, pSize: 15, maxW: 350,
    featShotH: 280, featPop: 96, restCols: 1, restGap: 14,
    restShotH: 130, restPop: 54, gridPad: '0 16px', links: false,
  }),

  // D · Poster cards. Proportions from the owner's PowerPoint (card 315x161):
  // cardH 0.51*cardW, phone 0.53*cardW, popTop 0.47*cardH, popLeft
  // 0.063*cardW, front screenshot inset 0.098*cardW, back one dropped
  // 0.05*cardH, gradient 0.67*cardH. Fan is -8 / -3: the steep fan's 5 degrees
  // of separation, rotated clockwise so the front screenshot sits near upright.
  //
  // A: the reference ratio, with the full <h2> titles.
  'PosterMobile.dc.html': poster({
    width: 390, height: H['PosterMobile.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 88, tone: 'red',
    tilts: [-8, -3], offsets: [0, 16], phoneW: 126, phoneTop: 8, dropStep: 4,
    popTop: 41, popLeft: 10, radius: 14, copyBand: 58, fade: 26,
    gap: 10, padTop: 46, padX: 16, padBottom: 16,
    titleSize: 12.5, blurbSize: 10, pad: 9,
    heroPad: '16px 20px 12px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  // B: the reference ratio with short display titles, which is what the
  // reference itself uses. Same card, but the copy stops eating it.
  'PosterMobileBand.dc.html': poster({
    width: 390, height: H['PosterMobileBand.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 88, tone: 'red', shortTitle: true,
    tilts: [-8, -3], offsets: [0, 16], phoneW: 126, phoneTop: 8, dropStep: 4,
    popTop: 41, popLeft: 10, radius: 14, copyBand: 44, fade: 24,
    gap: 10, padTop: 46, padX: 16, padBottom: 16,
    titleSize: 13, blurbSize: 10, pad: 9,
    heroPad: '16px 20px 12px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  // C: a taller card, full titles — the compromise if the <h2> has to be the
  // exact-match phrase and you still want screenshot showing inside the card.
  'PosterMobileC.dc.html': poster({
    width: 390, height: H['PosterMobileC.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 112, tone: 'red',
    tilts: [-8, -3], offsets: [0, 16], phoneW: 126, phoneTop: 8, dropStep: 5,
    popTop: 48, popLeft: 10, radius: 14, copyBand: 58, fade: 28,
    gap: 10, padTop: 52, padX: 16, padBottom: 16,
    titleSize: 12.5, blurbSize: 10, pad: 9,
    heroPad: '16px 20px 12px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  // D: taller still, and the largest screenshots of the four.
  'PosterMobileD.dc.html': poster({
    width: 390, height: H['PosterMobileD.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 130, tone: 'red',
    tilts: [-8, -3], offsets: [0, 16], phoneW: 132, phoneTop: 8, dropStep: 6,
    popTop: 56, popLeft: 12, radius: 16, copyBand: 60, fade: 30,
    gap: 10, padTop: 60, padX: 16, padBottom: 16,
    titleSize: 13, blurbSize: 10.5, pad: 10,
    heroPad: '16px 20px 12px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  'PosterTablet.dc.html': poster({
    width: 834, height: H['PosterTablet.dc.html'], cols: 2, rows: 2,
    cardW: 363, cardH: 185, tone: 'red',
    tilts: [-8, -3], offsets: [0, 36], phoneW: 236, phoneTop: 14, dropStep: 9,
    popTop: 87, popLeft: 23, radius: 18, copyBand: 90, fade: 42,
    gap: 18, padTop: 92, padX: 32, padBottom: 32,
    titleSize: 21, blurbSize: 14, pad: 16,
    heroPad: '22px 32px 16px', h1Size: 40, pSize: 15.5, maxW: 660, links: true,
  }),
  // Four of the mobile cards side by side, as asked — not a two-by-two.
  'PosterDesktop.dc.html': poster({
    width: 1440, height: H['PosterDesktop.dc.html'], cols: 4, rows: 1,
    cardW: 282, cardH: 144, tone: 'red',
    tilts: [-8, -3], offsets: [0, 28], phoneW: 190, phoneTop: 12, dropStep: 7,
    popTop: 68, popLeft: 18, radius: 16, copyBand: 80, fade: 36,
    gap: 20, padTop: 74, padX: 80, padBottom: 60,
    titleSize: 18, blurbSize: 13.5, pad: 15,
    heroPad: '28px 80px 20px', h1Size: 46, pSize: 16, maxW: 620, links: true,
    splitHero: true,
  }),
};

for (const [name, html] of Object.entries(FILES)) {
  writeFileSync(join(OUT, name), html);
}

// ------------------------------------------------------------- canvas.json

const ROWS = [
  {
    label: 'A · Sketch grid',
    files: ['SketchMobile.dc.html', 'SketchTablet.dc.html', 'Main.dc.html'],
  },
  {
    label: 'B · Marquee row',
    files: ['MarqueeMobile.dc.html', 'MarqueeTablet.dc.html', 'MarqueeDesktop.dc.html'],
  },
  {
    label: 'C · Featured',
    files: ['FeaturedMobile.dc.html', 'FeaturedTablet.dc.html', 'FeaturedDesktop.dc.html'],
  },
];

const XS = [0, 490, 1420];
const WS = [390, 834, 1440];
const DEVICE = ['Mobile 390', 'Tablet 834', 'Desktop 1440'];
const ROW_GAP = 260;

let cursor = 0;
const rowY = ROWS.map((row) => {
  const y = cursor;
  cursor += Math.max(...row.files.map((f) => H[f])) + ROW_GAP;
  return y;
});

const artboards = ROWS.flatMap((row, r) =>
  row.files.map((file, i) => ({
    file,
    title: `${row.label} — ${DEVICE[i]}`,
    x: XS[i],
    y: rowY[r],
    w: WS[i],
    h: H[file],
    page: 'page-1',
  })),
);

// Page 2 keeps the two mobile takes side by side, because the whole point of
// the second one is comparing the gradient against a solid band.
// Row one: four permutations of the fan, same page, same copy, so the only
// thing that differs is the card. Row two: the chosen shape at the other widths.
const POSTER = [
  ['PosterMobile.dc.html', 390, 0, 0, 'A · reference card ratio, full titles'],
  ['PosterMobileBand.dc.html', 390, 490, 0, 'B · reference card ratio, short titles'],
  ['PosterMobileC.dc.html', 390, 980, 0, 'C · taller card, full titles'],
  ['PosterMobileD.dc.html', 390, 1470, 0, 'D · tallest card, largest screenshots'],
  ['PosterTablet.dc.html', 834, 0, 1120, 'Tablet 834 — permutation A'],
  ['PosterDesktop.dc.html', 1440, 934, 1120, 'Desktop 1440 — permutation A, four across'],
];

artboards.push(
  ...POSTER.map(([file, w, x, y, title]) => ({
    file,
    title,
    x,
    y,
    w,
    h: H[file],
    page: 'page-2',
  })),
);

const annotations = [
  {
    id: 'a-note', page: 'page-1', x: 0, y: -190, w: 900,
    text: 'A · Sketch grid — the attached sketch, literally.\nTwo by two at every width, screenshots tilted and broken out of the card top. Reads as a toy shelf.\nTradeoff: at 390px the two-up cards leave ~150px of text width, so the blurbs have to be short — that is the least SEO copy of the three.',
  },
  {
    id: 'b-note', page: 'page-1', x: 0, y: rowY[1] - 190, w: 900,
    text: 'B · Marquee row — four abreast, editorial hero.\nLeft-aligned hero so the h1 and the paragraph read as one block; cards straight-on and equal weight.\nTradeoff: four equal cards say all four tools are equally real. Three of them are not.',
  },
  {
    id: 'c-note', page: 'page-1', x: 0, y: rowY[2] - 190, w: 900,
    text: 'C · Featured — the shipped tool leads.\nThe dex builder gets a split hero card with a real screenshot and a solid CTA; the other three sit in a supporting row.\nTradeoff: it buries the league builder, which is the tool with a settled spec and the next page to rank.',
  },
  {
    id: 'seo-note', page: 'page-1', x: 1000, y: -190, w: 860,
    text: 'SEO structure, same in all three:\n· h1 carries "make your own Pokédex" plus region and league.\n· Each card is an <h2> that exactly matches its slug: /custom-pokedex-builder, /pokemon-league-builder, /favorite-pokemon-picker.\n· The footer repeats the four links as anchor text.\nWatch out: making / a router moves the dex builder off the URL that ranks today (~pos 7.8 for "pokedex builder").',
  },
  {
    id: 'd-note', page: 'page-2', x: 0, y: -300, w: 980,
    text: 'D · Poster cards — proportions measured off your PowerPoint. Against its 315x161 red card: card height 0.51 of its width, screenshot 0.53 of the card width, top overhang 0.47 of the card height, left overhang 0.063 of the card width, front screenshot inset 0.098 of the card width, back one dropped 0.05 of the card height, gradient 0.67 of the card height.\nThe fan is -8 and -3: the steep version\'s five degrees of separation, both rotated clockwise so the front screenshot sits near upright.\nThe gradient is a layer on the card, so it stops at the card outline, rounded corners included. The sliver of screenshot still hanging off the left below it stays unscrimmed, as in your deck.',
  },
  {
    id: 'd-shape-note', page: 'page-2', x: 1030, y: -300, w: 940,
    text: 'What the four vary, and why B exists.\nAt the reference card ratio a 166px-wide card is only 88px tall, and your card titles are exact-match SEO phrases: "Custom Pokédex Builder" wraps to two lines and the copy then fills almost the whole card, leaving screenshot visible only in the overhang above it. That is A.\nB keeps the same card and swaps in short display titles — "Dex Builder", the way your deck labels it — which is what makes the reference\'s balance land. The full phrase can still live in the markup for search without being the visible label.\nC and D keep the full titles and buy the room back by making the card taller: 112 and 130 against the reference\'s 88. D also carries the largest screenshots.',
  },
  {
    id: 'd-row2-note', page: 'page-2', x: 0, y: 1010, w: 980,
    text: 'The other two widths, both at the reference card ratio with the full titles. The cards are wider here, so the same titles cost proportionally less height than they do at 390.\nDesktop is the four mobile cards side by side, not a two-by-two.',
  },
];

writeFileSync(
  join(OUT, 'canvas.json'),
  JSON.stringify(
    {
      artboards,
      annotations,
      pages: [
        { id: 'page-1', name: 'Directions A–C' },
        { id: 'page-2', name: 'D · Poster cards' },
      ],
      launch: { view: 'canvas', page: 'page-2' },
    },
    null,
    2,
  ) + '\n',
);

console.log(`wrote ${Object.keys(FILES).length} artboards + canvas.json to ${OUT}`);
