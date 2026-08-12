# Crisp Reading Rail 0.3.32 and 0.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a low-risk 0.3.32 reliability release, then build 0.4.0 reading memory, semantic waypoints, outline preferences, per-note control, and a pane-local pinned outline.

**Architecture:** Keep the existing controller/view/registry split. Add pure normalization and resolution helpers for new persisted data, keep vault-specific settings in `data.json`, and make UI state such as pinning pane-local. Preserve numeric waypoint compatibility through normalization and never rewrite Markdown files.

**Tech Stack:** TypeScript, Obsidian API, Vitest, JSDOM, CSS, esbuild.

## Global Constraints

- Reading view desktop support only; do not add Live Preview or mobile behavior.
- Preserve existing orb, sound, license code, and waypoint data in ALL and YS.
- Every production behavior starts with a failing regression test.
- 0.3.32 and 0.4.0 each require `npm run check`, version consistency, and a clean `git diff --check` before their milestone commit.
- Do not publish GitHub releases or push branches without separate user authorization.

---

### Task 1: 0.3.32 trust and verification cache

**Files:**
- Modify: `src/license.ts`
- Modify: `src/main.ts`
- Modify: `README.md`
- Modify: `tests/license-products.test.ts`
- Modify: `tests/obsidian-mock.ts`

**Interfaces:**
- Produces: `clearLicenseVerificationCache(): void`
- Produces: cached `verifyLicenseCode(code, pluginId)` calls keyed by code and plugin ID with one shared in-flight request and a 15-minute successful-result TTL.

- [x] **Step 1: Write failing tests for request deduplication, TTL reuse, and cache clearing**

```ts
it("deduplicates concurrent and recent online license checks", async () => {
  const first = verifyLicenseCode(validCode, "crisp-reading-rail");
  const second = verifyLicenseCode(validCode, "crisp-reading-rail");
  await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  expect(requestUrl).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run `npx vitest run tests/license-products.test.ts` and confirm the missing cache behavior fails**
- [x] **Step 3: Implement keyed in-flight and TTL caching; clear it when the license text changes**
- [x] **Step 4: Update README and settings copy to disclose local signature verification plus online device-limit checks and offline fallback**
- [x] **Step 5: Re-run the focused tests and confirm they pass**

### Task 2: 0.3.32 layout and DOM stabilization

**Files:**
- Modify: `src/reading-rail-view.ts`
- Modify: `src/reading-rail-controller.ts`
- Modify: `tests/reading-rail-view.test.ts`
- Modify: `tests/reading-rail-controller.test.ts`

**Interfaces:**
- `setVisible(visible)` changes DOM state only when visibility changes and defers measurement to the outline update.
- `setWaypoints(waypoints)` rebuilds buttons only when normalized persisted values differ.
- Structural mutation refresh uses trailing debounce rather than periodic leading refreshes during continuous virtualization.

- [x] **Step 1: Write failing tests for unchanged visibility, unchanged waypoints, and trailing mutation debounce**
- [x] **Step 2: Run the two focused test files and confirm each new assertion fails for the expected duplicate work**
- [x] **Step 3: Add equality guards and reset the structure timer on each mutation**
- [x] **Step 4: Optimize wave updates to iterate only positions inside `WAVE_DYNAMIC_RADIUS` while preserving zeroing of elements that leave the radius**
- [x] **Step 5: Re-run focused tests and the motion tests**

### Task 3: Freeze 0.3.32 milestone

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `README.md`
- Modify: `VERIFICATION.md`

**Interfaces:**
- Produces: repository commit and local tag `0.3.32`.

- [x] **Step 1: Set all release metadata to `0.3.32` and add the verification entry**
- [x] **Step 2: Run `npm run check`, `node --check main.js`, and `git diff --check`**
- [x] **Step 3: Commit the verified milestone and create local tag `0.3.32`**

### Task 4: 0.4.0 reading memory and semantic waypoint model

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/types.ts`
- Modify: `src/reading-rail-controller.ts`
- Modify: `src/reading-rail-view.ts`
- Modify: `src/pane-registry.ts`
- Modify: `src/main.ts`
- Modify: `tests/settings.test.ts`
- Modify: `tests/reading-rail-controller.test.ts`
- Modify: `tests/reading-rail-view.test.ts`
- Modify: `tests/pane-registry.test.ts`

**Interfaces:**
- Produces: `ReadingWaypoint { progress, headingText?, headingLevel?, headingSourceLine?, createdAt? }`.
- Produces: `ReadingMemory { progress, headingText?, headingLevel?, headingSourceLine?, updatedAt }`.
- Numeric legacy waypoints normalize into semantic objects without data loss.
- Stored last position is shown as a fixed resume marker for the session and is only navigated when clicked or commanded.

- [x] **Step 1: Write failing pure-data tests for numeric migration, semantic deduplication, path rewrites, and memory pruning**
- [x] **Step 2: Implement normalization and resolution helpers and make the pure tests pass**
- [x] **Step 3: Write failing controller/view tests for semantic re-anchoring and the non-chasing resume marker**
- [x] **Step 4: Implement semantic waypoint rendering, fixed session resume marker, and debounced local progress persistence**
- [x] **Step 5: Add `Jump to last reading position` and verify it routes only to the active Reading pane**

### Task 5: 0.4.0 outline preferences and pinned outline

**Files:**
- Modify: `src/settings.ts`
- Create: `src/outline-preferences.ts`
- Modify: `src/reading-rail-controller.ts`
- Modify: `src/reading-rail-view.ts`
- Modify: `src/pane-registry.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`
- Create: `tests/outline-preferences.test.ts`
- Modify: `tests/reading-rail-view.test.ts`
- Modify: `tests/pane-registry.test.ts`
- Modify: `tests/settings.test.ts`

**Interfaces:**
- Produces: `OutlinePreferences { enabled, maxLevel, scope }`, where scope is `all` or `currentH2`.
- Frontmatter keys: `crisp-reading-rail`, `crisp-reading-rail-levels`, and `crisp-reading-rail-scope`.
- Pane-local keys: `P` toggles pin, `Escape` releases pin/collapses, `J` goes to next heading, and `K` goes to previous heading without animation or sound.

- [x] **Step 1: Write failing tests for global defaults and frontmatter overrides**
- [x] **Step 2: Implement pure preference normalization and registry wiring**
- [x] **Step 3: Write failing view tests for current-H2 filtering, pin persistence across pointer leave, and keyboard controls**
- [x] **Step 4: Implement branch visibility and pane-local pinning using existing opacity/transform motion only**
- [x] **Step 5: Add Chinese settings controls and frontmatter documentation**
- [x] **Step 6: Run focused tests plus CSS motion assertions**

### Task 6: 0.4.0 release, deployment, and live acceptance

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `README.md`
- Modify: `VERIFICATION.md`

**Interfaces:**
- Produces: final commit and local tag `0.4.0`.
- Produces: byte-identical source, ALL runtime, and YS runtime while preserving both vaults' `data.json`.

- [x] **Step 1: Set release metadata to `0.4.0` and document migrations, settings, commands, and frontmatter**
- [x] **Step 2: Run the full automated gate and dependency audit**
- [x] **Step 3: Deploy with the repository script to ALL and YS, preserving pre-deploy `data.json` hashes**
- [x] **Step 4: Reload both plugins and verify version, one rail/controller, no runtime errors, semantic waypoint migration, resume marker, current-H2 mode, and pin keyboard behavior**
- [x] **Step 5: Compare source/install hashes, review motion against the animation standards, commit, and create local tag `0.4.0`**
