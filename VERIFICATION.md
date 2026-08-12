# Crisp Reading Rail verification

## v0.4.0 Reading Memory & Outline Control

Verified on 2026-08-12 in the isolated release worktree.

### Added

- Debounced per-note reading memory with a fixed session resume marker and active-pane command.
- Semantic waypoint records with source-line/text re-anchoring and legacy numeric migration.
- Global H2/H3/H4 depth and all/current-H2 scope preferences plus three frontmatter overrides.
- Pane-local pinned outline with P, Escape, J, K and an active-pane command.
- Rename/delete handling and 500-note pruning for both waypoints and reading memory.

### Automated gate

- Pure data, controller, view, registry, settings, keyboard, DOM-stability, and motion regressions are included in the full suite.
- `npm run check` passed with 18 test files and 142 tests, followed by ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, version consistency, and `git diff --check`.
- `npm audit --omit=dev` reported 0 vulnerabilities.

### Deployment and live Obsidian acceptance

- The repository deploy script copied only runtime files and owned assets to ALL and YS. Both pre-existing `data.json` files were byte-preserved by deployment; each vault retained its independent orb, sound, license, and waypoint state.
- Source, ALL, and YS runtime hashes match: `main.js` `fabc04094d5626faa3bb63eecf2f8ce896d4fa2a5e8bcfcdd20a0dc8f28f78be`; `manifest.json` `595e45cbb7614dfbd5811f0f904c19f01a3da648034719639f7f69fc6c67608c`; `styles.css` `0bfa81313ecd8ad8ae8277722c1a6f06090fa0bce5303c7dcac4bbe3fd664ac5`. Asset inventories and bytes also match.
- ALL and YS reloaded `0.4.0`; both reported `No errors captured.`. Live DOM checks verified one pane-local resume marker, P pinning, Escape unpin/collapse, current-H2 label filtering while retaining all heading ticks, semantic waypoint re-anchoring, and a fixed resume position while progress changed.
- ALL's normal post-reload reading activity created its first local reading-memory entry, confirming debounced persistence. YS's two legacy numeric-waypoint notes normalized in memory to semantic `{ progress }` records without editing Markdown.

### Motion review

- New pinning reuses the existing opacity/transform expansion; no layout-property transition or new continuous animation was added.
- Current-H2 filtering and the resume marker are state changes without decorative motion. Existing reduced-motion behavior continues to govern spring navigation and celebration.

## v0.3.32 Reliability & Trust

Verified on 2026-08-12 in the isolated release worktree.

### Fixed

- License checks now deduplicate concurrent requests and cache per license/product result for 15 minutes; editing the license or requesting a manual recheck clears the cache.
- Settings and README now disclose local Ed25519 verification, online device-limit verification, the transmitted identifiers, and offline fallback behavior.
- Unchanged waypoint data and repeated visibility state no longer rebuild DOM or repeat label measurements.
- Structural mutation refreshes use trailing debounce during continuous Reading-view virtualization.
- Wave rendering updates only ticks inside the dynamic radius while resetting ticks that leave it.

### Automated gate

- Focused cache, controller, view, and motion regression tests passed before the full release gate.
- `npm run check` passed with 16 test files and 129 tests, followed by ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, version consistency, and `git diff --check`.

## v0.3.26 Inline Markdown stripping in dense outline

Verified on 2026-08-07 in the ALL vault.

### Fixed

