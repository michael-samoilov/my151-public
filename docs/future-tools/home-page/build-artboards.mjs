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

// Poster-card copy, supplied by the owner. Titles are one line each and the
// blurbs are exactly two, with the break where he put it — so the type sizes
// below are chosen to hold the LONGEST title on one line, not the average.
const POSTER_TITLE = {
  dex: 'Custom Pokédex Builder',
  league: 'Trainer Card &amp; League Builder',
  fav: 'Favourite Pokémon Picker',
  next: "What's next?",
};

const POSTER_BLURB = {
  dex: 'Choose your starters, early bug,<br>pseudo, &amp; more from all regions',
  league: 'Design gym leader teams into a<br>league with a champion &amp; boss',
  fav: 'Pick your favorite Pokemon<br>per type per generation',
  next: 'Give us feedback, or<br>tell us what to build next',
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

/** The Hammer the dex builder already uses on its Build tab (lucide). */
const hammer = (size, color) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path><path d="m18 15 4-4"></path><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"></path></svg>`;

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

function header({ width }) {
  return `<header style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: ${
    width < 500 ? '4px 12px' : '8px 24px'
  }; background: ${C.card}; border-bottom: 1px solid ${C.bd};">
    <span style="font-size: ${
      width < 500 ? 22 : 26
    }px; font-weight: 800; letter-spacing: -0.025em;"><span style="color: ${
      C.pri
    };">my151</span><span style="color: ${C.fg};">.app</span></span>
    <span style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">${globe(
      width < 500 ? 20 : 18,
    )}</span>
  </header>`;
}

/** The dex builder's own page footer, reproduced from PageFooter.tsx. */
function pageFooter(width) {
  const k = width < 500 ? 1 : 1.15;
  return `<footer style="display: flex; flex-direction: column; align-items: center; gap: ${Math.round(
    4 * k,
  )}px; padding-bottom: ${Math.round(14 * k)}px;">
    <div style="width: 85%; border-top: 1px solid ${C.bd}; margin-bottom: ${Math.round(
      10 * k,
    )}px;"></div>
    <svg width="${Math.round(24 * k)}" height="${Math.round(
      24 * k,
    )}" viewBox="0 0 24 24" style="color: rgba(115, 115, 115, 0.4);">
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
      <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" stroke-width="1.5"></line>
      <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1.5"></line>
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
    </svg>
    <span style="font-size: ${(
      9 * k
    ).toFixed(1)}px; color: rgba(115, 115, 115, 0.7); text-align: center;">v260830 · Pokémon © 1995–2026 Nintendo / Game Freak / Creatures / TPC</span>
    <span style="font-size: ${(
      8 * k
    ).toFixed(1)}px; color: rgba(115, 115, 115, 0.5);">Not affiliated with or endorsed by Nintendo.</span>
    <span style="margin-top: ${Math.round(4 * k)}px; font-size: ${(
      9 * k
    ).toFixed(
      1,
    )}px; color: rgba(115, 115, 115, 0.7); text-decoration: underline; text-underline-offset: 2px;">Report a problem</span>
  </footer>`;
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
    body: `${header({ width })}
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
    body: `${header({ width })}
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
    body: `${header({ width })}
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
const SHOT_ASPECT = 390 / 844;

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
function posterCard({ tool, tilts, offsets, phoneW, phoneTop, dropStep, cardW, cardH, popTop, popLeft, radius, tone, copyBand, fade, titleSize, blurbSize, pad, bleed }) {
  const onRed = tone === 'red';
  const ink = onRed ? R.fg : C.fg;
  const inkSub = onRed ? R.sub : C.mut;
  const wash = onRed ? '220, 38, 38' : '255, 255, 255';
  const phoneRadius = Math.round(phoneW * 0.09);
  const shots = [tool.shotC, tool.shotB, tool.shot];

  // The clipping box reaches `bleed` further up and left than the artwork needs,
  // so each screenshot's drop shadow has room to fall outside the card without
  // being sliced off at the clip edge. The screenshots shift by the same amount
  // and land where they would have anyway.
  const fan = tilts
    .map((tilt, i) =>
      phone({
        src: shots[shots.length - tilts.length + i],
        alt: `${tool.h2} screenshot`,
        w: phoneW,
        x: bleed + offsets[i],
        y: bleed + phoneTop + (tilts.length - 1 - i) * dropStep,
        tilt,
        radius: phoneRadius,
      }),
    )
    .join('\n    ');

  // No tool to screenshot yet, so the card carries a build icon instead. It is
  // centred across the clear area above the gradient and nudged up, so it reads
  // as optically centred once the copy below is taken into account.
  // The icon sits a little above the card's middle, so it reads as balanced
  // against the copy below. It borrows part of the overhang the other cards
  // spend on artwork, which keeps the four reading as one row; confined to the
  // card alone it would be squeezed between the top edge and the gradient.
  const mark = `<div style="position: absolute; top: 0; left: 0; right: 0; height: ${
    cardH - copyBand
  }px; display: flex; align-items: center; justify-content: center;">${hammer(
    Math.round(cardH * 0.34),
    '#ffffff',
  )}</div>`;

  return `<a href="${tool.slug}" style="position: relative; display: block; height: 100%; border-radius: ${radius}px; background: ${
    onRed ? R.card : C.card
  }; border: 1px solid ${
    onRed ? R.card : C.bd
  }; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.06); text-decoration: none;">
  ${
    tool.shot
      ? `<div style="position: absolute; top: -${popTop + bleed}px; left: -${
          popLeft + bleed
        }px; right: 0; bottom: 0; overflow: hidden;">
    ${fan}
  </div>`
      : mark
  }
  ${
    tool.shot
      ? `<div style="position: absolute; left: 0; right: 0; bottom: 0; height: ${
          copyBand + fade
        }px; border-radius: 0 0 ${radius - 1}px ${
          radius - 1
        }px; background: linear-gradient(to top, rgb(${wash}) 0, rgb(${wash}) ${Math.round(
          copyBand * 0.55,
        )}px, rgba(${wash}, 0.92) ${copyBand}px, rgba(${wash}, 0) ${
          copyBand + fade
        }px);"></div>`
      : ''
  }
  <div style="position: absolute; left: ${pad}px; right: ${pad}px; bottom: ${pad}px; display: flex; flex-direction: column; gap: 3px;">
    <h2 style="margin: 0; font-size: ${titleSize}px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; white-space: nowrap; color: ${ink};">${
      POSTER_TITLE[tool.key]
    }</h2>
    <p style="margin: 0; height: ${Math.round(
      blurbSize * 1.35 * 2,
    )}px; font-size: ${blurbSize}px; line-height: 1.35; color: ${inkSub};">${
      POSTER_BLURB[tool.key]
    }</p>
  </div>
