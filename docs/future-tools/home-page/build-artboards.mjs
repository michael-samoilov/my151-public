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
  h1: 'Make your own Pokédex, region and league',
  p: 'my151 is a set of free Pokémon builder tools. Build a custom Pokédex of 151 favorites from all 1,025 species, lay out a region of routes and biomes, design a gym leader league, and pick a favorite for every type.',
  note: 'No account. Your picks save in this browser and export as a shareable image.',
  // Used where the whole page has to fit one viewport and the long
  // paragraph would push the cards off the bottom.
  pShort:
    'Free tools to build a custom Pokédex from all 1,025 Pokémon, lay out a region of routes and biomes, and design a gym leader league.',
};

/** Card blurbs for the poster cards, which sit over a gradient and get 2 lines. */
const POSTER_BLURB = {
  dex: 'Your 151 from all 1,025, in region sections.',
  league: 'Gym leaders, an Elite Four and a champion.',
  fav: 'One favorite per type, per generation.',
  next: 'Team planner? Box tracker? Nuzlocke? Tell us.',
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

/** Status chips on a red ground: the live one is solid, the rest are outlines. */
function chipOnRed(status, scale = 1) {
  const solid = status === 'live';
  return `<span style="display: inline-flex; align-items: center; flex-shrink: 0; padding: ${
    2 * scale
  }px ${8 * scale}px; border-radius: 999px; border: 1px solid ${
    solid ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
  }; background: ${solid ? '#ffffff' : 'transparent'}; color: ${
    solid ? C.pri : '#ffffff'
  }; font-size: ${Math.round(
    10 * scale,
  )}px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap;">${
    STATUS[status].label
  }</span>`;
}

/**
 * Tallest source aspect (width / height) across the screenshots. A phone is
 * sized by width alone and takes its height from the image, so this is the
 * worst case when checking that a phone outruns the card's bottom edge.
 */
const SHOT_ASPECT = 340 / 560;

/** The stand-in artwork for the fourth card: an empty phone with the form on it. */
function suggestPhone({ phoneW }) {
  // Everything scales off the phone's width, so the form reads the same at 138px
  // as at 250px instead of swamping the small one.
  const ctl = Math.round(phoneW * 0.17);
  const rad = Math.round(phoneW * 0.05);
  return `<div style="display: flex; flex-direction: column; align-items: center; gap: ${Math.round(
    phoneW * 0.08,
  )}px; width: 100%; aspect-ratio: ${
    340 / 560
  }; padding: 20% 8% 0; box-sizing: border-box; background: #fafafa;">
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
 * visible, which is what stops it reading as clipped on the right. It runs off
 * the bottom of its clipping box instead, and the gradient hides that cut.
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
 * A poster card: a wide red tile with a fanned pair of phone screenshots.
 *
 * The card is WIDE and SHORT on purpose. A phone screenshot is about 1:1.6, so
 * it only outruns the card's bottom edge — the one edge allowed to cut it —
 * while still being narrow enough to leave bare tile on the right. Make the
 * card tall and the phone has to be blown up past the card's width to reach the
 * bottom, which is what made earlier versions look cropped on the right.
 *
 * One clipping box does the rest. Its left edge sits on the BACK phone's left
 * edge, outside the card, so the gradient it holds ends exactly where the
 * artwork does instead of bleeding onto the page. Its bottom is flush with the
 * card. Nothing clips the phones on the right: they simply stop short.
 */
function posterCard({ tool, phones, phoneW, phoneTop, frontDX, frontDY, tilt, cardW, popTop, popLeft, radius, tone, copyBand, fade, titleSize, blurbSize, pad, chipInline, chipScale }) {
  const onRed = tone === 'red';
  const ink = onRed ? R.fg : C.fg;
  const inkSub = onRed ? R.sub : C.mut;
  const wash = onRed ? '220, 38, 38' : '255, 255, 255';
  const phoneRadius = Math.round(phoneW * 0.09);

  const back = tool.shot
    ? phone({
        src: tool.shotB ?? tool.shot,
        alt: `${tool.h2} screenshot`,
        w: phoneW,
        x: 0,
        y: phoneTop,
        tilt,
        radius: phoneRadius,
      })
    : '';
  const front = phone({
    src: tool.shot,
    alt: tool.shot ? `${tool.h2} screenshot` : suggestPhone({ phoneW }),
    w: phoneW,
    x: tool.shot && phones > 1 ? frontDX : 0,
    y: tool.shot && phones > 1 ? phoneTop + frontDY : phoneTop,
    tilt,
    radius: phoneRadius,
  });

  return `<a href="${tool.slug}" style="position: relative; display: block; height: 100%; border-radius: ${radius}px; background: ${
    onRed ? R.card : C.card
  }; border: 1px solid ${
    onRed ? R.card : C.bd
  }; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.06); text-decoration: none;">
  <div style="position: absolute; top: -${popTop}px; left: -${popLeft}px; right: 0; bottom: 0; overflow: hidden; border-radius: 0 0 ${radius}px 0;">
    ${phones > 1 ? back : ''}
    ${front}
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: ${
      copyBand + fade
    }px; background: linear-gradient(to top, rgb(${wash}) 0, rgb(${wash}) ${Math.round(
      copyBand * 0.55,
    )}px, rgba(${wash}, 0.92) ${copyBand}px, rgba(${wash}, 0) ${copyBand + fade}px);"></div>
  </div>
  <div style="position: absolute; left: ${pad}px; right: ${pad}px; bottom: ${pad}px; display: flex; flex-direction: column; align-items: flex-start; gap: 3px;">
    <div style="display: flex; ${
      chipInline ? 'align-items: center' : 'flex-direction: column-reverse; align-items: flex-start'
    }; gap: ${chipInline ? 8 : 5}px;">
      <h2 style="margin: 0; font-size: ${titleSize}px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; color: ${ink};">${
        tool.h2
      }</h2>
      ${onRed ? chipOnRed(tool.status, chipScale) : chip(tool.status, chipScale)}
    </div>
    <p style="margin: 0; max-width: ${
      cardW - pad * 2
    }px; font-size: ${blurbSize}px; line-height: 1.35; color: ${inkSub}; text-wrap: pretty;">${
      POSTER_BLURB[tool.key]
    }</p>
  </div>