- `headingTextFromMarkdown()` now strips inline formatting markers (`**`, `*`, `__`, `_`, `~~`, `` ` ``, `==`, `%%`, residual `#`) from heading labels. Previously, long documents with many headings triggered the virtualized source-text path, which passed raw Markdown syntax (e.g. `**bold**`, `~~deleted~~`) into the dense scrollable outline labels.

### Automated gate

- `npm run check` passed with 13 test files and 120 tests (heading-text tests 2 → 13), followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL/YS 均已部署 0.3.26 并重载，`dev:errors` 均为 `No errors captured.`；运行版本 `{"loaded":true,"version":"0.3.26"}`。
- 待用户在含 `**bold**`/`~~strike~~`/`` `code` `` 等行内格式的长文档中手工确认密集滚动列表标签已清除 Markdown 标记。

## v0.3.22 Expanded character library

Verified on 2026-08-04 in the ALL vault.

### Added

- 新增 Character 4、Character 5 两种静态人物 Orb（SVG 素材），静态人物总数 9 → 11
- 设置菜单与 Random per day 列表扩展至 35 种材质/人物样式

### Automated gate

- `npm run check` passed with 13 test files and 107 tests, followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL 重载后 `dev:errors` 无错误；Character 4/5 以 24px 静态人物渲染，居中无偏移

## v0.3.21 Static character orb sizing

Verified on 2026-08-04 in the ALL vault.

### Changed

- 静态人物 Orb（Character 1-3、Snorlax、Pikachu、Snorlax Face、Batman、Superman、Spider-Man）从 22px 放大至 24px，居中位置不变
- 旋转类与其它图片 Orb 保持 22px 不变

### Automated gate

- `npm run check` passed with 13 test files and 107 tests, followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL 重载后 `dev:errors` 无错误；orb 中心与轨道竖线中心保持一致（24px 放大后中心无偏移）

## v0.3.20 Orb asset polish

Verified on 2026-08-04 in the ALL and YS vaults.

### Changed

- Batman、Superman、Spider-Man 三个 Orb 素材去除白色背景与白色高光，仅保留图案主体，透明背景直接贴合轨道
- 自动门禁与真实 Obsidian 重载验证通过，样式数量与设置菜单保持不变

### Automated gate

- `npm run check` passed with 13 test files and 106 tests, followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL 和 YS 重载两个插件后 `dev:errors` 均无错误
- Runtime files (main.js, manifest.json, styles.css, assets/) 在 ALL、YS 之间字节一致；各 vault 保留各自 `data.json`

## v0.3.19 Expanded orb library

Verified on 2026-08-04 in the ALL and YS vaults.

### Added

- Angry、Squint、Face Mask、Poker Face、Captain America Shield 五种可旋转表情/盾牌 Orb，沿用 Shut Up 的固定中心旋转逻辑
- Batman、Superman、Spider-Man 三种静态人物 Orb，沿用 Pikachu 的直立静态逻辑（不随滚动旋转）
- 设置菜单与 Random per day 列表同步扩展至 33 种材质/人物样式

### Automated gate

- `npm run check` passed with 13 test files and 106 tests, followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL 和 YS 重载 `crisp-file-explorer` 与 `crisp-reading-rail` 后 `dev:errors` 均无错误
- 8 个新资源在 ALL/YS 两个 vault 中均能通过两个插件的资源路径成功加载
- Runtime files (main.js, manifest.json, styles.css, assets/) 在 ALL、YS 之间字节一致；各 vault 保留各自 `data.json`

## v0.3.18 License verification and requestUrl update

Verified on 2026-07-31 in the ALL, YS, and test obsidian vaults.

### License verification

- The Ed25519 public key was rotated and the legacy key was removed: plugins and the Cloudflare Worker now accept only codes signed with the current key.
- Online device checks now use Obsidian `requestUrl` instead of `fetch` (Electron/CSP safe), consistent with the other Crisp plugins.
- Old-signed codes are rejected by both the plugins and the Worker `verify-device` endpoint; newly issued codes activate with the device limit enforced.

### Automated gate

- `npm run check` passed with 13 test files and 106 tests, followed by ESLint, TypeScript, and a production build.

### Live Obsidian acceptance

- ALL and YS both loaded Crisp Reading Rail `0.3.18` with no captured errors (`dev:errors` clean).
- Runtime files (main.js, manifest.json, styles.css, assets/) were byte-identical across ALL, YS, and test obsidian; each vault kept its own `data.json`.

## v0.3.14 Border and Crisp Annotations coexistence

Verified on 2026-07-28 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Narrow-pane fallback

- Reproduced the Border Style Settings state with `Components@@scrollbar-hide` enabled.
- Forced the active YS Reading pane from 1494.5 px to 660 px while the note remained scrollable.
- The rail hid at its 680 px threshold, the preview gained `crisp-reading-rail-native-scrollbar`, and the computed `scrollbar-width` became `thin`.
- Restoring the pane width made the rail visible again and removed the fallback class.

### Crisp Annotations coexistence

- Temporarily exercised Crisp Annotations' right-margin layout without saving the setting.
- A 1494.5 px pane with 317.25 px of right margin rendered three right-margin annotations while reserving the visible rail's 40 px footprint plus an 8 px safety gap.
- The pane gained `crisp-reading-rail-avoid-right-annotations`, the rail heading-label container computed to `display: none`, and all three annotation labels had zero overlap with the rail.
- Returning Annotations to Inline removed the avoidance class and restored the rail labels.

### Automated gate

- Crisp Reading Rail: `npm run check` passed with 13 test files and 105 tests, followed by ESLint, TypeScript, and a production build.
- Crisp Annotations: `npm run check` passed with 14 test files and 85 tests, followed by ESLint, TypeScript, and a production build.
- Both regressions were observed failing before the production fixes and passed afterward.

### Live Obsidian acceptance

- ALL loaded Crisp Reading Rail `0.3.14` and Crisp Annotations `1.4.2`, with one live rail and no captured errors.
- YS loaded Crisp Reading Rail `0.3.14` and Crisp Annotations `1.4.2`, with one live rail and no captured errors after interaction probes.
- The YS annotation layout was restored to its original Inline value and the active Markdown view remained in Reading mode.

### Deployment integrity

The repository build and both installed Reading Rail runtimes matched byte for byte:

```text
main.js       4440008953670e5aebcd572b0e39b7507dc5b01d20569ea37859a802edc8499d
manifest.json d25cfc11a819751771ce7bbf257ef72ed7f37c91bc0a9d0cd97eb94b9b57affe
styles.css    b330c78bb9fc69a60c0fadea84e7983860e36d6ba74c478eaec89aa8686eb2b8
assets/       identical in source, ALL, and YS
```

Annotations runtime files also matched between ALL and YS. Deployment preserved all four pre-deploy `data.json` hashes for Annotations and Reading Rail in both vaults.

## v0.3.13 Waypoint Path Integrity

Verified on 2026-07-28 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Waypoint path integrity

- Migrated saved waypoints when a note or its parent folder is renamed.
- Removed saved waypoints when a note or its parent folder is deleted.
- Merged, normalized, sorted, and deduplicated waypoint lists when multiple old paths converge on the same destination.
- Registered the migration through Obsidian's vault rename and delete events without rewriting note content.

### Automated gate

`npm run check` passed with 13 test files and 103 tests. Vitest, ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, manifest/package/version consistency, and `git diff --check` all passed.

The new regression first failed because the waypoint-path rewrite helper did not exist, then passed for note renames, folder renames, deletions, collision merging, and unrelated paths after the production implementation.

### Live Obsidian acceptance

- ALL loaded `0.3.13`, exposed one live Reading rail, survived an independent disable/enable cycle with complete DOM cleanup, and reported no captured errors.
- YS loaded `0.3.13`, exposed one live Reading rail, and reported no captured errors.
- Crisp Annotations `1.4.1`, Crisp File Explorer `0.2.35`, and Crisp Focus `1.1.1` were loaded alongside the rail in both vaults during the compatibility check.

### Deployment integrity

The repository build and both installed runtimes matched byte for byte:

```text
main.js       5054bc7f2a54a9000c0c02bfc42cb9f1d998bf45fa2a2786f4cebff438c86a91
manifest.json 6413789932cb3940bdcd19ee8fb4b566fefc094609b1d4b23d3e49bba7c783cf
styles.css    a47d5743a939814d091d293d3f5c3589dbb1ca1e8ac9fd8d6074b5af304df4df
assets/       19 files, identical in source, ALL, and YS
```

Deployment preserved the pre-deploy `data.json` hashes: ALL remained `a803aba2…174c`, and YS remained `14a874f7…22a7`.

## v0.3.12 Resize Stabilization

Verified on 2026-07-27 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Resize stabilization

- Debounced width-only `ResizeObserver` bursts for 120 ms, so opening or closing an Obsidian side dock no longer rebuilds the complete rail on every animation frame.
- Kept height changes immediate on the next animation frame, preserving correct tick geometry while the Reading pane itself changes height.
- Kept the 680 px rail-visibility threshold immediate, so crossing the compact-pane boundary cannot leave a stale visible or hidden rail.
- Cancelled any pending resize timer during controller destruction to prevent a late refresh against a detached Reading pane.

### Automated gate

`npm run check` passed with 13 test files and 102 tests. Vitest, ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, manifest/package/version consistency, and `git diff --check` all passed.

The new regressions cover burst coalescing for width-only resizes, next-frame handling for height changes, and immediate visibility updates when the host crosses the 680 px threshold.

### Live Obsidian acceptance

- Before the fix, one right-sidebar animation triggered 16 controller refreshes, 16 outline rebuilds, 32 layout measurements, and 1,256 mutations inside the rail.
- After the fix, a foreground YS sidebar animation from a 1,228.5 px Reading host to 1,536 px triggered 2 controller refreshes, 2 outline rebuilds, 4 layout measurements, and 4 rail mutations.
- Across 1,908 animation-frame samples, the article images produced no zero-width frame.
- Reloaded Crisp Reading Rail independently in ALL and YS. Both reported version `0.3.12`, enabled state, one live rail, one controller, and no captured errors.

### Deployment integrity

The repository build and both installed runtimes matched byte for byte:

```text
main.js       414829da0080d5e93015c3e2940707e3dc00ee61aaec4b94e0de0f923d55e320
manifest.json 13d8e0eaca429de2efcae7a3e1dab502a01665e4e6b89b1f42e1d213e55ac272
styles.css    a47d5743a939814d091d293d3f5c3589dbb1ca1e8ac9fd8d6074b5af304df4df
assets/       19 files, identical in source, ALL, and YS
```

Deployment preserved the pre-deploy `data.json` hashes: ALL remained `a803aba2…174c`, and YS remained `3d730f99…e4c5`.

## v0.3.11

Verified on 2026-07-27 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Crisp Annotations compatibility

- Converted valid `==target=={ann ...}` heading syntax to the annotated target before building the cached outline.
- Extracted rendered heading text from a detached DOM clone after removing Crisp Annotations note labels, connector graphics, and Obsidian's heading-collapse control.
- Kept the normalized cached and rendered labels identical, allowing annotated headings to retain their real DOM navigation targets instead of falling back to estimated positions.

### Automated gate

`npm run check` passed with 13 test files and 99 tests. Vitest, ESLint, TypeScript, the production esbuild bundle, manifest/package/version consistency, and `git diff --check` all passed.

The regression cycle first reproduced both failures independently: cached annotation syntax leaking into the outline label and rendered annotation-note text leaking into heading matching. Both tests failed for the expected values before the production changes and passed afterward.

### Live Obsidian acceptance

- Deployed and independently reloaded Crisp Reading Rail in ALL and YS. Both reported version `0.3.11`, enabled state, one live rail, and no captured errors.
- Opened `01-AI基础与概念/Making Software Shaders.md` in YS Reading view. Its source heading `==How a GPU works=={ann note="GPU是如何工作的" place=right color=purple}` rendered in the rail exactly as `How a GPU works`.
- Clicked that live rail label after moving the document to the top. The note navigated to scroll position `2992`, leaving the annotated H3 aligned at the top of the Reading pane (`-0.05px` measured offset), then restored the user's prior reading position.

### Deployment integrity

The repository build and both installed runtimes matched byte for byte:

```text
main.js       ef2c8c6248f55e946b512d66ea3e6439af129f0426f1e2fbe13d08d7da16d15b
manifest.json 3437abe4eb572c650d2f9ae47c3c602a423d48d982fa9dd9dfe964a23b3d1879
styles.css    a47d5743a939814d091d293d3f5c3589dbb1ca1e8ac9fd8d6074b5af304df4df
assets/       19 files, identical in source, ALL, and YS
```

Deployment preserved the pre-deploy `data.json` hashes: ALL remained `a803aba2…174c`, and YS remained `14a874f7…22a7`.

### Sanitized share package

Created `$HOME/Desktop/Crisp-Reading-Rail-0.3.11-share.zip` with 22 runtime files: `main.js`, `manifest.json`, `styles.css`, and all 19 referenced assets. The archive excludes `data.json`, source, tests, repository metadata, vault configuration, and local machine paths.

`unzip -t`, source-to-archive byte comparisons, referenced-asset coverage, manifest version validation, and sensitive-string scanning all passed. Archive SHA-256: `7cb16ccd49a6bb959630e768ab89f0b13712bc329ffce2934935fe6e8d5703dd`.

## v0.3.10

Verified on 2026-07-27 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Linked-heading fix

- Converted cached Markdown links to their visible labels before building the rail outline, so `[Reference guide](https://example.com/docs)` displays as `Reference guide`.
- Converted aliased Obsidian wiki links to their visible aliases, so `[[00-启动页|Internal guide]]` displays as `Internal guide`.
- Kept rendered-heading matching and navigation targets on the same normalized label, preventing link syntax from making a valid Reading-view heading disappear from the rail.

### Automated gate

`npm run check` passed with 13 test files and 97 tests. Vitest, ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, manifest/package/version consistency, and runtime file comparisons all passed.

The regression cycle first reproduced the Markdown-link failure through the pane registry, then verified Markdown-link and aliased-wikilink labels after the fix.

### Live Obsidian acceptance

- Deployed and independently reloaded Crisp Reading Rail in ALL and YS. Both reported version `0.3.10`, enabled state, one live rail, and no captured errors.
- Opened a temporary ALL Reading-view note containing a Markdown-linked H2 and an aliased-wikilink H2. The rendered article headings and rail labels both resolved exactly to `Reference guide` and `Internal guide`; the rail exposed one slider.
- Removed the temporary acceptance note and restored the previously active ALL note after inspection.

### Deployment integrity

The repository build and both installed runtimes matched byte for byte:

```text
main.js       56cc766ef9de37e15a2a9261ca6a3ef7548fb1e6a96109223d98afc9033e9080
manifest.json eb9250ef18f6787e3bad4f2e5db0140464aaa5cce6b363712d444766cc29e8a6
styles.css    a47d5743a939814d091d293d3f5c3589dbb1ca1e8ac9fd8d6074b5af304df4df
assets/       19 files, identical in source, ALL, and YS
```

Deployment preserved the pre-deploy `data.json` hashes: ALL remained `a803aba2…174c`, and YS remained `14a874f7…22a7`.

## v0.3.9

Verified on 2026-07-27 with Obsidian Desktop 1.12.7 in the ALL and YS vaults.

### Stabilization scope

- Recovered the running 0.3.8 sound palettes, release-sound control, completion chime, heading commands, orb-cycle command, settings groups, and reading waypoints into the TypeScript source tree.
- Made the repository build the single source of truth again; no runtime-only JavaScript or CSS remains.
- Persisted normalized, sorted, deduplicated reading waypoints by note path. Waypoints render as native buttons, support click and keyboard activation, and can be removed with Delete, Backspace, or the context menu.
- Replaced the settings accordion's animated `grid-template-rows` and padding with native `details`/`summary` semantics and compositor-safe color, shadow, and chevron transitions.
- Replaced the 650 ms celebration transform override with a 240 ms independent scale/rotate animation. The outer orb's inline position transform remains untouched, and reduced-motion mode suppresses the animation.
- Retained the existing spring rail, wave geometry, proximity coalescing, virtualized-heading settlement, companion orb following, and vault-specific orb/sound choices.

### Automated gate

`npm run check` passed with 12 test files and 95 tests. Vitest, ESLint, TypeScript, the production esbuild bundle, `node --check main.js`, manifest/package/version consistency, and `git diff --check` all passed.

The new regression coverage includes sound-style normalization and Crisp File Explorer aliases; release-sound muting; scale progress mapping; completion-chime laziness; waypoint normalization, per-note updates, persistence callbacks, accessible button behavior, keyboard deletion, double-click and `M` creation, listener cleanup; position-safe completion celebration and reduced motion; controller/registry waypoint wiring; progress-aware drag sound; active-pane next/previous heading commands; native settings groups; and CSS bans on layout animation.

### Live Obsidian acceptance

- Reloaded Crisp Reading Rail independently in ALL and YS. Both reported version `0.3.9`, enabled state, one visible rail, one slider, and no captured errors.
- Preserved ALL's Devil orb with sound enabled and Follow Crisp File Explorer sound style.
- Preserved YS's Poke Ball orb with sound enabled, Retro 8-bit sound style, and release sound enabled.
- Confirmed all four commands are registered: navigation-sound toggle, next heading, previous heading, and orb-style cycle.
- Confirmed the live slider exposes the waypoint instructions through `aria-description`.
- Created a temporary waypoint at `0.37` in the active ALL note, confirmed it persisted under that note path, then removed it with the Delete key and confirmed both the button and stored entry disappeared. The original `data.json` was restored byte for byte and the plugin was reloaded without errors.
- Opened the real settings tab and verified three native collapsible cards, with the first two open and the interaction help group closed. The modal rendered without clipping or layout breakage.
- Visually inspected the live ALL Reading view after reload. The compact rail, Devil orb, progress text, focus line, and ticks remained aligned at the right edge without restoring a full-height rule.
- Closed the settings modal after inspection and confirmed the error buffer remained empty.

### Deployment integrity

The repository build was deployed with the asset-aware deployment script to:

```text
$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/ALL/.obsidian/plugins/crisp-reading-rail
$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/YS/.obsidian/plugins/crisp-reading-rail
```

Both runtimes matched the repository byte for byte:

```text
main.js       a7d582d718e59720251515a3643b4ca0959d7b45def67fc5f14db57bb6e4929b
manifest.json 491a4d4319e6e51992c5927615757334240f77bbbdc372a641d15716d656f13f
styles.css    a47d5743a939814d091d293d3f5c3589dbb1ca1e8ac9fd8d6074b5af304df4df
assets/       19 files, identical in ALL and YS
```

The deployment preserved each vault's existing `data.json` byte for byte. ALL remained `a803aba2…174c`; YS remained `d311b701…e6f`.

## v0.3.0

Verified on 2026-07-15 with Obsidian Desktop 1.12.7 in the ALL vault.

### Automated gate

`npm run check` passed with 9 test files and 49 tests. ESLint, TypeScript, production esbuild, `node --check main.js`, manifest assertions, and `git diff --check` all passed.

The new coverage includes spring convergence and frame-delta clamping; Gaussian wave geometry and dynamic-radius reset; first-render/hidden-to-visible snapping; reduced motion; all 28 Orb setting values; all 25 material mappings; deterministic daily random; same-document Crisp File Explorer following and fallback; inline/file-backed media and image-error fallback; character rotation suppression; variable-height/over-constrained label layout; live-pane appearance propagation; observer/frame/timer/listener cleanup; and asset-aware deployment that preserves `data.json`.

### Live Obsidian acceptance

The 0.3.0 runtime was deployed to the ALL vault and loaded by toggling only Crisp Reading Rail. The live plugin exposed **Settings → Crisp Reading Rail → Orb style** with all approved options from Follow Crisp File Explorer through Taiga.

Verified in a long Markdown Reading-view note:

- the progress number rendered as accent-colored text without a surrounding card;
- the default and file-backed Gear orbs rendered successfully and changed immediately without pane recreation;
- nearby fine/heading marks bent left around the orb while distant marks remained aligned;
- H2-H4 labels appeared when approaching the rail, remained pure text overlays, and long labels wrapped without changing article width;
- clicking an expanded title navigated from `0.47` to `0.50`;
- after moving away, accessibility inspection still found the labels before the grace period ended and no longer found them after 3200ms;
- the filtered Developer Console contained no `crisp-reading-rail` message or error (one pre-existing Obsidian measurement warning was unrelated);
- the temporary Gear test selection persisted correctly, and subsequent user-side Orb changes continued to save live.

Every deployed `main.js`, `manifest.json`, `styles.css`, SVG, and PNG matched the repository source byte for byte. The final first-visible-frame regression fix was then rebuilt, passed the full 49-test gate, and redeployed byte-identically.

### Automated-only acceptance

Random per day, live companion-style mutation, missing-companion fallback, image failure fallback, character-upright behavior, reduced-motion snapping, multiple panes, and narrow/edit/hidden-state cleanup are covered by deterministic automated tests. They were not all exercised manually for every one of the 25 material choices in the final Obsidian session.

## v0.2.0

Verified on 2026-07-15 with Obsidian Desktop 1.12.7 in the ALL vault.

### Automated gate

`npm run check` passed with 6 test files and 25 tests. ESLint, TypeScript, and the production esbuild bundle all passed. The tests include separate semantic heading ticks, H2-H4 level metadata, 96px proximity activation, an exact 3000ms collapse delay, re-entry cancellation, clickable labels during the grace period, and listener/timer cleanup.

### Live Obsidian acceptance

The 0.2.0 runtime was deployed and reloaded by disabling and re-enabling only Crisp Reading Rail. Source and runtime `main.js`, `styles.css`, and `manifest.json` matched byte for byte.

Developer Tools inspection of the visible long-note rail reported:

- 119 fine progress ticks and 8 semantic heading ticks;
- H2 marks at `16px × 2px` and H3 marks at `14px × 2px` (H4 uses the tested 12px default);
- fine-tick counts of `3, 38, 18, 16, 13, 12, 15` between successive heading marks, confirming content-proportional section spacing;
- label `border: none` and a transparent background;
- the active label resolved to the current Obsidian `--interactive-accent` color;
- a synthetic pointer position 80px left of the rail expanded labels;
- labels remained expanded at 2800ms and were collapsed after 3200ms;
- clicking the final label during the grace period changed the Reading-view scroll position from `0` to `19864.5` and the rail value to `0.98`;
- no uncaught, type, reference, or `plugin:crisp-reading-rail` console error.

The final Obsidian state was restored to the top of the note with Developer Tools closed and the v0.2.0 plugin enabled.

## v0.1.0

Verified on 2026-07-15 with Obsidian Desktop 1.12.7 in the ALL vault.

### Automated gate

The final gate covers progress geometry, outline matching and collision handling, Obsidian virtualized headings, accessible DOM structure, local pointer and keyboard behavior, reduced motion, long-distance navigation, controller cleanup, pane reconciliation, real Reading-view wrapper resolution, and deployment packaging.

Final commands:

```text
npm ci
npm run check
node --check main.js
manifest field assertion
npm run deploy -- <ALL vault>
runtime/source SHA-256 comparison
```

Result: all commands exited successfully. Vitest reported 6 test files and 22 passing tests. ESLint, TypeScript, esbuild, JavaScript syntax, and manifest assertions passed.

### Obsidian acceptance

| Check | Result | Current evidence |
| --- | --- | --- |
| Long Reading-view note | Pass | Right-edge guide, ticks, accent marker, decimal progress, and all eight H2-H4 labels rendered in the 738-line implementation-plan note. |
| Scroll synchronization | Pass | Track click changed `0.00` to `0.50`; normal scrolling and jumps updated the slider value and active marker. |
| Heading navigation | Pass | The visible Task 6 label moved the rail to `0.89`, and the actual `Task 6: Package, deploy, and verify v1 in the real ALL vault` H3 entered the rendered viewport. |
| Proportional and keyboard navigation | Pass | Track click navigated proportionally. Focused slider exposed Arrow/Page/Home/End controls; Home changed `0.50` to `0.00`. |
| Reading-view-only visibility | Pass | Switching the long note to Edit mode removed the rail; returning to Reading mode restored it. A short `笔记测试` note, the Graph view, and narrow split panes showed no rail. |
| Multiple panes | Pass | Two side-by-side Reading panes displayed independent sliders at `0.87` and `0.00`. |
| Core views and companion plugin | Pass | File explorer/Crisp File Explorer, Search, Bookmarks, built-in Outline, Command palette, Graph shortcut, tab close, and mode toggle continued to work while the rail was active. |
| Unload cleanup | Pass | Runtime disable returned `rails: 0` and `loaded: false`; re-enable recreated the rail. No `plugin:crisp-reading-rail` console error appeared. |
| Reduced motion | Pass | Automated controller test selected `auto` scrolling when reduced motion is requested. CSS removes nonessential transitions under `prefers-reduced-motion: reduce`. |
| Light and dark themes | Pass | Obsidian theme toggle was exercised; the rail retained contrast through theme variables and the original light state was restored afterward. |

### Screenshots

- `verification/collapsed-light.jpeg` — collapsed rail in the light theme.
- `verification/focus-expanded-full-outline-light.jpeg` — focused rail with the full virtualized outline distributed down the article.
- `verification/two-pane-independent-light.jpeg` — two Reading panes with independent progress values.
- `verification/collapsed-dark.jpeg` — collapsed rail while Obsidian reported `theme-dark`.

### Deployment

Runtime directory:

```text
$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/ALL/.obsidian/plugins/crisp-reading-rail
```

The runtime directory contains exactly `main.js`, `manifest.json`, and `styles.css`. Each deployed artifact matched its source artifact byte for byte. The plugin id remains present in `.obsidian/community-plugins.json`, and the final Obsidian state has one active Reading rail with Developer Tools closed.
