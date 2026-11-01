/* Writ · 主逻辑：书写格 ↔ 排版条目 ↔ 纸面预览 ↔ 导出三件套 */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);

  const pad = new WritPad($('#box'));
  const items = [];                 // glyph | gap | break
  const paper = $('#paper');
  const paperWrap = $('#paperWrap');
  const paperHint = $('#paperHint');
  const boxWrap = $('#boxWrap');
  const doneBtn = $('#doneBtn');
  const glyphMenu = $('#glyphMenu');
  const overlay = $('#exportOverlay');
  const exportCanvas = $('#exportCanvas');
  const toastEl = $('#toast');

  let selected = null;              // 选中的 glyph 条目
  let lastLayout = null;
  let paperCssScale = 1;
  let bgMode = 0;                   // 0 棋盘 / 1 浅色 / 2 深色
  let exportDataUrl = null;
  let toastTimer = 0;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const EXPORT_MAX_W = 1600;        // 导出图宽度上限（px），不放大原生分辨率

  /* ---------- 色板 ---------- */

  const PALETTE = [
    ['#1D1B20', '墨黑'], ['#FEFEFE', '雪白'], ['#6750A4', '紫罗兰'], ['#B3261E', '朱砂'],
    ['#006D3B', '松绿'], ['#00639A', '靛蓝'], ['#9A6400', '赭黄'], ['#BA1A1A', '绯红']
  ];

  function buildSwatches() {
    const wrap = $('#swatches');
    PALETTE.forEach(([hex, name], i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 0 ? ' active' : '');
      b.style.background = hex;
      b.title = name;
      b.addEventListener('click', () => pickColor(hex, b));
      wrap.appendChild(b);
    });
    const custom = document.createElement('label');
    custom.className = 'swatch custom';
    custom.style.background = 'conic-gradient(#B3261E, #9A6400, #006D3B, #00639A, #6750A4, #B3261E)';
    custom.title = '自定义颜色';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#1D1B20';
    input.addEventListener('input', () => pickColor(input.value, custom));
    custom.appendChild(input);
    wrap.appendChild(custom);
  }

  function pickColor(hex, el) {
    pad.setPen(hex, widthBase());
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }

  function widthBase() {
    return Number($('#penWidth').value) * 2;
  }

  /* ---------- 排版渲染 ---------- */

  function render() {
    const layout = WritEngine.layout(items);
    lastLayout = layout;
    const empty = layout.glyphCount === 0;
    paperHint.hidden = !empty;
    doneBtn.disabled = empty;
    if (empty) {
      paper.width = 1;
      paper.height = 1;
      paper.style.width = '0px';
      paper.style.height = '0px';
      return;
    }
    const cssW = Math.max(120, Math.min(paperWrap.clientWidth - 28, 520)); // 书写态下纸面隐藏（clientWidth 0），钳出个非零值即可
    const dpr = window.devicePixelRatio || 1;
    WritEngine.compose(paper, layout, cssW * dpr / layout.width);
    paper.style.width = cssW + 'px';
    paper.style.height = (layout.height * cssW / layout.width) + 'px';
    paperCssScale = cssW / layout.width;
    drawSelection();
  }

  function drawSelection() {
    if (!selected || !lastLayout) return;
    const p = lastLayout.placements.find(e => e.item === selected);
    if (!p) return;
    const ctx = paper.getContext('2d');
    const s = paperCssScale * (window.devicePixelRatio || 1);
    ctx.strokeStyle = '#6750A4';
    ctx.lineWidth = 3 * s;
    ctx.setLineDash([8 * s, 6 * s]);
    ctx.strokeRect(p.x * s - 4 * s, p.y * s - 4 * s, p.w * s + 8 * s, p.h * s + 8 * s);
    ctx.setLineDash([]);
  }

  /* ---------- 提交 / 飞行 ---------- */

  function commitGlyph() {
    const g = pad.commit();
    if (!g) {
      boxWrap.classList.remove('shake');
      void boxWrap.offsetWidth; // 重触发动画
      boxWrap.classList.add('shake');
      toast('格子里还是空的');
      return;
    }
    items.push(g);
    pad.clear();
    selected = null;
    glyphMenu.hidden = true;
    render();
    flyTo(g);
    if (navigator.vibrate) navigator.vibrate(8);
    if (items.length === 1) toast('已入列 · 点书写格右上 ⌄ 收起，预览整句');
  }

  /* ---------- 收起 / 展开 ---------- */

  $('#collapseBox').addEventListener('click', () => {
    document.body.classList.add('preview');
    requestAnimationFrame(render);
  });

  $('#expandBar').addEventListener('click', () => {
    document.body.classList.remove('preview');
    requestAnimationFrame(render);
  });

  /** 字形从书写格弹向收起按钮，淡出「入列」（书写态下预览隐藏，纸面不可作目标） */
  function flyTo(g) {
    if (reduceMotion || !lastLayout) return;
    if (document.body.classList.contains('preview')) return; // 收起态无书写，理论不达
    const boxRect = boxWrap.getBoundingClientRect();
    const dst = $('#collapseBox').getBoundingClientRect();
    const flyer = document.createElement('canvas');
    flyer.className = 'flyer';
    flyer.width = g.w;
    flyer.height = g.h;
    flyer.getContext('2d').drawImage(g.canvas, 0, 0);
    flyer.style.left = boxRect.left + 'px';
    flyer.style.top = boxRect.top + 'px';
    flyer.style.width = boxRect.width + 'px';
    flyer.style.height = boxRect.height + 'px';
    document.body.appendChild(flyer);
    const scale = 0.26;
    const dx = dst.left + dst.width / 2 - boxRect.left - (boxRect.width * scale) / 2;
    const dy = dst.top + dst.height / 2 - boxRect.top - (boxRect.height * scale) / 2;
    const anim = flyer.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
    ], { duration: 340, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    anim.onfinish = () => flyer.remove();
  }

  /* ---------- 编辑操作 ---------- */

  function removeItem(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    selected = null;
    glyphMenu.hidden = true;
    render();
  }

  paper.addEventListener('click', e => {
    if (!lastLayout) return;
    const r = paper.getBoundingClientRect();
    const x = (e.clientX - r.left) / paperCssScale;
    const y = (e.clientY - r.top) / paperCssScale;
    let hit = null;
    for (let i = lastLayout.placements.length - 1; i >= 0; i--) {
      const p = lastLayout.placements[i];
      if (p.item.type !== 'glyph') continue;
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) { hit = p.item; break; }
    }
    selected = hit === selected ? null : hit;
    glyphMenu.hidden = !selected;
    render();
  });

  $('#redoSelected').addEventListener('click', () => {
    if (!selected) return;
    pad.loadGlyph(selected);
    removeItem(selected);
    toast('改完记得再点「下一个」');
  });

  $('#delSelected').addEventListener('click', () => {
    if (selected) removeItem(selected);
  });

  /* ---------- 底部按钮 ---------- */

  $('#nextBtn').addEventListener('click', commitGlyph);

  $('#undoStrokeBtn').addEventListener('click', () => {
    if (!pad.undo()) toast('没有可撤销的笔画');
  });

  $('#backspaceBtn').addEventListener('click', () => {
    if (selected) { removeItem(selected); return; }
    if (!items.length) { toast('还没写内容'); return; }
    items.pop();
    render();
  });

  $('#spaceBtn').addEventListener('click', () => {
    items.push({ type: 'gap' });
    selected = null;
    glyphMenu.hidden = true;
    render();
  });

  $('#breakBtn').addEventListener('click', () => {
    items.push({ type: 'break' });
    selected = null;
    glyphMenu.hidden = true;
    render();
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!items.length && pad.isEmpty()) return;
    if (!window.confirm('清空所有已写内容？')) return;
    items.length = 0;
    pad.clear();
    selected = null;
    glyphMenu.hidden = true;
    render();
  });

  $('#bgToggle').addEventListener('click', () => {
    bgMode = (bgMode + 1) % 3;
    paperWrap.classList.remove('checker', 'light', 'dark');
    paperWrap.classList.add(['checker', 'light', 'dark'][bgMode]);
  });

  $('#penWidth').addEventListener('input', () => {
    const act = document.querySelector('.swatch.active');
    const hex = act && act.tagName === 'BUTTON' ? act.style.background : null;
    pad.setPen(hex || pad.color, widthBase());
  });

  /* ---------- 导出浮层 ---------- */

  doneBtn.addEventListener('click', () => {
    if (!lastLayout || !lastLayout.glyphCount) return;
    const scale = Math.min(1, EXPORT_MAX_W / lastLayout.width);
    WritEngine.compose(exportCanvas, lastLayout, scale);
    exportDataUrl = exportCanvas.toDataURL('image/png');
    overlay.hidden = false;
  });

  overlay.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'close') { overlay.hidden = true; return; }
    if (!exportDataUrl) return;
    if (window.Writ && window.Writ[act + 'Png']) {
      window.Writ[act + 'Png'](exportDataUrl);
    } else {
      // 浏览器开发模式兜底：原生桥不在，直接下载
      const a = document.createElement('a');
      a.href = exportDataUrl;
      a.download = 'writ.png';
      a.click();
      toast('浏览器预览模式：已触发下载');
    }
  });

  /* ---------- 杂项 ---------- */

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1900);
  }

  window.addEventListener('resize', render);

  /* ---------- 启动 ---------- */

  buildSwatches();
  pad.setPen(PALETTE[0][0], widthBase());
  render();
})();
