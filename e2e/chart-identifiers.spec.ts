import { test, expect, type Page } from '@playwright/test';
import { filledPicker, openStatsFlow, nativeImage, toggleStats } from './support/statsFrameEvidence';
import { seedDex, TUNE_URL } from './support/dexSeed';
import { observeChartPaint, paintedAxes } from './support/chartPaintEvidence';

test.setTimeout(120_000);
async function openPickerAnalytics(page: Page, lang = 'en') {
  await page.addInitScript(fills => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills }, version: 3 })), filledPicker);
  await page.addInitScript(() => localStorage.setItem('personal-151-favorites-analytics-v1', '1'));
  await page.goto(`/favorite-pokemon-picker?notme&lang=${lang}`);
  await page.locator('#favorites-tab-analytics').click();
  await expect(page.locator('[data-favorite-chart=type] svg').first()).toBeVisible();
}
async function svgEvidence(page: Page) {
  return page.locator('[data-favorite-chart]').evaluateAll(cards => cards.filter(card => card.getAttribute('data-favorite-chart') !== 'bst').map(card => {
    const svg = card.querySelector('svg')!;
    const axes = [...svg.querySelectorAll(':scope > line')].map(line => Number(line.getAttribute('x1')));
    const circles = [...svg.querySelectorAll('circle')].map(circle => ({
      title: circle.closest('[data-row-key]')?.getAttribute('aria-label'),
      role: circle.closest('[data-evolution-dots]')?.getAttribute('data-evolution-dots'),
      r: Number(circle.getAttribute('r')), cx: Number(circle.getAttribute('cx')),
    }));
    const texts = [...svg.querySelectorAll('text')].filter(text => !text.closest('[data-audit-clip]')).map(text => {
      const rect = text.getBoundingClientRect(), svgRect = svg.getBoundingClientRect();
      return { text: text.textContent, left: rect.left - svgRect.left, right: rect.right - svgRect.left, y: rect.top - svgRect.top };
    });
    return { chart: card.getAttribute('data-favorite-chart'), width: svg.getBoundingClientRect().width, axes, circles, texts };
  }));
}

test('fixed chart axes and equal-area standalone evolution dot survive sorting @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  const evidence = await svgEvidence(page);
  expect(evidence).toHaveLength(4);
  for (const card of evidence) {
    expect(card.width).toBeCloseTo(evidence[0].width, 1);
    expect(card.axes).toHaveLength(2);
    card.axes.forEach((axis, index) => expect(axis).toBeCloseTo(evidence[0].axes[index], 1));
  }
  const circles = evidence.find(card => card.chart === 'evolution')!.circles;
  const standalone = circles.filter(circle => circle.role === 'standalone');
  expect(standalone).toHaveLength(1);
  const stages = circles.filter(circle => circle.role !== 'standalone');
  expect(stages.length).toBeGreaterThan(3);
  for (const circle of stages) expect(circle.r ** 2).toBeCloseTo(standalone[0].r ** 2, 2);
  const middleDots = stages.filter((_, index) => index % 3 === 1);
  for (const middle of middleDots) expect(middle.cx).toBeCloseTo(standalone[0].cx, 2);
  for (const dimension of ['type', 'color', 'shape', 'evolution']) {
    const card = page.locator(`[data-favorite-chart=${dimension}]`);
    await card.locator('svg > text').filter({ hasText: /^COUNT$/ }).click();
  }
  const sorted = await svgEvidence(page);
  sorted.forEach((card, index) => card.axes.forEach((axis, axisIndex) => expect(axis).toBeCloseTo(evidence[index].axes[axisIndex], 1)));
  await testInfo.attach('painted-chart-geometry', { body: JSON.stringify({ evidence, sorted }, null, 2), contentType: 'application/json' });
  await testInfo.attach('chart-screen', { body: await page.screenshot(), contentType: 'image/png' });
});