</a>`;
}

/**
 * One-viewport page: a fixed-height flex column whose card grid takes the
 * remaining space. The rows are `1fr`, so the cards resize to whatever the
 * header and hero leave rather than being measured by hand.
 *
 * Both gaps carry the overhang: a card's artwork reaches `popLeft` into the
 * column gap and `popTop` into the row gap, so a plain gap would let it land on
 * the neighbouring tile.
 */
function poster({ width, height, cols, rows, cardW, cardH, phones, phoneW, phoneTop, frontDX, frontDY, tilt, popTop, popLeft, radius, tone, copyBand, fade, gap, padTop, padX, padBottom, titleSize, blurbSize, pad, chipInline, chipScale, heroPad, h1Size, pSize, maxW, links, splitHero, note }) {
  // Two ways this card silently stops working, both worth failing the build
  // for rather than catching by eye.
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
  //    is the whole thing this layout exists to avoid. Keep a real strip of
  //    bare tile to its right.
  const rightEdge = phoneW + (phones > 1 ? frontDX : 0) - popLeft;
  const strip = cardW - rightEdge;
  if (strip < cardW * 0.18) {
    throw new Error(
      `phone too wide: right edge lands ${Math.round(
        strip,
      )}px from the card's right edge, wanted at least ${Math.round(cardW * 0.18)}`,
    );
  }

  const heroBody = splitHero
    ? `<section style="flex-grow: 1; min-height: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; padding: ${heroPad};">
    <div style="display: flex; flex-direction: column; gap: 10px; max-width: ${maxW}px;">
      <span style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: ${
        C.mut
      };">${ball(14)}${HERO.eyebrow}</span>
      <h1 style="margin: 0; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; color: ${
        C.fg
      };">${HERO.h1}</h1>
    </div>
    <p style="margin: 0 0 4px; max-width: 470px; font-size: ${pSize}px; line-height: 1.5; color: ${
      C.sub
    }; text-wrap: pretty;">${HERO.p}</p>
  </section>`
    : `<section style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: ${heroPad};">
    <span style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: ${
      C.mut
    };">${ball(14)}${HERO.eyebrow}</span>
    <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; color: ${
      C.fg
    }; text-wrap: balance;">${HERO.h1}</h1>
    <p style="margin: 0; max-width: ${maxW}px; font-size: ${pSize}px; line-height: 1.45; color: ${
      C.sub
    }; text-wrap: pretty;">${HERO.p}</p>
    ${
      note
        ? `<p style="margin: 0; max-width: ${maxW}px; font-size: ${
            pSize - 1
          }px; line-height: 1.45; color: ${C.mut};">${HERO.note}</p>`
        : ''
    }
  </section>`;

  const cards = TOOLS.map((t) =>
    posterCard({
      tool: t,
      phones,
      phoneW,
      phoneTop,
      frontDX,
      frontDY,
      tilt,
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
      chipInline,
      chipScale,
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
  'PosterTablet.dc.html': 1112,
  'PosterDesktop.dc.html': 900,
};

// D · Poster cards — one viewport, a fanned pair of whole phone screenshots
// overhanging a wide red tile. Card proportions are set by the phones: see the
// build-time check in poster().
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

  // D · Poster cards
  'PosterMobile.dc.html': poster({
    width: 390, height: H['PosterMobile.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 180, tone: 'red',
    phones: 1, phoneW: 148, phoneTop: 12, frontDX: 0, frontDY: 0, tilt: -4,
    popTop: 50, popLeft: 16, radius: 16, copyBand: 84, fade: 40,
    gap: 10, padTop: 54, padX: 16, padBottom: 16,
    titleSize: 13, blurbSize: 10.5, pad: 11, chipInline: false, chipScale: 0.9,
    heroPad: '18px 20px 14px', h1Size: 28, pSize: 13, maxW: 350, links: false,
    note: true,
  }),
  'PosterMobileBand.dc.html': poster({
    width: 390, height: H['PosterMobileBand.dc.html'], cols: 2, rows: 2,
    cardW: 166, cardH: 180, tone: 'band',
    phones: 1, phoneW: 148, phoneTop: 12, frontDX: 0, frontDY: 0, tilt: -4,
    popTop: 50, popLeft: 16, radius: 16, copyBand: 84, fade: 40,
    gap: 10, padTop: 54, padX: 16, padBottom: 16,
    titleSize: 13, blurbSize: 10.5, pad: 11, chipInline: false, chipScale: 0.9,
    heroPad: '18px 20px 14px', h1Size: 28, pSize: 13, maxW: 350, links: false,
    note: true,
  }),
  'PosterTablet.dc.html': poster({
    width: 834, height: H['PosterTablet.dc.html'], cols: 2, rows: 2,
    cardW: 360, cardH: 300, tone: 'red',
    phones: 2, phoneW: 250, phoneTop: 22, frontDX: 48, frontDY: 12, tilt: -4,
    popTop: 90, popLeft: 30, radius: 18, copyBand: 106, fade: 64,
    gap: 20, padTop: 96, padX: 32, padBottom: 32,
    titleSize: 21, blurbSize: 14, pad: 18, chipInline: true, chipScale: 1.1,
    heroPad: '24px 32px 18px', h1Size: 40, pSize: 16, maxW: 640, links: true,
  }),
  'PosterDesktop.dc.html': poster({
    width: 1440, height: H['PosterDesktop.dc.html'], cols: 2, rows: 2,
    cardW: 608, cardH: 210, tone: 'red',
    phones: 2, phoneW: 250, phoneTop: 22, frontDX: 56, frontDY: 12, tilt: -4,
    popTop: 84, popLeft: 40, radius: 18, copyBand: 100, fade: 62,
    gap: 24, padTop: 90, padX: 80, padBottom: 40,
    titleSize: 22, blurbSize: 14.5, pad: 18, chipInline: true, chipScale: 1.1,
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
const POSTER = [
  ['PosterMobile.dc.html', 390, 0, 'D · Poster — Mobile 390, red card'],
  ['PosterMobileBand.dc.html', 390, 490, 'D · Poster — Mobile 390, white card'],
  ['PosterTablet.dc.html', 834, 980, 'D · Poster — Tablet 834'],
  ['PosterDesktop.dc.html', 1440, 1914, 'D · Poster — Desktop 1440'],
];

artboards.push(
  ...POSTER.map(([file, w, x, title]) => ({
    file,
    title,
    x,
    y: 0,
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
    id: 'd-note', page: 'page-2', x: 0, y: -280, w: 940,
    text: 'D · Poster cards — built from your PowerPoint.\nEach phone is a WHOLE mobile viewport screenshot at its own proportions: nothing is scaled up or cropped, so the right edge and both top corners stay visible. It overhangs the tile on the top and left, stops well short of the right edge, and runs off the BOTTOM — the only edge that cuts it. A red gradient rises from that bottom edge and the copy sits on it, hiding the cut.\nThe phones are a fanned pair at -4 degrees, offset like a stacked deck. The back one is a second screen from the same tool, not a duplicate.',
  },
  {
    id: 'd-shape-note', page: 'page-2', x: 1000, y: -280, w: 900,
    text: 'Why the tiles are wide and short: a phone screenshot is about 1:1.6, so it only outruns the tile\'s bottom edge while still being narrow enough to leave bare tile on the right. Make the tile TALL and the phone has to be blown up past the tile\'s own width to reach the bottom — which is exactly what made the last version look clipped on the right.\nThree rules now fail the build instead of being caught by eye: the phone must outrun the tile\'s bottom, it must leave at least 18% of the tile bare on its right, and the grid\'s top padding must clear the overhang so the first row does not land on the hero.',
  },
  {
    id: 'd-scrim-note', page: 'page-2', x: 0, y: 880, w: 420,
    text: 'Red tile, red gradient, white copy — as asked. This is what the tablet and desktop frames use.\nAt 390 the tiles are half the screen wide, so the phone nearly fills one: the bare strip on its right is about 34px, against roughly half the tile on desktop. The effect is strongest where the tiles are widest.',
  },
  {
    id: 'd-band-note', page: 'page-2', x: 490, y: 880, w: 420,
    text: 'White tile, white gradient, dark copy. Identical geometry — only the colour changes — so the pair isolates that one choice.\nQuieter, and it keeps red as a signal rather than a surface. Cost: the row loses the block of colour that makes the four read as one shelf.',
  },
  {
    id: 'd-seo-note', page: 'page-2', x: 1000, y: 880, w: 900,
    text: 'What one viewport costs on SEO: these cards carry about 45 characters of blurb each, against 150 in direction A, and there is no footer link row. The h2 anchor text and the four slugs are intact, which is the part that matters most.\nIf you want the longer copy back, keep this exact first screen and put a prose block BELOW the fold. Google indexes the rendered DOM whether or not it is above the fold.',
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
