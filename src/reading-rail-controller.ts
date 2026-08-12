import { collectRenderedHeadings } from "./heading-source";
import type { RailSoundProvider } from "./audio-feedback";
import {
  activeHeadingIndex,
  buildOutlineEntries,
  resolveLabelPositions,
} from "./outline-model";
import { calculateProgress, calculateTickCount, clamp01 } from "./progress";
import { ReadingRailView } from "./reading-rail-view";
import {
  createSemanticMarker,
  resolveReadingMarkerProgress,
} from "./reading-memory";
import type {
  RailAppearanceProvider,
  RailViewCallbacks,
} from "./reading-rail-view";
import type {
  OutlineEntry,
  OutlineHeading,
  ReadingMemory,
  ReadingWaypoint,
} from "./types";
import type { OutlinePreferences, OutlineScope } from "./outline-preferences";

const MIN_PANE_WIDTH = 680;
const TRACK_VERTICAL_INSET = 36;
const LABEL_HEIGHT = 20;
const LABEL_GAP = 4;
const HEADING_ACTIVATION_OFFSET = 80;
const STRUCTURE_REFRESH_DELAY = 80;
const RESIZE_REFRESH_DELAY = 120;
const READING_MEMORY_SAVE_DELAY = 1200;
const NAVIGATION_MIN_DURATION = 260;
const NAVIGATION_MAX_DURATION = 900;
const NAVIGATION_MS_PER_PIXEL = 0.08;
const NAVIGATION_SETTLE_TOLERANCE = 0.5;
const NAVIGATION_STABLE_FRAMES = 2;
const NAVIGATION_MAX_FINAL_FRAMES = 30;
const NATIVE_SCROLLBAR_CLASS = "crisp-reading-rail-native-scrollbar";
const RIGHT_ANNOTATION_AVOIDANCE_CLASS =
  "crisp-reading-rail-avoid-right-annotations";

interface ResizeObserverHandle {
  observe(target: Element, options?: ResizeObserverOptions): void;
  disconnect(): void;
}

interface MutationObserverHandle {
  observe(target: Node, options?: MutationObserverInit): void;
  disconnect(): void;
}

interface SettleState {
  lastTarget: number | null;
  stableFrames: number;
  finalFrames: number;
}

interface ScrollNavigation extends SettleState {
  resolveTop(): number;
  startTop: number;
  startedAt: number | null;
  duration: number;
}

interface ProgressSettlement extends SettleState {
  progress: number;
}

/**
 * Check if a scroll animation has settled (target and position both stable).
 * Updates the state in-place and returns true when settled.
 */
function checkSettled(
  state: SettleState,
  target: number,
  scrollTop: number,
): boolean {
  const targetStable = state.lastTarget !== null
    && Math.abs(target - state.lastTarget) <= NAVIGATION_SETTLE_TOLERANCE;
  const positionSettled = Math.abs(scrollTop - target) <= NAVIGATION_SETTLE_TOLERANCE;
  state.stableFrames = targetStable && positionSettled ? state.stableFrames + 1 : 0;
  state.lastTarget = target;
  state.finalFrames += 1;
  return state.stableFrames >= NAVIGATION_STABLE_FRAMES
    || state.finalFrames >= NAVIGATION_MAX_FINAL_FRAMES;
}

export interface RailControllerEnvironment {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  createResizeObserver(callback: () => void): ResizeObserverHandle;
  createMutationObserver(callback: () => void): MutationObserverHandle;
  reducedMotion(): boolean;
}

export interface RailView {
  setOutline(entries: readonly OutlineEntry[], tickCount: number): void;
  setProgress(progress: number): void;
  setActiveHeading(index: number): void;
  setWaypoints(waypoints: readonly (ReadingWaypoint | number)[]): void;
  setResumeMarker(progress: number | null): void;
  setOutlineScope(scope: OutlineScope): void;
  togglePinned(): boolean;
  setExpanded(expanded: boolean): void;
  setVisible(visible: boolean): void;
  refreshAppearance(): void;
  destroy(): void;
}

