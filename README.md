# Crisp Reading Rail

Crisp Reading Rail adds a compact reading-progress and heading-navigation rail to the right edge of each eligible Obsidian Markdown Reading view. Its proportional heading marks, orb-centered focus line, animated wave, and optional orbs sit alongside the visual language of Crisp File Explorer without occupying Obsidian's native right sidebar.

## v0.4.0 Reading Memory & Outline Control

- 在本地保存最近 500 篇笔记的上次阅读位置，并在每次打开的阅读会话中显示一个固定菱形标记；点击标记或运行 `Jump to last reading position` 即可返回。
- 新建阅读标记时同时记录所在标题的文字、层级和源码行。标题位置变化后优先重新锚定到同一语义标题，找不到可靠匹配时才回退到原百分比。
- 旧版纯数字标记会在读取时无损兼容，不需要手动迁移 `data.json`。
- 设置中可选择只索引 H2、H2–H3 或 H2–H4，也可只展开当前 H2 分支；全文标题刻度仍然保留。
- 每篇笔记可通过 frontmatter 独立关闭轨道、覆盖标题层级或切换当前 H2 分支模式。
- 聚焦轨道后按 `P` 固定/释放大纲，`Escape` 释放并收起，`J`/`K` 静音跳到下一个/上一个标题；也可运行 `Toggle pinned outline`。

## v0.3.32 Reliability & Trust

- 授权设置现在明确说明本地 Ed25519 验签、在线设备数量校验、离线回退，以及在线请求所包含的数据。
- 相同许可证与产品的验证请求在会话内合并并缓存 15 分钟；修改许可证或手动重新验证会立即清除缓存。
- 相同标题与标记数据不再重建 Waypoint DOM，重复显隐也不再触发无效测量。
- 长文持续虚拟化产生的结构变化改为尾随防抖，只在变化稳定后刷新一次。
- 波浪只更新影响半径内的刻度，并正确复位离开半径的刻度，降低滚动过程中的样式写入量。

## v0.3.31 behavior

- 修复音阶音效在独立窗口中没有使用该窗口 AudioContext、导致拖动刻度时静音的问题。
- Crisp 系列授权产品名单补齐 Crisp Organize 与 Crisp Base，并更新开发依赖与版本信息。

## v0.3.27 behavior

- `Cycle orb style` 命令现在与设置页一致校验许可证：未激活用户无法通过命令面板切换到付费小球（原命令绕过设置页的许可证闸门）。
- 音效 AudioContext 改为按 owner window 缓存（WeakMap）：popout 独立窗口里的阅读轨道拖动音效使用该窗口自己的 AudioContext，不再绑定主窗口；销毁时统一关闭所有窗口的 context。

## v0.3.28 behavior

- 全部 35 款 orb 素材改为内联（26 个 SVG 直接嵌入 + 3 个角色 PNG 以 base64 内嵌），BRAT / 社区市场安装不再依赖仓库 `assets/` 文件夹，付费小球在任意安装方式下都能正常显示。

## v0.3.29 behavior

- 修复内联 SVG 时误删子元素 class 导致 character4 变成纯黑的问题：现在只规范化根 `<svg>` 标签，保留元素级 class 与 `<style>` 填充定义。

## v0.3.30 behavior

- 设置页全面汉化：分组标题、设置项与描述改为中文；小球素材名称保持英文，音效风格选项已汉化。

## v0.3.26 behavior

