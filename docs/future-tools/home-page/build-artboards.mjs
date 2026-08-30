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

/**
 * The stand-in artwork for the fourth card, sized to fill the poster frame
 * the way a screenshot does.
 */
function suggestFill({ pad, ctl, reserve }) {
  // Bottom-aligned, not centred: the card is as tall as a screenshot, and a
  // small form floating in the middle of it reads as an unfinished tile.
  return `<div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: ${pad}px; width: 100%; height: 100%; padding: ${pad}px ${pad}px ${reserve}px; box-sizing: border-box; background: #fafafa;">
        ${spark(Math.round(ctl * 0.72))}
        <div style="display: flex; align-items: center; gap: 6px; width: 100%; max-width: 240px;">
          <span style="flex-grow: 1; height: ${ctl}px; border: 1px solid ${
            C.bd
          }; border-radius: 10px; background: ${C.card};"></span>
          <span style="display: flex; align-items: center; justify-content: center; height: ${ctl}px; padding: 0 12px; border-radius: 10px; background: ${
            C.pri
          }; color: #ffffff; font-size: 12px; font-weight: 700;">Send</span>
        </div>
      </div>`;
}

/**
 * A poster card. The artwork is anchored to the card's BOTTOM edge, where it
 * is clipped flush, and runs up past the card's TOP edge by `pop`. Two ways to
 * keep the copy readable over it:
 *
 * - scrim: the artwork reaches the bottom edge and a white gradient rises over
 *   it, with the text on the gradient. Most of the screenshot stays visible.
 * - band: the artwork stops at a solid white band that holds the text. Nothing
 *   overlaps, at the cost of that strip of screenshot.
 */
function posterCard({ tool, pop, mode, scrim, titleSize, blurbSize, pad, ctl, chipScale, cta, radius }) {
  const scrimMode = mode === 'scrim';
  const art = tool.shot
    ? `<img src="${tool.shot}" alt="${tool.h2} screenshot" style="display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center;">`
    : suggestFill({ pad, ctl, reserve: scrimMode ? Math.round(scrim * 0.8) : pad });

  const scrimLayer = scrimMode
    ? `<div style="position: absolute; left: 0; right: 0; bottom: 0; height: ${scrim}px; background: linear-gradient(to top, ${
        C.card
      } 22%, rgba(255, 255, 255, 0.97) 44%, rgba(255, 255, 255, 0.72) 68%, rgba(255, 255, 255, 0) 100%);"></div>`
    : '';

  const copy = `<div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
    ${chip(tool.status, chipScale)}
    <h2 style="margin: 0; font-size: ${titleSize}px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; color: ${
      C.fg
    };">${tool.h2}</h2>
    <p style="margin: 0; font-size: ${blurbSize}px; line-height: 1.35; color: ${
      C.mut
    }; text-wrap: pretty;">${POSTER_BLURB[tool.key]}</p>
    ${
      cta
        ? `<span style="display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: ${blurbSize}px; font-weight: 600; color: ${
            C.pri
          };">${tool.cta}${arrow(Math.round(blurbSize * 1.05), C.pri)}</span>`
        : ''
    }
  </div>`;

  // Square bottom corners are what makes the artwork read as CUT at the clip
  // line, rather than as a rounded tile floating on top of the card.
  const artFrame = (position) =>
    `<div style="position: absolute; left: ${radius}px; right: ${radius}px; top: -${pop}px; ${position}; border-radius: ${
      radius - 3
    }px ${radius - 3}px 0 0; overflow: hidden; background: ${C.bg}; border: 1px solid ${
      C.bd
    }; border-bottom: none; box-shadow: 0 10px 24px rgba(10, 10, 10, 0.14), 0 2px 6px rgba(10, 10, 10, 0.08);">
    ${art}
    ${scrimLayer}
  </div>`;

  const shell = (inner) =>
    `<a href="${tool.slug}" style="position: relative; height: 100%; border-radius: ${radius}px; background: ${
      C.card
    }; border: 1px solid ${C.bd}; box-shadow: 0 1px 2px rgba(10, 10, 10, 0.04); color: ${
      C.fg
    }; text-decoration: none; ${
      scrimMode ? 'display: block;' : 'display: flex; flex-direction: column;'
    }">