export interface ReadingRailControllerOptions {
  host: HTMLElement;
  scroller: HTMLElement;
  preview: HTMLElement;
  getHeadings(): readonly OutlineHeading[];
  getLineCount?(): number;
  getWaypoints?(): readonly (ReadingWaypoint | number)[];
  setWaypoints?(waypoints: readonly ReadingWaypoint[]): void;
  getReadingMemory?(): ReadingMemory | null;
  setReadingMemory?(memory: ReadingMemory): void;
  getOutlinePreferences?(): OutlinePreferences;
  appearance?: RailAppearanceProvider;
  sound?: RailSoundProvider;
  environment?: RailControllerEnvironment;
  createView?(
    host: HTMLElement,
    callbacks: RailViewCallbacks,
    appearance?: RailAppearanceProvider,
  ): RailView;
}

function createDefaultEnvironment(host: HTMLElement): RailControllerEnvironment {
  const window = host.ownerDocument.defaultView;
  if (!window) {
    throw new Error("Crisp Reading Rail requires a window-backed document.");
  }

  return {
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (id) => window.clearTimeout(id),
    createResizeObserver: (callback) => new window.ResizeObserver(callback),
    createMutationObserver: (callback) => new window.MutationObserver(callback),
    reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

export class ReadingRailController {
  private readonly host: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly window: Window | undefined;
  private readonly getHeadings: () => readonly OutlineHeading[];
  private readonly getLineCount: () => number;
  private readonly getWaypoints: () => readonly (ReadingWaypoint | number)[];
  private readonly setWaypoints: (waypoints: readonly ReadingWaypoint[]) => void;
  private readonly getReadingMemory: () => ReadingMemory | null;
  private readonly setReadingMemory: (memory: ReadingMemory) => void;
  private readonly getOutlinePreferences: () => OutlinePreferences;
  private readonly environment: RailControllerEnvironment;
  private readonly appearance?: RailAppearanceProvider;
  private readonly sound?: RailSoundProvider;
  private readonly createView: (
    host: HTMLElement,
    callbacks: RailViewCallbacks,
    appearance?: RailAppearanceProvider,
  ) => RailView;
  private view: RailView | null = null;
  private resizeObserver: ResizeObserverHandle | null = null;
  private mutationObserver: MutationObserverHandle | null = null;
  private entries: OutlineEntry[] = [];
  private frameId: number | null = null;
  private navigationFrameId: number | null = null;
  private navigation: ScrollNavigation | null = null;
  private progressSettlementFrameId: number | null = null;
  private progressSettlement: ProgressSettlement | null = null;
  private dragProgress: number | null = null;
  private lastDragHeadingIndex: number | null = null;
  private refreshTimer: number | null = null;
  private resizeRefreshTimer: number | null = null;
  private readingMemoryTimer: number | null = null;
  private sessionResumeProgress: number | null = null;
  private resumeMarkerInitialized = false;
  private observedHostWidth = 0;
  private observedHostHeight = 0;
  private observedScrollerHeight = 0;
  private pendingHeadingLine: number | null = null;
  private activeHeadingIndex = -1;
  private needsMeasurement = false;
  private started = false;
  private destroyed = false;

  constructor(options: ReadingRailControllerOptions) {
    this.host = options.host;
    this.scroller = options.scroller;
    this.preview = options.preview;
    this.window = options.host.ownerDocument.defaultView ?? undefined;
    this.observedHostWidth = this.host.clientWidth;
    this.observedHostHeight = this.host.clientHeight;
    this.observedScrollerHeight = this.scroller.clientHeight;
    this.getHeadings = options.getHeadings;
    this.getLineCount = options.getLineCount ?? (() => 0);
    this.getWaypoints = options.getWaypoints ?? (() => []);
    this.setWaypoints = options.setWaypoints ?? (() => undefined);
    this.getReadingMemory = options.getReadingMemory ?? (() => null);
    this.setReadingMemory = options.setReadingMemory ?? (() => undefined);
    this.getOutlinePreferences = options.getOutlinePreferences ?? (() => ({
      enabled: true,
      maxLevel: 4,
      scope: "all",
    }));
    this.appearance = options.appearance;
    this.sound = options.sound;
    this.environment = options.environment ?? createDefaultEnvironment(options.host);
    this.createView = options.createView ?? ((host, callbacks, appearance) => (
      ReadingRailView.mount(host, callbacks, {
        appearance,
        sound: this.sound,
      })
    ));
  }

  jumpHeading(delta: number): void {
    if (this.entries.length === 0 || delta === 0) {
      return;
    }
    let nextIndex = this.activeHeadingIndex + Math.sign(delta);
    if (this.activeHeadingIndex < 0 && delta > 0) {
      nextIndex = 0;
    }
    nextIndex = Math.max(0, Math.min(this.entries.length - 1, nextIndex));
    const entry = this.entries[nextIndex];
    if (entry) {
      this.navigateToHeading(entry, true, false);
    }
  }

  jumpToReadingMemory(): void {
    if (this.sessionResumeProgress !== null) {
      this.navigateToProgress(this.sessionResumeProgress, false, false);
    }
  }

  togglePinnedOutline(): void {
    this.view?.togglePinned();
  }

  start(): void {
    if (this.started || this.destroyed) {
      return;
    }
    this.started = true;
    this.view = this.createView(this.host, {
      onHeadingSelect: (entry, audible, animated) => (
        this.navigateToHeading(entry, audible, animated)
      ),
      onProgressSelect: (progress, audible, animated) => (
        this.navigateToProgress(progress, audible, animated)
      ),
      onProgressDrag: (progress) => this.dragToProgress(progress),
      onProgressDragEnd: (progress) => this.settleDraggedProgress(progress),
      onProgressDragCancel: (progress) => this.cancelDraggedProgress(progress),
      onWaypointsChange: (waypoints) => this.setWaypoints(waypoints),
      onHeadingStep: (delta) => this.jumpHeading(delta),
    }, this.appearance);
    this.scroller.addEventListener("scroll", this.handleScroll, { passive: true });
    this.scroller.addEventListener("wheel", this.handleManualNavigation, { passive: true });
    this.scroller.addEventListener("touchstart", this.handleManualNavigation, { passive: true });
    this.scroller.addEventListener("pointerdown", this.handleManualNavigation, { passive: true });

    this.resizeObserver = this.environment.createResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.host);
    if (this.scroller !== this.host) {
      this.resizeObserver.observe(this.scroller);
    }

    this.mutationObserver = this.environment.createMutationObserver(() => {
      this.scheduleStructureRefresh();
    });
    this.mutationObserver.observe(this.preview, { childList: true, subtree: true });
    this.scheduleFrame(true);
  }

  refresh(): void {
    if (!this.started || this.destroyed || !this.view) {
      return;
    }

    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    const trackHeight = Math.max(0, this.host.clientHeight - TRACK_VERTICAL_INSET);
    const preferences = this.getOutlinePreferences();
    const visible = this.host.isConnected
      && this.host.clientWidth >= MIN_PANE_WIDTH
      && maxScroll > 0
      && trackHeight > 0
      && preferences.enabled;
    this.scroller.classList.toggle(
      NATIVE_SCROLLBAR_CLASS,
      this.host.isConnected && maxScroll > 0 && !visible,
    );
    this.host.classList.toggle(
      RIGHT_ANNOTATION_AVOIDANCE_CLASS,
      this.preview.querySelector(".crisp-ann-margin-item--right") !== null,
    );
    const rendered = collectRenderedHeadings(this.preview)
      .filter((heading) => heading.level <= preferences.maxLevel);
    const unresolvedEntries = buildOutlineEntries(
      this.getHeadings().filter((heading) => heading.level <= preferences.maxLevel),
      rendered,
      0,
      maxScroll,
      this.getLineCount(),
    );
    this.entries = resolveLabelPositions(
      unresolvedEntries,
      trackHeight,
      LABEL_HEIGHT,
      LABEL_GAP,
    );

    this.view.setWaypoints(this.getWaypoints());
    this.view.setOutline(this.entries, calculateTickCount(trackHeight));
    this.view.setOutlineScope(preferences.scope);
    if (!this.resumeMarkerInitialized) {
      const memory = this.getReadingMemory();
      this.sessionResumeProgress = memory
        ? resolveReadingMarkerProgress(memory, this.entries)
        : null;
      this.resumeMarkerInitialized = true;
    }
    this.view.setResumeMarker(this.sessionResumeProgress);
    this.view.setVisible(visible);
    this.updateScrollState();
    this.finishPendingHeadingNavigation();
  }

  refreshAppearance(): void {
    if (!this.started || this.destroyed) {
      return;
    }
    this.view?.refreshAppearance();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.scroller.removeEventListener("scroll", this.handleScroll);
    this.scroller.removeEventListener("wheel", this.handleManualNavigation);
    this.scroller.removeEventListener("touchstart", this.handleManualNavigation);
    this.scroller.removeEventListener("pointerdown", this.handleManualNavigation);
    if (this.frameId !== null) {
      this.environment.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.cancelNavigation();
    this.cancelProgressSettlement();
    if (this.refreshTimer !== null) {
      this.environment.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.cancelResizeRefresh();
    if (this.readingMemoryTimer !== null) {
      this.environment.clearTimeout(this.readingMemoryTimer);
      this.readingMemoryTimer = null;
    }
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.scroller.classList.remove(NATIVE_SCROLLBAR_CLASS);
    this.host.classList.remove(RIGHT_ANNOTATION_AVOIDANCE_CLASS);
    this.view?.destroy();
    this.view = null;
    this.entries = [];
    this.pendingHeadingLine = null;
    this.activeHeadingIndex = -1;
    this.dragProgress = null;
    this.lastDragHeadingIndex = null;
  }

  private readonly handleScroll = (): void => {
    this.scheduleFrame(false);
    this.scheduleReadingMemorySave();
  };

  private scheduleReadingMemorySave(): void {
    if (this.readingMemoryTimer !== null) {
      this.environment.clearTimeout(this.readingMemoryTimer);
    }
    this.readingMemoryTimer = this.environment.setTimeout(() => {
      this.readingMemoryTimer = null;
      const progress = calculateProgress(
        this.scroller.scrollTop,
        this.scroller.scrollHeight,
        this.scroller.clientHeight,
      );
      const marker = createSemanticMarker(progress, this.entries, Date.now());
      this.setReadingMemory({
        progress: marker.progress,
        ...(marker.headingText !== undefined ? { headingText: marker.headingText } : {}),
        ...(marker.headingLevel !== undefined ? { headingLevel: marker.headingLevel } : {}),
        ...(marker.headingSourceLine !== undefined
          ? { headingSourceLine: marker.headingSourceLine }
          : {}),
        updatedAt: Date.now(),
      });
    }, READING_MEMORY_SAVE_DELAY);
  }

  private readonly handleManualNavigation = (): void => {
    this.pendingHeadingLine = null;
    this.dragProgress = null;
    this.lastDragHeadingIndex = null;
    this.cancelNavigation();
    this.cancelProgressSettlement();
  };

  private readonly handleResize = (): void => {
    const hostWidth = this.host.clientWidth;
    const hostHeight = this.host.clientHeight;
    const scrollerHeight = this.scroller.clientHeight;
    const widthChanged = hostWidth !== this.observedHostWidth;
    const heightChanged = hostHeight !== this.observedHostHeight
      || scrollerHeight !== this.observedScrollerHeight;
    const crossedVisibilityThreshold = (
      hostWidth >= MIN_PANE_WIDTH
    ) !== (
      this.observedHostWidth >= MIN_PANE_WIDTH
    );

    this.observedHostWidth = hostWidth;
    this.observedHostHeight = hostHeight;
    this.observedScrollerHeight = scrollerHeight;

    if (heightChanged || crossedVisibilityThreshold) {
      this.cancelResizeRefresh();
      this.scheduleFrame(true);
    } else if (widthChanged) {
      this.scheduleResizeRefresh();
    }
  };

  private scheduleFrame(needsMeasurement: boolean): void {
    if (this.destroyed) {
      return;
    }
    this.needsMeasurement ||= needsMeasurement;
    if (this.frameId !== null) {
      return;
    }
    this.frameId = this.environment.requestAnimationFrame(() => {
      this.frameId = null;
      if (this.destroyed) {
        return;
      }
      if (this.needsMeasurement) {
        this.needsMeasurement = false;
        this.refresh();
      } else {
        this.updateScrollState();
      }
    });
  }

  private scheduleStructureRefresh(): void {
    if (this.destroyed) {
      return;
    }
    if (this.refreshTimer !== null) {
      this.environment.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = this.environment.setTimeout(() => {
      this.refreshTimer = null;
      this.scheduleFrame(true);
    }, STRUCTURE_REFRESH_DELAY);
  }

  private scheduleResizeRefresh(): void {
    this.cancelResizeRefresh();
    this.resizeRefreshTimer = this.environment.setTimeout(() => {
      this.resizeRefreshTimer = null;
      this.scheduleFrame(true);
    }, RESIZE_REFRESH_DELAY);
  }

  private cancelResizeRefresh(): void {
    if (this.resizeRefreshTimer === null) {
      return;
    }
    this.environment.clearTimeout(this.resizeRefreshTimer);
    this.resizeRefreshTimer = null;
  }

  private updateScrollState(): void {
    if (!this.view) {
      return;
    }
    if (this.dragProgress !== null) {
      const target = this.getProgressTop(this.dragProgress);
      if (Math.abs(this.scroller.scrollTop - target) > NAVIGATION_SETTLE_TOLERANCE) {
        this.scroller.scrollTo({ top: target, behavior: "auto" });
      }
    }
    const progress = this.dragProgress ?? calculateProgress(
      this.scroller.scrollTop,
      this.scroller.scrollHeight,
      this.scroller.clientHeight,
    );
    this.view.setProgress(progress);
    this.activeHeadingIndex = activeHeadingIndex(
      this.entries,
      this.scroller.scrollTop,
      HEADING_ACTIVATION_OFFSET,
    );
    this.view.setActiveHeading(this.activeHeadingIndex);
  }

  private navigateToHeading(
    entry: OutlineEntry,
    audible = true,
    animated = true,
  ): void {
    const fallbackProgress = clamp01(entry.progress);
    this.pendingHeadingLine = entry.target?.isConnected ? null : entry.sourceLine;
    if (audible) {
      this.sound?.settle(this.window);
    }
    this.startNavigation(() => this.getHeadingNavigationTop(
      entry.sourceLine,
      fallbackProgress,
    ), animated);
  }

  private navigateToProgress(
    progress: number,
    audible = false,
    animated = true,
  ): void {
    this.pendingHeadingLine = null;
    const safeProgress = clamp01(progress);
    if (audible) {
      this.sound?.settle(this.window);
    }
    this.startNavigation(() => this.getProgressTop(safeProgress), animated);
  }

  private dragToProgress(progress: number): void {
    this.pendingHeadingLine = null;
    this.dragProgress = clamp01(progress);
    const headingIndex = this.headingIndexAtProgress(this.dragProgress);
    if (
      this.lastDragHeadingIndex !== null
      && headingIndex !== this.lastDragHeadingIndex
    ) {
      this.sound?.tick(this.dragProgress, this.window);
    }
    this.lastDragHeadingIndex = headingIndex;
    this.cancelNavigation();
    this.cancelProgressSettlement();
    this.scroller.scrollTo({
      top: this.getProgressTop(this.dragProgress),
      behavior: "auto",
    });
  }

  private settleDraggedProgress(progress: number): void {
    this.finishDraggedProgress(progress, true);
  }

  private cancelDraggedProgress(progress: number): void {
    this.finishDraggedProgress(progress, false);
  }

  private finishDraggedProgress(progress: number, audible: boolean): void {
    this.pendingHeadingLine = null;
    this.dragProgress = null;
    this.lastDragHeadingIndex = null;
    this.cancelNavigation();
    this.cancelProgressSettlement();
    if (audible) {
      this.sound?.settle(this.window);
    }
    this.progressSettlement = {
      progress: clamp01(progress),
      lastTarget: null,
      stableFrames: 0,
      finalFrames: 0,
    };
    this.runProgressSettlement();
  }

  private headingIndexAtProgress(progress: number): number {
    let active = -1;
    for (let index = 0; index < this.entries.length; index += 1) {
      if (this.entries[index].progress > progress) {
        break;
      }
      active = index;
    }
    return active;
  }

  private readonly runProgressSettlement = (): void => {
    this.progressSettlementFrameId = null;
    const settlement = this.progressSettlement;
    if (!settlement || this.destroyed) {
      return;
    }
    const target = this.getProgressTop(settlement.progress);
    this.scroller.scrollTo({ top: target, behavior: "auto" });

    if (checkSettled(settlement, target, this.scroller.scrollTop)) {
      this.progressSettlement = null;
      return;
    }
    this.progressSettlementFrameId = this.environment.requestAnimationFrame(
      this.runProgressSettlement,
    );
  };

  private finishPendingHeadingNavigation(): void {
    if (this.pendingHeadingLine === null) {
      return;
    }
    const entry = this.entries.find((candidate) => (
      candidate.sourceLine === this.pendingHeadingLine
      && candidate.target?.isConnected
    ));
    if (!entry?.target) {
      return;
    }
    this.pendingHeadingLine = null;
    if (!this.navigation) {
      this.startNavigation(() => this.getHeadingNavigationTop(
        entry.sourceLine,
        clamp01(entry.progress),
      ));
    }
  }

  private getRenderedHeadingTop(target: HTMLElement): number {
    return target.getBoundingClientRect().top
      - this.scroller.getBoundingClientRect().top
      + this.scroller.scrollTop;
  }

  private getProgressTop(progress: number): number {
    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    return progress * maxScroll;
  }

  private getHeadingNavigationTop(sourceLine: number, fallbackProgress: number): number {
    const current = this.entries.find((entry) => entry.sourceLine === sourceLine);
    if (current?.target?.isConnected) {
      return this.getRenderedHeadingTop(current.target);
    }
    return this.getProgressTop(fallbackProgress);
  }

  private startNavigation(resolveTop: () => number, animated = true): void {
    this.dragProgress = null;
    this.lastDragHeadingIndex = null;
    this.cancelNavigation();
    this.cancelProgressSettlement();
    const startTop = this.scroller.scrollTop;
    const target = this.resolveNavigationTop(resolveTop);
    if (!animated || this.environment.reducedMotion()) {
      this.scroller.scrollTo({ top: target, behavior: "auto" });
      return;
    }
    this.navigation = {
      resolveTop,
      startTop,
      startedAt: null,
      duration: Math.min(
        NAVIGATION_MAX_DURATION,
        Math.max(NAVIGATION_MIN_DURATION, Math.abs(target - startTop) * NAVIGATION_MS_PER_PIXEL),
      ),
      lastTarget: null,
      stableFrames: 0,
      finalFrames: 0,
    };
    this.navigationFrameId = this.environment.requestAnimationFrame(this.animateNavigation);
  }

  private readonly animateNavigation = (timestamp: number): void => {
    this.navigationFrameId = null;
    const navigation = this.navigation;
    if (!navigation || this.destroyed) {
      return;
    }
    navigation.startedAt ??= timestamp;
    const elapsed = Math.max(0, timestamp - navigation.startedAt);
    const progress = Math.min(1, elapsed / navigation.duration);
    const easedProgress = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    const target = this.resolveNavigationTop(navigation.resolveTop);
    const top = progress < 1
      ? navigation.startTop + (target - navigation.startTop) * easedProgress
      : target;
    this.scroller.scrollTo({ top, behavior: "auto" });

    if (progress < 1) {
      this.navigationFrameId = this.environment.requestAnimationFrame(this.animateNavigation);
      return;
    }

    if (checkSettled(navigation, target, this.scroller.scrollTop)) {
      this.navigation = null;
      return;
    }
    this.navigationFrameId = this.environment.requestAnimationFrame(this.animateNavigation);
  };

  private resolveNavigationTop(resolveTop: () => number): number {
    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    return Math.min(maxScroll, Math.max(0, resolveTop()));
  }

  private cancelNavigation(): void {
    if (this.navigationFrameId !== null) {
      this.environment.cancelAnimationFrame(this.navigationFrameId);
      this.navigationFrameId = null;
    }
    this.navigation = null;
  }

  private cancelProgressSettlement(): void {
    if (this.progressSettlementFrameId !== null) {
      this.environment.cancelAnimationFrame(this.progressSettlementFrameId);
      this.progressSettlementFrameId = null;
    }
    this.progressSettlement = null;
  }
}