- Strips inline Markdown formatting (`**`, `*`, `__`, `_`, `~~`, `` ` ``, `==`, `%%`) from heading labels in the dense scrollable outline so that raw syntax never appears — labels now match Reading view text.

## v0.3.25 behavior

- Refines the dense outline into a full-height panel that matches the reading
  pane and auto-scales with the window, adapts its width to the longest label,
  and wraps heading text instead of truncating it.

- Keeps every H2-H4 label reachable in very long notes: when the labels can no
  longer fit the track, the expanded outline switches to a scrollable list that
  follows the active heading instead of squeezing overlapping labels together.

- Adds `About Crisp Reading Rail` to the bottom of the settings page with the
  plugin's core purpose and the linked author attribution.

- Works in Markdown Reading view on desktop Obsidian.
- Defers width-only outline measurements until pane resizing settles, while keeping height changes and the 680 px visibility threshold responsive.
- Displays Crisp Annotations headings by their annotated target text while excluding annotation notes and directives from the rail label.
- Displays Markdown links and aliased Obsidian wiki links as their visible heading labels, matching Reading view instead of exposing link syntax or destinations.
- Shows borderless progress from `0.00` to `1.00`, completed-tick state, content-proportional H2-H4 marks, and a spring-following current-position orb.
- Uses only a short, fading line centered on the orb; there is no persistent full-height vertical rule.
- Bends nearby fine and heading marks leftward in a natural wave while scrolling. Reduced-motion mode snaps directly to the reading position.
- Reveals H2, H3, and H4 labels when the pointer comes within 96px, on hover, or on keyboard focus. Labels remain clickable for three seconds after leaving.
- Coalesces pointer proximity measurements to one layout read per animation frame.
- Wraps long labels to at most three lines and uses their measured heights to prevent collisions without changing document layout.
- Keeps repeated keyboard navigation cumulative, immediate, and silent instead of restarting smooth movement.
- Follows Crisp File Explorer orb changes without reacting to its own DOM mutations, including when the companion orb loads later.
- Clicking a label glides to its heading with the orb aligned to the same heading mark. Clicking the track jumps to the corresponding document position.
- Dragging the orb scrubs the document continuously and stays locked to the pointer even while Obsidian virtualizes a long note.
- Double-clicking the track, or pressing `M` while the slider is focused, saves a reading waypoint for the current note. Waypoints persist across reloads and support click, keyboard activation, keyboard deletion, and context-menu deletion.
- Saved waypoints follow note or folder renames and are removed when their note or parent folder is deleted.
- Reaching the end of a note plays an optional completion chime and uses a short position-safe celebration that respects reduced-motion preferences.
- Adds Obsidian commands for next heading, previous heading, navigation-sound toggle, and orb-style cycling without assigning global hotkeys.
- Hides when the pane is narrower than 680 px or the note does not scroll.
- Restores a narrow native scrollbar when the pane is scrollable but too narrow to show the rail, including themes that globally hide scrollbars.
- Keeps its heading labels collapsed while Crisp Annotations occupies the right margin, leaving the progress track and orb available without covering notes.
- Gives every side-by-side Reading pane an independent rail.

## Orb style setting

Open **Settings → Crisp Reading Rail → Orb style** to choose Default, Random per day, 35 material/character styles, or **Follow Crisp File Explorer**. Follow mode observes only the companion orb's live `data-orb-style` value in the same Obsidian window; if it is unavailable, the rail uses Default.

All SVG and PNG resources used by Crisp Reading Rail are installed in this plugin's own `assets/` directory. It does not read Crisp File Explorer's files or private settings at runtime.

## Navigation sound setting

Open **Settings → Crisp Reading Rail → Navigation sound** to opt into very soft interaction feedback. Sound is off by default. When enabled, dragging across heading marks produces rate-limited quiet ticks, while track clicks, heading selections, and normal drag release use a subtle settle tone. Sound style can be selected independently or follow Crisp File Explorer; release/settle feedback can be muted separately.

Normal wheel, touchpad, touch, keyboard, and programmatic scrolling remains silent. Sounds are synthesized locally with Web Audio; the plugin contains no audio files.

## Keyboard interaction

Focus the rail's single reading-position slider, then use:

- Arrow keys to move by 1%.
- Page Up and Page Down to move by 10%.
- Home and End to move to the beginning or end.
- M to save a waypoint at the current reading position.
- P to pin or unpin the expanded outline.
- J and K to move to the next or previous heading immediately and silently.
- Escape to unpin and collapse the outline.
- Tab to reach visible native heading buttons.
- Delete or Backspace to remove a focused waypoint.

Keyboard handling is local to the focused rail. The plugin does not register default hotkeys, intercept Obsidian shortcuts globally, or play navigation sounds for slider key presses. Reduced-motion preferences replace smooth navigation with immediate movement.

## Per-note outline control

Global defaults live in **Settings → Crisp Reading Rail → 大纲与阅读轨道交互**. A note can override them in frontmatter:

```yaml
---
crisp-reading-rail: false       # disable the rail for this note
crisp-reading-rail-levels: 3    # 2, 3, or 4
crisp-reading-rail-scope: current-h2  # all or current-h2
---
```

These keys are read-only preferences: the plugin never writes them into a note.

## Local installation

For the prebuilt release ZIP:

1. Unzip the archive.
2. Copy its `crisp-reading-rail` folder into your vault's `.obsidian/plugins/` directory.
3. In Obsidian, open **Settings → Community plugins**, reload plugins, and enable **Crisp Reading Rail**.

The release archive intentionally omits `data.json`, so it installs with neutral defaults and contains no vault-specific settings.

For development from source:

1. Run `npm ci` and `npm run build`.
2. Run `npm run deploy -- "/path/to/your/vault"`.
3. In Obsidian, open **Settings → Community plugins**, reload plugins if needed, and enable **Crisp Reading Rail**.

The deployment command copies `main.js`, `manifest.json`, `styles.css`, and the complete `assets/` directory into `.obsidian/plugins/crisp-reading-rail`. Existing `data.json` settings are preserved.

## Privacy and safety

Crisp Reading Rail does not collect telemetry, edit notes, change files, or alter the workspace layout. It reads only the metadata and rendered headings for currently open Markdown Reading panes. Reading memory and semantic waypoints stay in the plugin's local `data.json`; reading-memory history is capped at the 500 most recently updated notes.

License validation first verifies the Ed25519 signature locally. When a license is present, activation and premium-feature checks send the license code, an Obsidian device/vault identifier, and the target plugin ID to the Crisp license service to enforce the device limit. Successful or failed results are cached in memory for 15 minutes to avoid repeated requests in the same session. If the service is unreachable, a locally valid signature remains usable through the documented offline fallback.

## Known exclusions

The plugin does not support Live Preview, Source mode, mobile layouts, native Outline replacement, embedded-note headings, or H1/H5/H6 navigation.

## Development

- `npm test` runs the Vitest suite.
- `npm run lint` checks source and tests.
- `npm run build` type-checks and creates the production `main.js` bundle.
- `npm run check` runs the complete automated gate.

## License

MIT