test('localized identifiers fit their fixed rail without touching chart bars @viewport', async ({ page }, testInfo) => {
  const evidence = [];
  for (const locale of ['en','de','es','fr','it','ja','ko','zh-Hans','zh-Hant']) {
    await openPickerAnalytics(page, locale);
    await page.evaluate(() => document.fonts.ready);
    const cards = await svgEvidence(page);
    for (const card of cards) {
      const rowLabels = card.texts.filter(text => text.y > 30 && text.left < card.axes[0] && !/^[-\d.,+]/.test(text.text ?? ''));
      for (const label of rowLabels) {
        expect(label.left, `${locale}/${card.chart}/${label.text} left`).toBeGreaterThanOrEqual(-.5);
        expect(label.right, `${locale}/${card.chart}/${label.text} rail`).toBeLessThan(card.axes[0]);
      }
      card.axes.forEach((axis, index) => expect(axis, `${locale}/${card.chart}`).toBeCloseTo(cards[0].axes[index], 1));
    }
    evidence.push({ locale, cards });
  }
  await testInfo.attach('nine-locale-chart-fit', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('native detailed sheets use matching local axes and readable badge labels @viewport', async ({ page }, testInfo) => {
  const evidence = [];
  for (const tool of ['picker','dex'] as const) {
    await observeChartPaint(page);
    await openStatsFlow(page, tool);
    const plain = await nativeImage(page, tool);
    await toggleStats(page, tool);
    const detailed = await nativeImage(page, tool);
    const axes = await paintedAxes(page);
    const texts = await page.evaluate(() => (window as unknown as { frameTexts: { text: string; bounds: { left: number; right: number; top: number; bottom: number } }[] }).frameTexts);
    const labels = texts.filter(record => record.bounds.left > plain.width && record.text.length > 1).map(record => record.text);
    expect(labels).toContain('FIRE');
    if (tool === 'picker') {
      expect(labels).toContain('BROWN'); expect(labels).toContain('BIPED & TAIL');
      const circles = await page.evaluate(mainWidth => (window as unknown as { chartCircles: { x:number; y:number; r:number }[] }).chartCircles.filter(circle => circle.x > mainWidth && circle.r < 10), plain.width);
      expect(circles.length).toBeGreaterThanOrEqual(10);
      for (const circle of circles) expect(circle.r ** 2).toBeCloseTo(circles[0].r ** 2, 2);
    }
    else expect(labels).toContain('GEN I');
    const pairs = axes.filter((line, index) => index % 2 === 0 && axes[index + 1] && Math.abs(line.points[0].y - axes[index + 1].points[0].y) < .1).map(line => {
      const index = axes.indexOf(line); return { count: line.points[0].x, index: axes[index + 1].points[0].x, y: line.points[0].y, width: line.width };
    });
    expect(pairs.length).toBeGreaterThanOrEqual(tool === 'picker' ? 4 : 2);
    const local = pairs.map(pair => ({ ...pair, distance: pair.index - pair.count }));
    local.forEach(pair => expect(pair.distance).toBeCloseTo(local[0].distance, 1));
    if (tool === 'picker') {
      const columns = local.map(pair => pair.count).sort((a,b) => a-b);
      expect(Math.abs(columns[0] - columns[1])).toBeLessThan(.1);
      expect(Math.abs(columns[2] - columns[3])).toBeLessThan(.1);
    } else local.forEach(pair => expect(pair.count).toBeCloseTo(local[0].count, 1));
    evidence.push({ tool, plain: { width: plain.width, height: plain.height, sha: plain.sha256 }, detailed: { width: detailed.width, height: detailed.height }, local, labels });
    await testInfo.attach(`${tool}-native-detail`, { body: Buffer.from(detailed.png, 'base64'), contentType: 'image/png' });
    await page.goto('/');
  }
  await testInfo.attach('actual-native-axes', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('native localized badge ink stays within its painted pill @viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Native PNG dimensions are independent of viewport.');
  test.setTimeout(180_000);
  const evidence = [];
  for (const locale of ['en','de','es','fr','it','ja','ko','zh-Hans','zh-Hant']) {
    await observeChartPaint(page);
    await openStatsFlow(page, 'picker', locale);
    const plain = await nativeImage(page, 'picker');
    await toggleStats(page, 'picker');
    const detailed = await nativeImage(page, 'picker');
    const paint = await page.evaluate(({ mainWidth, outputWidth }) => {
      type Bounds = { width:number; left:number;right:number;top:number;bottom:number; text?:string; fill?:string; color?:string };
      const target = window as unknown as { chartBadges:Bounds[]; chartBadgeTexts:Bounds[]; chartShapeGlyphs:Bounds[]; chartBars:Bounds[] };
      const badges = target.chartBadges.filter(item => item.width === outputWidth && item.left > mainWidth);
      const texts = target.chartBadgeTexts.filter(item => item.width === outputWidth && item.left > mainWidth && badges.some(badge => (item.top + item.bottom) / 2 >= badge.top && (item.top + item.bottom) / 2 <= badge.bottom));
      const glyphs = target.chartShapeGlyphs.filter(item => item.width === outputWidth && item.left > mainWidth);
      return { badges, texts, glyphs, bars:target.chartBars.filter(item => item.width === outputWidth && item.left > mainWidth) };
    }, { mainWidth: plain.width, outputWidth: detailed.width });
    expect(paint.badges.length).toBeGreaterThan(30);
    expect(paint.texts.length).toBeGreaterThan(30);
    for (const text of paint.texts) {
      const badge = paint.badges.find(b => text.top >= b.top - .5 && text.bottom <= b.bottom + .5 && text.left >= b.left - .5 && text.right <= b.right + .5);
      expect(badge, `${locale}: ${text.text} painted outside pill`).toBeDefined();
      expect(text.right - text.left).toBeGreaterThan(2);
      expect(text.color, `${locale}: ${text.text} pill ink`).toBe(badge!.fill === '#ffffff' ? '#171717' : '#ffffff');
      const rowBar=paint.bars.find(bar=>bar.left>=badge!.right && Math.abs((bar.top+bar.bottom)-(badge!.top+badge!.bottom))<.5);
      if(rowBar && badge!.fill!=='#ffffff') expect(rowBar.fill?.toLowerCase(),`${locale}: ${text.text} native badge/bar`).toBe(badge!.fill?.toLowerCase());
      const glyph = paint.glyphs.find(g => g.left >= badge!.left && g.right <= badge!.right && g.top >= badge!.top && g.bottom <= badge!.bottom);
      if (glyph) {
        expect(text.left - glyph.right, `${locale}: ${text.text} painted glyph gap`).toBeGreaterThanOrEqual(glyph.left - badge!.left - .5);
        const badgeWidth=badge!.right-badge!.left;
        expect((text.left-badge!.left)/badgeWidth*199+.5,`${locale}: ${text.text} slot left`).toBeGreaterThanOrEqual(63.5);
        expect((text.right-badge!.left)/badgeWidth*199+.5,`${locale}: ${text.text} slot right`).toBeLessThanOrEqual(185.5);
      }
    }
    if(locale === 'en') {
      const pixels=await page.evaluate(async({png,paint})=>{
        const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
        const cv=document.createElement('canvas');cv.width=image.width;cv.height=image.height;const ctx=cv.getContext('2d')!;ctx.drawImage(image,0,0);
        const rgba=(x:number,y:number)=>[...ctx.getImageData(Math.round(x),Math.round(y),1,1).data];
        return paint.badges.filter(badge=>badge.fill!=='#ffffff').flatMap(badge=>{
          const bar=paint.bars.filter(bar=>bar.left>=badge.right && bar.right-bar.left>3 && Math.abs((bar.top+bar.bottom)-(badge.top+badge.bottom))<.5).sort((a,b)=>a.left-b.left)[0];
          if(!bar)return [];
          return [{badge:rgba(badge.right-(badge.bottom-badge.top)*.2,(badge.top+badge.bottom)/2),bar:rgba((bar.left+bar.right)/2,(bar.top+bar.bottom)/2)}];
        });
      },{png:detailed.png,paint});
      expect(pixels.length,'native type/color row pixels').toBeGreaterThan(20);
      for(const pixel of pixels) expect(pixel.bar,'native actual palette').toEqual(pixel.badge);
      await testInfo.attach('native-actual-palette-RGBA',{body:JSON.stringify(pixels,null,2),contentType:'application/json'});
    }
    evidence.push({ locale, ...paint });
    await page.goto('/');
  }
  await testInfo.attach('native-nine-locale-pill-ink', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('Dex type generation and shape charts share axes and pill identifiers @viewport', async ({ page }, testInfo) => {
  await page.goto(`${TUNE_URL}&notme&lang=en`);
  await seedDex(page);
  await page.locator('[data-nav=analytics]').click();
  await expect(page.getByRole('heading', { name: 'Generation Origin' })).toBeVisible();
  await expect(page.locator('svg > text').filter({ hasText: /^GEN$/ })).toBeVisible();
  const evidence = await page.locator('svg').evaluateAll(svgs => svgs.flatMap(svg => {
    const header = [...svg.querySelectorAll(':scope > text')].find(text => ['TYPE','GEN','SHAPE'].includes(text.textContent ?? ''));
    const lines = [...svg.querySelectorAll(':scope > line')];
    if (!header || lines.length !== 2) return [];
    const badges = [...svg.querySelectorAll('rect')].filter(rect => Number(rect.getAttribute('width')) / Number(rect.getAttribute('height')) > 4.8);
    const parentRect=svg.getBoundingClientRect();
    const generationBounds=[...svg.querySelectorAll('svg[data-gen]')].map(pill=>{const rect=pill.getBoundingClientRect();return {left:rect.left-parentRect.left,right:rect.right-parentRect.left,top:rect.top-parentRect.top,bottom:rect.bottom-parentRect.top};});
    return [{ header:header.textContent, width:parentRect.width, axes:lines.map(line => Number(line.getAttribute('x1'))), badges:badges.length, genPills:generationBounds.length, generationBounds }];
  }));
  expect(evidence.map(card => card.header).sort()).toEqual(['GEN','SHAPE','TYPE']);
  for (const card of evidence) {
    expect(card.width).toBeCloseTo(evidence[0].width, 1);
    card.axes.forEach((axis,index) => expect(axis).toBeCloseTo(evidence[0].axes[index], 1));
    if (card.header === 'GEN') {
      expect(card.genPills).toBe(9);
      for(const [index,pill] of card.generationBounds.entries()) {
        expect(pill.right).toBeLessThan(card.axes[0]);
        if(index) expect(pill.top).toBeGreaterThan(card.generationBounds[index-1].bottom);
      }
    }
    else expect(card.badges).toBeGreaterThanOrEqual(card.header === 'TYPE' ? 18 : 14);
  }
  await testInfo.attach('dex-actual-axes-and-pill-shapes', { body:JSON.stringify(evidence,null,2), contentType:'application/json' });
});

test('count labels stay numeric and badge whitespace keeps colored text and shapes readable @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  const evidence = await page.locator('[data-favorite-chart]').evaluateAll(cards => cards.filter(card => card.getAttribute('data-favorite-chart') !== 'bst').map(card => {
    const svg = card.querySelector('svg')!;
    const countLabels = [...svg.querySelectorAll(':scope > g > text')].map(text => text.textContent ?? '').filter(text => !text.endsWith('x'));
    const badgeTexts = [...svg.querySelectorAll('text[font-weight="700"]')].map(text => ({ text:text.textContent,fill:text.getAttribute('fill'),badgeFill:text.closest('g')?.parentElement?.querySelector('rect[rx]')?.getAttribute('fill') }));
    const shapeGaps = card.getAttribute('data-favorite-chart') === 'shape' ? [...svg.querySelectorAll(':scope > g')].flatMap(row => {
      const image=row.querySelector('image'),text=row.querySelector('text[font-weight="700"]'),rect=row.querySelector('rect[rx]');
      if(!image||!text||!rect)return [];
      const glyph=image.getBoundingClientRect(),ink=text.getBoundingClientRect(),badge=rect.getBoundingClientRect();
      return [{label:text.textContent,leftInset:glyph.left-badge.left,textGap:ink.left-glyph.right}];
    }) : [];
    const countBars=[...svg.querySelectorAll(':scope > g > rect[rx="1"]')].filter(rect=>Number(rect.getAttribute('x'))===Number(svg.querySelector(':scope > line')!.getAttribute('x1'))).map(rect=>Number(rect.getAttribute('width')));
    return { dimension:card.getAttribute('data-favorite-chart'),countLabels,badgeTexts,shapeGaps,maxCountBar:Math.max(...countBars) };
  }));
  for(const card of evidence) {
    expect.soft(card.countLabels.length).toBeGreaterThan(0);
    expect.soft(card.countLabels.filter(label => !/^\d+$/.test(label)), `${card.dimension} counts`).toEqual([]);
    if(card.dimension==='color') for (const label of card.badgeTexts) expect.soft(label.fill, `${label.text} color ink`).toBe(label.badgeFill?.toLowerCase() === '#ffffff' ? '#171717' : '#ffffff');
    expect.soft(card.shapeGaps.filter(shape => shape.textGap < shape.leftInset-.5), 'shape glyph gap').toEqual([]);
  }
  expect(await page.locator('[data-favorite-chart=bst] svg text').allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/%$/)]));
  await testInfo.attach('count-and-badge-spacing', {body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  await testInfo.attach('count-and-badge-screen', {body:await page.screenshot(),contentType:'image/png'});
});

test('color identifiers match row bars and retain categorical headers @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  await expect(page.locator('[data-favorite-chart=color]')).toHaveAttribute('aria-label','Pokémon Color');
  const evidence = await page.locator('[data-favorite-chart]').evaluateAll(cards => cards.filter(card => ['type','color','shape'].includes(card.getAttribute('data-favorite-chart') ?? '')).map(card => {
    const svg=card.querySelector('svg')!;
    return {dimension:card.getAttribute('data-favorite-chart'),headers:[...svg.querySelectorAll(':scope > text')].map(text=>text.textContent),rows:[...svg.querySelectorAll(':scope > g')].flatMap(row=>{
      const badge=row.querySelector('rect[rx]'),bar=row.querySelector(':scope > rect[rx="1"]'),text=row.querySelector('text[font-weight="700"]');
      if(!badge||!bar||!text)return [];
      return [{label:text.textContent,badge:badge.getAttribute('fill')?.toLowerCase(),bar:bar.getAttribute('fill')?.toLowerCase(),ink:text.getAttribute('fill')?.toLowerCase(),stroke:bar.getAttribute('stroke'),strokeWidth:Number(bar.getAttribute('stroke-width')),opacity:Number(bar.getAttribute('opacity'))}];
    })};
  }));
  expect(evidence).toHaveLength(3);
  for(const chart of evidence){
    expect(chart.headers).toContain(chart.dimension!.toUpperCase());
    expect(chart.rows.length).toBeGreaterThan(5);
    if(chart.dimension==='shape')continue;
    for(const row of chart.rows){expect(row.bar,`${chart.dimension}/${row.label} palette`).toBe(row.badge);expect(row.ink).toBe(row.badge==='#ffffff'?'#171717':'#ffffff');}
  }
  const colors=evidence.find(chart=>chart.dimension==='color')!.rows;
  expect(colors.find(row=>row.label==='WHITE')).toMatchObject({badge:'#ffffff',ink:'#171717',stroke:'#a3a3a3',strokeWidth:.75,opacity:1});
  const types=evidence.find(chart=>chart.dimension==='type')!.rows;
  for(const [color,type] of Object.entries({YELLOW:'ELECTRIC',PINK:'FAIRY',PURPLE:'POISON',GRAY:'NORMAL',BLUE:'WATER',BROWN:'GROUND',BLACK:'DARK',RED:'FIRE',GREEN:'GRASS'}))
    expect(colors.find(row=>row.label===color)?.badge,`${color} follows ${type}`).toBe(types.find(row=>row.label===type)?.badge);
  await testInfo.attach('painted-row-palette-and-headers',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  await page.locator('[data-favorite-chart=color]').scrollIntoViewIfNeeded();
  await testInfo.attach('color-chart-palette',{body:await page.screenshot(),contentType:'image/png'});
});

test('long shape names share one bounded painted text slot @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  await page.evaluate(()=>document.fonts.ready);
  const evidence=await page.locator('[data-favorite-chart=shape] svg').evaluate(svg=>[...svg.querySelectorAll(':scope > g')].flatMap(row=>{
    const text=row.querySelector('text[font-weight="700"]') as SVGTextElement|null,rect=row.querySelector('rect[rx]');
    if(!text||!rect)return [];
    const ctx=document.createElement('canvas').getContext('2d')!,style=getComputedStyle(text);
    ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.textAlign='center';
    const metrics=ctx.measureText(text.textContent??''),matrix=text.getScreenCTM()!,x=Number(text.getAttribute('x'));
    const left=new DOMPoint(x-metrics.actualBoundingBoxLeft,0).matrixTransform(matrix).x,right=new DOMPoint(x+metrics.actualBoundingBoxRight,0).matrixTransform(matrix).x,badge=rect.getBoundingClientRect();
    return [{label:text.textContent,left:(left-badge.left)/badge.width*199+.5,right:(right-badge.left)/badge.width*199+.5}];
  }));
  expect(evidence).toHaveLength(14);
  for(const row of evidence){expect(row.left,`${row.label} painted left`).toBeGreaterThanOrEqual(63.8);expect(row.right,`${row.label} painted right`).toBeLessThanOrEqual(185.2);}
  const capped=evidence.filter(row=>row.right>184.8);
  expect(capped.length,'multiple long labels reach the common cap').toBeGreaterThanOrEqual(3);
  for(const row of capped){expect(row.left).toBeCloseTo(64,0);expect(row.right).toBeCloseTo(185,0);}
  await testInfo.attach('actual-shape-ink-edges',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  await page.locator('[data-favorite-chart=shape]').scrollIntoViewIfNeeded();
  await testInfo.attach('shape-bounded-text-screen',{body:await page.screenshot(),contentType:'image/png'});
});

test('visible type and color badge interiors match actual bar pixels @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  const evidence=[];
  for(const dimension of ['type','color']){
    const chart=page.locator(`[data-favorite-chart=${dimension}]`);
    await chart.scrollIntoViewIfNeeded();
    const samples=await chart.locator('svg').evaluate(svg=>[...svg.querySelectorAll(':scope > g')].flatMap(row=>{
      const badge=row.querySelector('rect[rx]'),bar=row.querySelector(':scope > rect[rx="1"]'),text=row.querySelector('text[font-weight="700"]');
      if(!badge||!bar||!text)return [];
      const b=badge.getBoundingClientRect(),r=bar.getBoundingClientRect();
      if(b.top<0||b.bottom>innerHeight||r.width<3)return [];
      return [{label:text.textContent,badge:[b.right-b.height*.2,(b.top+b.bottom)/2],bar:[(r.left+r.right)/2,(r.top+r.bottom)/2]}];
    }));
    const png=await page.screenshot();
    const pixels=await page.evaluate(async({data,samples})=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const cv=document.createElement('canvas');cv.width=image.width;cv.height=image.height;const ctx=cv.getContext('2d')!;ctx.drawImage(image,0,0);
      const ratio=image.width/innerWidth;
      const rgb=(point:number[])=>[...ctx.getImageData(Math.round(point[0]*ratio),Math.round(point[1]*ratio),1,1).data];
      return samples.map(sample=>({label:sample.label,badge:rgb(sample.badge),bar:rgb(sample.bar)}));
    },{data:png.toString('base64'),samples});
    expect(pixels.length).toBeGreaterThan(4);
    for(const pixel of pixels)expect(pixel.bar,`${dimension}/${pixel.label} actual paint`).toEqual(pixel.badge);
    evidence.push({dimension,pixels});
    await testInfo.attach(`${dimension}-actual-paint`,{body:png,contentType:'image/png'});
  }
  await testInfo.attach('actual-categorical-RGBA',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});
