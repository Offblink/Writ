# Design: Writ

> O, learn to read what silent love hath writ.
> —— 莎士比亚十四行诗第 23 首

## Problem

写字的人只想写字：不识别、不上输入法候选，把每一笔墨迹当图形切片，
按手写顺序流式排版成一张**上下同宽、透明底**的矩形 PNG，直接发出去。
「见字如面」——字即本人，图即话语。

## Context

- 设计语言来自 [Mobile-Design](https://github.com/Offblink/Mobile-Design)（`shared/tokens.css`
  原样拷入 `assets/web/tokens.css`），组件风格取 android-m3。
- 工程模式复用 [Offblink/Spore-Mobile](https://github.com/Offblink/Spore-Mobile) 的
  原生壳 + `assets/web/` 零构建 WebView（纯 HTML/CSS/JS，无 ES modules、无 fetch、无 CDN）。
- 命名 **Writ**：古英语「写下之物」+ writ large「放大」双关——手写字被排成大图寄出；
  与既有项目 TRead（句读）读写成对。

## 已锁定的四个决定（2026-11-01 与用户核对）

| 轴 | 决定 | 理由 |
|---|---|---|
| 形态 | **独立 App**，非系统输入法 | IME 协议只能提交文本，无法向聊天框注入图片 |
| 输出 | 分享面板 + 存相册 + 剪贴板三件套 | 覆盖直发微信/QQ、留存、粘贴三条路径 |
| 排版 | **裁边流式 + 基线锚定** | 自然手写体、字距随字宽、画作自然占位；等方格稿纸感否决 |
| 设计 | M3 Expressive 主体 + Blinvo zoom 转场 | chrome 全 M3；预览→导出整页放大为签名时刻 |

## 架构

```
原生（Kotlin/Java 壳）              Web（assets/web，零构建）
├─ MainActivity  ←── WebView ──→  ├─ index.html / writ.css（M3 皮）
│   边到边 + 系统栏透明             ├─ tokens.css（Mobile-Design 原样）
├─ WritHost（JS 桥 "Writ"）        ├─ pen.js（书写格：Pointer Events）
│   savePng / sharePng / copyPng   ├─ engine.js（排版引擎，纯数学）
│   MediaStore / FileProvider      └─ app.js（装配 + 导出 + 飞行动效）
└─ FileProvider(cache/share)
```

- 全部程序化绘制，canvas 不会被跨源污染，`toDataURL` 永远安全。
- 桥接口：`Writ.savePng(dataUrl)` / `Writ.sharePng(dataUrl)` / `Writ.copyPng(dataUrl)`；
  浏览器开发模式（无桥）自动兜底为下载。

## 核心算法

1. **书写格**：逻辑尺寸恒 1024²，基线在 74% 高度；手写笔走 `pressure` 变宽，
   手指恒宽；中点二次曲线平滑 + 逐点圆头。
2. **提交（下一个）**：扫 ink 画布 alpha>16 求墨迹外接框 → 裁出字形，记录
   `ascent = 基线 − 顶`、`descent = 底 − 基线`（「，」这类低位标点 ascent 可为负——
   **基线锚定是全项目最容易翻车的点，标点不锚基线就会漂在半空**）。
3. **流式排版**（`engine.js`，纯函数可独立测试）：行宽超 `7.5 × 盒宽` 即换行；
   字距 0.18 盒、行距 0.25 盒、四周留白 0.35 盒；行高 = 行内最大 ascent+descent，
   逐字基线对齐；「空格」占 0.5 盒宽、「换行」强制断行。
4. **成图**：宽度 = 最宽行（上下同宽的矩形），短行尾部自然留白；透明底；
   导出宽度上限 1600px 且绝不放大原生分辨率。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 标点漂浮（裁边后「，」又小又低） | 基线锚定：ascent 可负，行高取 max(ascent+descent) |
| WebView 压力感应差异 | `pointerType==='pen'` 才信 pressure，手指恒宽 |
| 大图导出内存 | 预览按屏宽合成；导出 ≤1600px 宽、单画布一次成型 |
| JS→Java 大字符串 | dataURL 数 MB 级；桥方法本就在非 UI 线程 |
| 系统减动效 | tokens.css 全局降级 + 飞行字形 matchMedia 跳过 |

## 交互（v1.1，2026-11-01 首轮实测反馈修正）

- 书写态默认全屏书写格、**隐藏预览条**——矮条裁字不如不显示；右上 ⌄ 收起进入预览态
- 预览态整屏棋盘格展示整句，点字删除/重写，底部「⌃ 展开书写」返回
- 首次入列 toast 引导收起预览；入列飞行目标从纸面槽位改为 ⌄ 按钮（预览隐藏时纸面不可见）
- 色板 active 紫环 `inset:-5px` 曾被 `overflow-x:auto` 容器上下裁切 → 容器纵向 padding 提到 8px

## 交互（v1.2，2026-11-01 第二轮实测反馈）

- 预览**禁滚、整句 contain 缩放一屏全见**——滚动窗口里长高=看不见=无响应（用户定论）
- 编辑键（退格/空格/换行）移入预览态，撤销笔画留书写态；✓ 顶栏恒最右、两态不跳位
- 末尾换行保留整行高空行；连按换行叠加多空行（引擎单测钉住：stacked breaks）
- 收起/展开弹簧动画（max-height+opacity+scale）；清空确认、取色盘全 web 自绘（拒绝原生控件）
- 操作结果 toast 由原生桥回吐 web 层绘制；仅系统分享面板保留原生形态（平台约束，微信接收必经）

## 交互（v1.3，2026-11-01 真机首装反馈）

- 顶栏钻状态栏：老 WebView `env(safe-area-inset-*)` 返回 0 → 原生读 WindowInsets 注入
  `--safe-top/--safe-bottom`（head 内联 `__setInsets` 预置），CSS 变量优先、env() 兜底
- 书写格虚线改**正中十字**（基线 74%→50%），上下左右对称居中

## Open Questions（v2 再议）

- 竖排（右起竖行）开关
- 行宽（每行字数）调节；当前固定 7.5 盒宽
- 笔锋：速度→宽度的收笔渐细
- 槽位九宫格辅助线开关、草稿持久化