</a>`;
}

/**
 * The card, described once. Every measurement is a ratio of the card's own
 * width, so a breakpoint only picks a scale: desktop is the mobile card
 * enlarged, not a differently proportioned one.
 *
 * `popLeft` is the tight one. The gradient stops at the card's left edge, so it
 * has to finish before the artwork starts hanging off to the left — see check 3
 * in poster(). A wider overhang pushes that crossing lower and squeezes the
 * gradient, so this ratio is near its ceiling.
 */
function cardFrom(cardW) {
  const k = cardW / 166;
  const r = (v) => Math.round(v * k);
  return {
    cardW,
    cardH: r(104),
    tilts: [-8, -3],
    offsets: [0, r(16)],
    phoneW: r(116),
    phoneTop: r(8),
    dropStep: r(6),
    popTop: r(56),
    popLeft: Math.max(6, Math.round(9.6 * k)),
    radius: r(14),
    copyBand: r(52),
    fade: r(26),
    titleSize: +(8.4 * k).toFixed(1),
    blurbSize: +(8 * k).toFixed(1),
    pad: r(7),
  };
}

/**
 * One-viewport page: a fixed-height flex column whose card grid sits below the
 * hero. Row heights are fixed, not `1fr`, so the card height the checks below
 * reason about is the height that actually renders; the hero takes the slack.
 */
function poster({ width, height, cols, rows, gap, padX, padBottom, bleed = 34, clearFraction = 0, heroPad, h1Size, pSize, maxW, noteW, splitHero }) {
  // The card takes its width from the frame, so the numbers the checks below
  // reason about are the ones that render. The gutter is a plain gap: an
  // artwork overhang of ~10-30px sits inside it without reaching the neighbour.
  const cardW = Math.floor((width - 2 * padX - (cols - 1) * gap) / cols);
  const {
    cardH, tilts, offsets, phoneW, phoneTop, dropStep, popTop, popLeft,
    radius, copyBand, fade, titleSize, blurbSize, pad,
  } = cardFrom(cardW);
  const tone = 'red';
  const padTop = popTop + 10;
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
  // 3. The gradient stops at the card's left edge, so its top has to sit BELOW
  //    the height where the artwork starts hanging off to the left. Each
  //    screenshot rotates about its own top-left corner, so its left edge walks
  //    rightwards as it descends and crosses back inside the card at
  //    popLeft / sin(tilt) below its top. The leftmost one governs.
  const crossing =
    phoneTop +
    Math.max(
      ...tilts.map((t, i) => {
        const out = popLeft - offsets[i];
        return out <= 0 ? 0 : out / Math.sin((Math.abs(t) * Math.PI) / 180);
      }),
    ) -
    popTop;
  if (copyBand + fade > cardH - crossing) {
    throw new Error(
      `gradient ${copyBand + fade}px tall but only ${Math.round(
        cardH - crossing,
      )}px clear below the left overhang: shrink popLeft, steepen the tilt, or shorten the copy`,
    );
  }
  // 4. A phone that reaches the card's right edge reads as clipped there, which
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
    ? `<section style="flex-shrink: 0; display: flex; flex-direction: column; padding: ${heroPad};">
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 40px;">
      <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: ${
        C.fg
      };">${HERO.h1}</h1>
      <div style="display: flex; flex-direction: column; gap: 10px; width: ${noteW}px; flex-shrink: 0;">
        <p style="margin: 0; font-size: ${pSize}px; line-height: 1.5; color: ${
          C.sub
        }; text-wrap: pretty;">${HERO.p}</p>
        <p style="margin: 0; font-size: ${pSize - 1}px; line-height: 1.5; color: ${
          C.mut
        };">${HERO.note}</p>
      </div>
    </div>
  </section>`
    : `<section style="flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; padding: ${heroPad};">
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

  // A fifth of the space below the app header stays clear at the top and the
  // bottom of the viewport, which is what lifts the card rail off the floor.
  // Percentage padding in a flex column resolves against WIDTH, so the clear
  // band is computed in px from the frame height instead.
  const clear = Math.round((height - (width < 500 ? 44 : 50)) * clearFraction);
  const bandOpen = clearFraction
    ? `<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; justify-content: space-between; padding: ${clear}px 0 ${Math.round(
        clear * 0.55,
      )}px;">`
    : '';
  const bandClose = clearFraction ? `</div>\n${pageFooter(width)}` : '';

  const cards = TOOLS.map((t) =>
    posterCard({
      tool: t,
      tilts,
      offsets,
      phoneW,
      phoneTop,
      dropStep,
      cardW,
      cardH,
      popTop,
      popLeft,
      radius,
      tone,
      copyBand,
      fade,
      titleSize,
      blurbSize,
      pad,
      bleed,
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
${header({ width })}
${bandOpen}
${heroBody}
<div style="flex-shrink: 0; display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, ${cardH}px); column-gap: ${gap}px; row-gap: ${popTop + Math.round(gap * 0.6)}px; padding: ${padTop}px ${padX}px ${padBottom}px; box-sizing: border-box;">
${cards}
</div>
${bandClose}
${clearFraction ? '' : `<div style="flex-grow: 1; min-height: 0;"></div>\n${pageFooter(width)}`}
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

  // D · Poster cards. The card is described once, in cardFrom(), as ratios of
  // its own width — and that width now comes from the frame, so the numbers the
  // checks reason about are the numbers that render. A breakpoint only sets the
  // page margins and the gutter.
  'PosterMobile.dc.html': poster({
    width: 390, height: H['PosterMobile.dc.html'], cols: 2, rows: 2,
    gap: 14, padX: 16, padBottom: 0,
    heroPad: '20px 20px 22px', h1Size: 27, pSize: 12.5, maxW: 350,
  }),
  'PosterTablet.dc.html': poster({
    width: 834, height: H['PosterTablet.dc.html'], cols: 2, rows: 2,
    gap: 28, padX: 44, padBottom: 0,
    heroPad: '20px 44px 12px', h1Size: 36, pSize: 14.5, maxW: 620,
  }),
  // Four across, with the rail spanning exactly the hero's own measure: the
  // left card lines up with the h1, the right card with the sub-text's right
  // edge, because both use the same horizontal margin.
  'PosterDesktop.dc.html': poster({
    width: 1440, height: H['PosterDesktop.dc.html'], cols: 4, rows: 1,
    gap: 26, padX: 80, padBottom: 0,
    heroPad: '0 80px', h1Size: 42, pSize: 15.5, maxW: 520, noteW: 700,
    splitHero: true, clearFraction: 0.24,
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
  ['PosterMobile.dc.html', 390, 0, 0, 'Mobile 390'],
  ['PosterTablet.dc.html', 834, 490, 0, 'Tablet 834'],
  ['PosterDesktop.dc.html', 1440, 1424, 0, 'Desktop 1440 — four across'],
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
    id: 'd-note', page: 'page-2', x: 0, y: -260, w: 940,
    text: 'D · Poster cards. The card is described once, in cardFrom(), as ratios of its own width — and that width now comes from the FRAME rather than being declared, so the numbers the build checks reason about are the numbers that render. A breakpoint only sets the page margin and the gutter.\nThat is what let the cards grow into the centre rail: the gutter used to carry the 34px shadow bleed as well as the gap, and it no longer does. The clip still reaches that far, so no shadow is sliced; a soft shadow grazing a neighbour is invisible.\nThe row gap is now the overhang plus a little, so the second row sits close under the first without its screenshots reaching the cards above.',
  },
  {
    id: 'd-page-note', page: 'page-2', x: 990, y: -260, w: 940,
    text: 'Page changes: the app header drops the tool links, since the cards are the navigation. The dex builder\'s own footer is on the bottom of every width, copied from PageFooter.tsx.\nThe fourth card has no gradient — there is no screenshot under the copy to rescue, and the wash only muddied the mark. Its Hammer is the app\'s own lucide icon, white, higher and smaller.\nOn desktop the card rail spans exactly the hero\'s measure: the left card lines up with the h1 and the right card with the sub-text\'s right edge, because both use the same 80px margin. The sub-text column is 700px wide so its last line holds without wrapping.\nThe desktop clear band is 24%: the hero, the card block and the footer together leave that much above and below.',
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
