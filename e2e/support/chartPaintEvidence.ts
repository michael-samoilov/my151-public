import type { Page } from '@playwright/test';

/** Observe actual painted Canvas paths, including their transforms, before the app loads. */
export async function observeChartPaint(page: Page) {
  await page.addInitScript(`(() => {
    if (window.chartPaintObserved) return; window.chartPaintObserved = true;
    window.chartLines = []; window.chartCircles = []; window.chartBadges = []; window.chartBadgeTexts = [];
    const paths = new WeakMap();
    const proto = CanvasRenderingContext2D.prototype;
    const round = proto.roundRect, text = proto.fillText;
    proto.roundRect = function(x,y,w,h,radii) {
      if (w / h > 4.8 && w / h < 5.3) {
        const matrix=this.getTransform(), a=new DOMPoint(x,y).matrixTransform(matrix), b=new DOMPoint(x+w,y+h).matrixTransform(matrix);
        window.chartBadges.push({width:this.canvas.width,left:a.x,top:a.y,right:b.x,bottom:b.y});
      }
      return round.call(this,x,y,w,h,radii);
    };
    proto.fillText = function(value,x,y,maxWidth) {
      if(/^(700|bold) /.test(this.font)) {
        const m=this.measureText(value), matrix=this.getTransform();
        const a=new DOMPoint(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent).matrixTransform(matrix);
        const b=new DOMPoint(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent).matrixTransform(matrix);
        window.chartBadgeTexts.push({text:value,width:this.canvas.width,left:a.x,top:a.y,right:b.x,bottom:b.y});
      }
      return maxWidth===undefined?text.call(this,value,x,y):text.call(this,value,x,y,maxWidth);
    };
    const arc = proto.arc;
    proto.arc = function(x,y,r,start,end,ccw) {
      const matrix=this.getTransform(), center=new DOMPoint(x,y).matrixTransform(matrix);
      window.chartCircles.push({width:this.canvas.width,height:this.canvas.height,x:center.x,y:center.y,r:r*Math.hypot(matrix.a,matrix.b)});
      return arc.call(this,x,y,r,start,end,ccw);
    };
    const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke;
    proto.beginPath = function () { paths.set(this, []); return begin.call(this); };
    const record = (ctx, x, y) => {
      const point = new DOMPoint(x, y).matrixTransform(ctx.getTransform());
      paths.get(ctx)?.push({ x: point.x, y: point.y });
    };
    proto.moveTo = function (x, y) { record(this, x, y); return move.call(this, x, y); };
    proto.lineTo = function (x, y) { record(this, x, y); return line.call(this, x, y); };
    proto.stroke = function (path) {
      if (!path) window.chartLines.push({ width: this.canvas.width, height: this.canvas.height, color: String(this.strokeStyle), points: [...paths.get(this) ?? []] });
      return path ? stroke.call(this, path) : stroke.call(this);
    };
  })()`);
}
export async function paintedAxes(page: Page) {
  return page.evaluate(() => {
    const target = window as unknown as { chartLines: { width: number; height: number; color: string; points: { x: number; y: number }[] }[] };
    // Real butterfly zero lines are vertical muted strokes. Keep source canvas dimensions
    // and top/bottom, so charts in different native columns can be compared locally.
    return target.chartLines.filter(record => record.color === '#737373' && record.points.length === 2 && Math.abs(record.points[0].x - record.points[1].x) < .001 && record.points[1].y - record.points[0].y > 20);
  });
}
