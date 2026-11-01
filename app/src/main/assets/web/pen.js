/* Writ · 书写格（Pointer Events + 压力变宽笔触）
 * 格子逻辑尺寸恒 1024²，显示自适应。ink 画布只存透明底墨迹；
 * display = 格线（基线+中线）叠 ink。手写笔走 pressure 变宽，手指恒宽。 */
window.WritPad = (function () {
  'use strict';

  const BOX = 1024;
  const BASELINE = Math.round(BOX * 0.74); // 基线在格内 74% 高度
  const ALPHA_THRESHOLD = 16;              // 裁边的墨迹阈值（抗锯齿边缘不算）

  class Pad {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = BOX;
      canvas.height = BOX;
      this.ctx = canvas.getContext('2d');

      this.ink = document.createElement('canvas');
      this.ink.width = BOX;
      this.ink.height = BOX;
      this.inkCtx = this.ink.getContext('2d', { willReadFrequently: true });

      this.guides = document.createElement('canvas');
      this.guides.width = BOX;
      this.guides.height = BOX;
      this._paintGuides();

      this.color = '#1D1B20';
      this.widthBase = 26;
      this.strokes = [];   // {color, widthBase, pts:[{x,y,p}], rn: 已画段数}
      this.baseImage = null; // 「重写」回灌的旧字形，重放时垫底
      this.active = null;

      canvas.addEventListener('pointerdown', e => this._down(e));
      canvas.addEventListener('pointermove', e => this._move(e));
      canvas.addEventListener('pointerup', e => this._end(e));
      canvas.addEventListener('pointercancel', e => this._end(e));
      canvas.style.touchAction = 'none';
      this._blit();
    }

    /* ---------- 输入 ---------- */

    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * BOX / r.width,
        y: (e.clientY - r.top) * BOX / r.height,
        p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0
      };
    }

    _down(e) {
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 老内核忽略 */ }
      this.active = { color: this.color, widthBase: this.widthBase, pts: [this._pos(e)], rn: 0 };
      this.strokes.push(this.active);
      // 起笔点：一个圆点，保证轻点也有墨
      const pt = this.active.pts[0];
      const ctx = this.inkCtx;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, this._width(this.active, pt, pt, 0) / 2, 0, Math.PI * 2);
      ctx.fill();
      this._blit();
    }

    _move(e) {
      if (!this.active) return;
      e.preventDefault();
      const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (let i = 0; i < evts.length; i++) this.active.pts.push(this._pos(evts[i]));
      this._drawNew();
      this._blit();
    }

    _end(e) {
      if (!this.active) return;
      e.preventDefault();
      this._drawNew();
      this.active = null;
      this._blit();
    }

    /* ---------- 渲染 ---------- */

    _width(stroke, p1, p2, t) {
      const base = stroke.widthBase;
      if (!p1.p && !p2.p) return base; // 手指：恒宽
      const pr = (p1.p || 0.5) * (1 - t) + (p2.p || 0.5) * t;
      return base * (0.35 + 1.3 * pr);
    }

    /** 中点二次曲线平滑 + 逐点变宽圆头，画 stroke 从 rn+1 起的新段 */
    _drawNew() {
      const stroke = this.active;
      if (!stroke) return;
      const pts = stroke.pts;
      const ctx = this.inkCtx;
      ctx.fillStyle = stroke.color;
      for (let i = stroke.rn + 1; i < pts.length; i++) {
        const p0 = pts[i - 2] || pts[i - 1];
        const p1 = pts[i - 1];
        const p2 = pts[i];
        const mx0 = (p0.x + p1.x) / 2;
        const my0 = (p0.y + p1.y) / 2;
        const cx = p1.x;
        const cy = p1.y;
        const mx1 = (p1.x + p2.x) / 2;
        const my1 = (p1.y + p2.y) / 2;
        const len = Math.hypot(mx1 - mx0, my1 - my0) + Math.hypot(cx - mx1, cy - my1);
        const n = Math.max(1, Math.ceil(len / 3));
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          const it = 1 - t;
          const x = it * it * mx0 + 2 * it * t * cx + t * t * mx1;
          const y = it * it * my0 + 2 * it * t * cy + t * t * my1;
          ctx.beginPath();
          ctx.arc(x, y, this._width(stroke, p1, p2, t) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        stroke.rn = i;
      }
    }

    _paintGuides() {
      const ctx = this.guides.getContext('2d');
      ctx.clearRect(0, 0, BOX, BOX);
      ctx.strokeStyle = 'rgba(29,27,32,.16)';
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 14]);
      // 基线
      ctx.beginPath();
      ctx.moveTo(40, BASELINE);
      ctx.lineTo(BOX - 40, BASELINE);
      ctx.stroke();
      // 竖中线
      ctx.beginPath();
      ctx.moveTo(BOX / 2, 40);
      ctx.lineTo(BOX / 2, BOX - 40);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _blit() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, BOX, BOX);
      ctx.drawImage(this.guides, 0, 0);
      ctx.drawImage(this.ink, 0, 0);
    }

    _replay() {
      const ctx = this.inkCtx;
      ctx.clearRect(0, 0, BOX, BOX);
      if (this.baseImage) ctx.drawImage(this.baseImage, 0, 0);
      for (let s = 0; s < this.strokes.length; s++) {
        const stroke = this.strokes[s];
        stroke.rn = 0;
        const saved = this.active;
        this.active = stroke;
        this._drawNew();
        this.active = saved;
      }
      this._blit();
    }

    /* ---------- 对外 API ---------- */

    setPen(color, widthBase) {
      this.color = color;
      this.widthBase = widthBase;
    }

    undo() {
      if (!this.strokes.length) return false;
      this.strokes.pop();
      this._replay();
      return true;
    }

    clear() {
      this.strokes = [];
      this.baseImage = null;
      this.inkCtx.clearRect(0, 0, BOX, BOX);
      this._blit();
    }

    isEmpty() {
      return !this.strokes.length && !this.baseImage;
    }

    /** 提交当前字：裁墨迹外接框，返回字形（含基线锚定量）；空白返回 null */
    commit() {
      const data = this.inkCtx.getImageData(0, 0, BOX, BOX).data;
      let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let y = 0; y < BOX; y++) {
        const row = y * BOX * 4;
        for (let x = 0; x < BOX; x++) {
          if (data[row + x * 4 + 3] > ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(this.ink, minX, minY, w, h, 0, 0, w, h);
      return {
        type: 'glyph',
        canvas: c,
        w: w,
        h: h,
        ascent: BASELINE - minY, // 墨迹顶到基线
        descent: maxY - BASELINE // 基线到墨迹底（低位标点为小值）
      };
    }

    /** 「重写」：把已提交字形灌回书写格居中，接基线，可再改再交 */
    loadGlyph(g) {
      this.clear();
      this.baseImage = document.createElement('canvas');
      this.baseImage.width = BOX;
      this.baseImage.height = BOX;
      this.baseImage.getContext('2d')
        .drawImage(g.canvas, (BOX - g.w) / 2, BASELINE - g.ascent, g.w, g.h);
      this.inkCtx.drawImage(this.baseImage, 0, 0);
      this._blit();
    }
  }

  Pad.BOX = BOX;
  Pad.BASELINE = BASELINE;
  return Pad;
})();