${inner}
</a>`;

  if (scrimMode) {
    return shell(`  ${artFrame('bottom: 0')}
  <div style="position: absolute; left: ${pad}px; right: ${pad}px; bottom: ${pad}px;">${copy}</div>`);
  }

  // The band sizes itself from the copy, so the clip line lands exactly on the
  // text block's top edge whatever the heading wraps to.
  return shell(`  <div style="position: relative; flex-grow: 1; min-height: 0;">
    ${artFrame('bottom: 0')}
  </div>
  <div style="flex-shrink: 0; padding: ${pad}px;">${copy}</div>`);
}

/**
 * One-viewport page: a fixed-height flex column whose card grid takes the
 * remaining space. The rows are `1fr`, so the cards resize to whatever the
 * header and hero leave rather than being measured by hand.
 */
function poster({ width, height, cols, rows, mode, pop, scrim, gap, gridPad, titleSize, blurbSize, pad, ctl, chipScale, cta, radius, heroPad, h1Size, pSize, maxW, links, splitHero }) {
  const heroBody = splitHero
    ? `<section style="display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; padding: ${heroPad};">
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
    : `<section style="display: flex; flex-direction: column; gap: 8px; padding: ${heroPad};">
    <span style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: ${
      C.mut
    };">${ball(14)}${HERO.eyebrow}</span>
    <h1 style="margin: 0; max-width: ${maxW}px; font-size: ${h1Size}px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; color: ${
      C.fg
    }; text-wrap: balance;">${HERO.h1}</h1>
    <p style="margin: 0; max-width: ${maxW}px; font-size: ${pSize}px; line-height: 1.45; color: ${
      C.sub
    }; text-wrap: pretty;">${HERO.pShort}</p>
  </section>`;

  const cards = TOOLS.map((t) =>
    posterCard({
      tool: t,
      pop,
      mode,
      scrim,
      titleSize,
      blurbSize,
      pad,
      ctl,
      chipScale,
      cta,
      radius,
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
<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr)); column-gap: ${gap}px; row-gap: ${
    pop + gap
  }px; padding: ${gridPad}; box-sizing: border-box;">
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

  // D · Poster cards — one viewport, artwork clipped at the card's bottom edge.
  'PosterMobile.dc.html': poster({
    width: 390, height: H['PosterMobile.dc.html'], cols: 2, rows: 2,
    mode: 'scrim', pop: 34, scrim: 132, gap: 10, gridPad: '42px 14px 14px', radius: 14,
    titleSize: 13, blurbSize: 10.5, pad: 11, ctl: 44, chipScale: 0.95, cta: false,
    heroPad: '14px 20px 10px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  'PosterMobileBand.dc.html': poster({
    width: 390, height: H['PosterMobileBand.dc.html'], cols: 2, rows: 2,
    mode: 'band', pop: 34, gap: 10, gridPad: '42px 14px 14px', radius: 14,
    titleSize: 13, blurbSize: 10.5, pad: 11, ctl: 44, chipScale: 0.95, cta: false,
    heroPad: '14px 20px 10px', h1Size: 27, pSize: 12.5, maxW: 350, links: false,
  }),
  'PosterTablet.dc.html': poster({
    width: 834, height: H['PosterTablet.dc.html'], cols: 2, rows: 2,
    mode: 'scrim', pop: 48, scrim: 176, gap: 20, gridPad: '58px 32px 32px', radius: 18,
    titleSize: 21, blurbSize: 14, pad: 18, ctl: 44, chipScale: 1.15, cta: true,
    heroPad: '26px 32px 18px', h1Size: 42, pSize: 16, maxW: 640, links: true,
  }),
  'PosterDesktop.dc.html': poster({
    width: 1440, height: H['PosterDesktop.dc.html'], cols: 4, rows: 1,
    mode: 'scrim', pop: 54, scrim: 190, gap: 24, gridPad: '66px 80px 40px', radius: 18,
    titleSize: 20, blurbSize: 13.5, pad: 18, ctl: 44, chipScale: 1.1, cta: true,
    heroPad: '30px 80px 22px', h1Size: 48, pSize: 16, maxW: 620, links: true,
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
  ['PosterMobile.dc.html', 390, 0, 'D · Poster — Mobile 390, gradient'],
  ['PosterMobileBand.dc.html', 390, 490, 'D · Poster — Mobile 390, solid band'],
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
    id: 'd-note', page: 'page-2', x: 0, y: -230, w: 940,
    text: 'D · Poster cards — the artwork is anchored to the card\'s BOTTOM edge, where it is clipped flush, and runs up past the TOP edge. Every frame here is a real device viewport, so nothing scrolls: 390×844, 834×1112, 1440×900.\nThe two mobile frames are the same layout with two ways of keeping the copy readable. Pick one.',
  },
  {
    id: 'd-scrim-note', page: 'page-2', x: 0, y: 880, w: 420,
    text: 'Gradient. The screenshot reaches the card\'s bottom edge and a white scrim rises over its lower third; the h2 and the line under it sit on the scrim.\nMore screenshot stays visible, and the card reads as one object rather than a picture with a caption.\nCost: the copy sits on a busy sprite grid, so it needs the scrim to stay opaque near the bottom — which is most of what the gradient is doing.',
  },
  {
    id: 'd-band-note', page: 'page-2', x: 490, y: 880, w: 420,
    text: 'Solid band. The screenshot stops at a white strip that holds the same copy. Nothing overlaps.\nHighest text contrast, and it survives any screenshot, including a light one.\nCost: it gives up 62px of artwork per card and reads as a caption under a picture — the effect you asked for is weaker.',
  },
  {
    id: 'd-seo-note', page: 'page-2', x: 1000, y: -230, w: 900,
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
