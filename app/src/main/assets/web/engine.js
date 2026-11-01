/* Writ · 排版引擎（纯数学，无 DOM 状态）
 * items: glyph（裁边字形：w/h 为墨迹尺寸，ascent/descent 以书写格基线为轴——
 *        ascent=墨迹顶到基线的距离，descent=基线到墨迹底；「，」这类低位标点
 *        ascent 可为负，靠基线锚定就不会漂在半空）
 *      | gap（手动空格）| break（强制换行）
 * 排版规则：行宽超过 wrapEm×盒宽即换行；行高=行内最大 ascent+descent（基线对齐）；
 * 成图宽度=最宽行（上下同宽的矩形），短行尾部自然留白。 */
window.WritEngine = (function () {
  'use strict';

  const GAP_RATIO = 0.18;    // 字间距 = 盒宽 × 0.18
  const LEAD_RATIO = 0.25;   // 行间空 = 盒宽 × 0.25
  const MARGIN_RATIO = 0.35; // 四周留白 = 盒宽 × 0.35
  const GAP_W_RATIO = 0.5;   // 手动空格宽 = 盒宽 × 0.5

  function newRow() {
    return { items: [], width: 0, ascent: 0, descent: 0 };
  }

  function layout(items, opts) {
    opts = opts || {};
    const box = opts.box || 1024;
    const wrapEm = opts.wrapEm != null ? opts.wrapEm : 7.5;
    const gap = box * GAP_RATIO;
    const lead = box * LEAD_RATIO;
    const margin = box * MARGIN_RATIO;
    const maxW = wrapEm * box;

    const rows = [];
    let row = newRow();
    rows.push(row);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type === 'break') {
        // 连按换行要能叠出多个空行（用户反馈：三行之后再按无响应）。
        // 仅当整篇还没内容时的引导 break 才忽略（没东西可断）。
        if (row.items.length || rows.length > 1) {
          row = newRow();
          rows.push(row);
        }
        continue;
      }
      const w = it.type === 'gap' ? box * GAP_W_RATIO : it.w;
      if (row.items.length && row.width + gap + w > maxW) {
        row = newRow();
        rows.push(row);
      }
      if (row.items.length) row.width += gap;
      row.items.push({ item: it, x: row.width, w: w });
      row.width += w;
      if (it.type === 'glyph') {
        if (it.ascent > row.ascent) row.ascent = it.ascent;
        if (it.descent > row.descent) row.descent = it.descent;
      }
    }

    // 有字才谈排版；全空返回零尺寸
    const hasGlyph = rows.some(r => r.items.some(e => e.item.type === 'glyph'));
    if (!hasGlyph) return { width: 0, height: 0, placements: [], glyphCount: 0 };

    let contentW = 0;
    let y = margin;
    let glyphCount = 0;
    const placements = [];
    for (let r = 0; r < rows.length; r++) {
      const rr = rows[r];
      // 行高：有内容取 max(ascent+descent, 0.1盒)；末尾空行（换行键按下）给一整行 0.75 盒——
      // 不可见的状态变化等于没按（用户实测反馈：换行"无响应"）
      const h = rr.items.length ? Math.max(rr.ascent + rr.descent, box * 0.1) : box * 0.75;
      for (let k = 0; k < rr.items.length; k++) {
        const e = rr.items[k];
        const isGlyph = e.item.type === 'glyph';
        placements.push({
          item: e.item,
          x: margin + e.x,
          y: y + rr.ascent - (isGlyph ? e.item.ascent : 0),
          w: e.w,
          h: isGlyph ? e.item.h : 0
        });
        if (isGlyph) glyphCount++;
      }
      if (rr.width > contentW) contentW = rr.width;
      y += h + lead;
    }

    return {
      width: contentW + margin * 2,
      height: y - lead + margin,
      placements: placements,
      glyphCount: glyphCount
    };
  }

  /** 把排版结果合成进 canvas（透明底）；scale = 布局单位 → 画布像素 */
  function compose(canvas, res, scale) {
    canvas.width = Math.max(1, Math.round(res.width * scale));
    canvas.height = Math.max(1, Math.round(res.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < res.placements.length; i++) {
      const p = res.placements[i];
      if (p.item.type !== 'glyph') continue;
      ctx.drawImage(p.item.canvas,
        Math.round(p.x * scale), Math.round(p.y * scale),
        Math.max(1, Math.round(p.w * scale)), Math.max(1, Math.round(p.h * scale)));
    }
  }

  return {
    layout: layout,
    compose: compose,
    GAP_RATIO: GAP_RATIO,
    LEAD_RATIO: LEAD_RATIO,
    MARGIN_RATIO: MARGIN_RATIO,
    GAP_W_RATIO: GAP_W_RATIO
  };
})();
