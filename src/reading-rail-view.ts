import {
  gaussianWaveOffset,
  isSpringSettled,
  isWithinWaveRadius,
  stepSpring,
  WAVE_DYNAMIC_RADIUS,
} from "./motion";
import type { RailSoundProvider } from "./audio-feedback";
import {
  INLINE_ORB_SVGS,
  ORB_IMAGE_DATA_URLS,
  STATIC_ORB_STYLES,
  resolveOrbStyle,
  type OrbStyleSetting,
  type ResolvedOrbStyle,
} from "./orb-styles";
import {
  labelListOverflows,
  resolveVariableLabelPositions,
} from "./outline-model";
import { clamp01, progressFromPointer } from "./progress";
import {
  createSemanticMarker,
  resolveReadingMarkerProgress,
} from "./reading-memory";
import { normalizeWaypoints } from "./settings";
import type { OutlineEntry, ReadingWaypoint } from "./types";
import type { OutlineScope } from "./outline-preferences";

const PROXIMITY_DISTANCE = 96;
const COLLAPSE_DELAY = 3000;
const LABEL_GAP = 4;
const LINE_FOCUS_HEIGHT = 192;
const ORB_ROTATION_PER_PX = 3.2;

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? 0) < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? 0) <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

interface MutationObserverHandle {
  observe(target: Node, options?: MutationObserverInit): void;
  disconnect(): void;
}

export interface RailViewCallbacks {
  onHeadingSelect(entry: OutlineEntry, audible?: boolean, animated?: boolean): void;
  onProgressSelect(progress: number, audible?: boolean, animated?: boolean): void;
  onProgressDrag?(progress: number): void;
  onProgressDragEnd?(progress: number): void;
  onProgressDragCancel?(progress: number): void;
  onWaypointsChange?(waypoints: readonly ReadingWaypoint[]): void;
  onHeadingStep?(delta: number): void;
}

export interface RailAppearanceProvider {
  getOrbStyle(): OrbStyleSetting;
  getAssetUrl(path: string): string;
}

export interface RailViewEnvironment {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  reducedMotion(): boolean;
  createMutationObserver(callback: MutationCallback): MutationObserverHandle;
}

export interface ReadingRailViewOptions {
  appearance?: RailAppearanceProvider;
  environment?: RailViewEnvironment;
  sound?: RailSoundProvider;
}

const DEFAULT_APPEARANCE: RailAppearanceProvider = {
  getOrbStyle: () => "default",
  getAssetUrl: (path) => path,
};

export class ReadingRailView {
  private readonly host: HTMLElement;
  private readonly window: Window;
  private readonly root: HTMLElement;
  private readonly track: HTMLElement;
  private readonly line: HTMLElement;
  private readonly lineFocus: HTMLElement;
  private readonly ticksContainer: HTMLElement;
  private readonly headingTicksContainer: HTMLElement;
  private readonly active: HTMLElement;
  private readonly waypointsContainer: HTMLElement;
  private readonly resumeMarker: HTMLButtonElement;
  private readonly orb: HTMLElement;
  private readonly progressLabel: HTMLElement;
  private readonly labelsContainer: HTMLElement;
  private readonly callbacks: RailViewCallbacks;
  private readonly appearance: RailAppearanceProvider;
  private readonly environment: RailViewEnvironment;
  private readonly sound?: RailSoundProvider;
  private ticks: HTMLElement[] = [];
  private tickYPositions: number[] = [];
  private tickWaveOffsets: number[] = [];
  private tickWaveActiveIndices = new Set<number>();
  private headingTicks: HTMLElement[] = [];
  private headingTickYPositions: number[] = [];
  private headingTickWaveOffsets: number[] = [];
  private headingTickWaveActiveIndices = new Set<number>();
  private labels: HTMLButtonElement[] = [];
  private waypointButtons: HTMLButtonElement[] = [];
  private waypoints: ReadingWaypoint[] = [];
  private lastWaypointRenderKey = "";
  private resumeProgress: number | null = null;
  private entries: OutlineEntry[] = [];
  private activeHeadingIndex = -1;
  private outlineScope: OutlineScope = "all";
  private lastLabelBranchKey = "";
  private pinned = false;
  private lastReadTickIndex = Number.MIN_SAFE_INTEGER;
  private lastProgressText = "";
  private lastProgressPercentage = -1;
  private lastLineFocusTransform = "";
  private currentProgress = 0;
  private trackHeight = 1;
  private targetPosition = 0;
  private displayedPosition = 0;
  private velocity = 0;
  private positionInitialized = false;
  private visible = true;
  private frameId: number | null = null;
  private proximityFrameId: number | null = null;
  private pendingProximityPoint: { clientX: number; clientY: number } | null = null;
  private lastFrameTimestamp: number | null = null;
  private collapseTimer: number | null = null;
  private dragPointerId: number | null = null;
  private followObserver: MutationObserverHandle | null = null;
  private orbImage: HTMLImageElement | null = null;
  private orbMedia: HTMLElement | null = null;
  private resolvedOrbStyle: ResolvedOrbStyle = "default";
  private needsLabelLayout = false;
  private labelListDense = false;
  private hasCelebratedCompletion = false;
  private destroyed = false;

  private constructor(
    host: HTMLElement,
    callbacks: RailViewCallbacks,
    options: ReadingRailViewOptions,
  ) {
    const document = host.ownerDocument;
    const window = document.defaultView;
    if (!window) {
      throw new Error("Crisp Reading Rail requires a window-backed document.");
    }
    this.host = host;
    this.window = window;
    this.callbacks = callbacks;
    this.appearance = options.appearance ?? DEFAULT_APPEARANCE;
    this.sound = options.sound;
    this.environment = options.environment ?? {
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
      reducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ?? false,
      createMutationObserver: (callback) => new window.MutationObserver(callback),
    };

    this.root = document.createElement("nav");
    this.root.className = "crisp-reading-rail";
    this.root.setAttribute("aria-label", "Article navigation");

    this.track = document.createElement("div");
    this.track.className = "crisp-reading-rail__track";
    this.track.setAttribute("role", "slider");
    this.track.setAttribute("tabindex", "0");
    this.track.setAttribute("aria-label", "Reading position");
    this.track.setAttribute("aria-valuemin", "0");
    this.track.setAttribute("aria-valuemax", "100");
    this.track.setAttribute("aria-valuenow", "0");
    this.track.setAttribute(
      "aria-description",
      "Click to navigate. Double-click or press M to save a reading waypoint.",
    );

    this.line = document.createElement("div");
    this.line.className = "crisp-reading-rail__line";
    this.line.setAttribute("aria-hidden", "true");

    this.lineFocus = document.createElement("div");
    this.lineFocus.className = "crisp-reading-rail__line-focus";
    this.line.append(this.lineFocus);

    this.ticksContainer = document.createElement("div");
    this.ticksContainer.className = "crisp-reading-rail__ticks";
    this.ticksContainer.setAttribute("aria-hidden", "true");

    this.headingTicksContainer = document.createElement("div");
    this.headingTicksContainer.className = "crisp-reading-rail__heading-ticks";
    this.headingTicksContainer.setAttribute("aria-hidden", "true");

    this.active = document.createElement("div");
    this.active.className = "crisp-reading-rail__active";
    this.active.setAttribute("aria-hidden", "true");

    this.waypointsContainer = document.createElement("div");
    this.waypointsContainer.className = "crisp-reading-rail__waypoints";

    this.resumeMarker = document.createElement("button");
    this.resumeMarker.type = "button";
    this.resumeMarker.className = "crisp-reading-rail__resume-marker";
    this.resumeMarker.textContent = "◆";
    this.resumeMarker.hidden = true;
    this.resumeMarker.title = "Jump to the last reading position";
    this.resumeMarker.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.resumeProgress !== null) {
        this.callbacks.onProgressSelect(this.resumeProgress, false, false);
      }
    });
    this.waypointsContainer.append(this.resumeMarker);

    this.orb = document.createElement("div");
    this.orb.className = "crisp-reading-rail__orb";
    this.orb.setAttribute("aria-hidden", "true");

    this.progressLabel = document.createElement("span");
    this.progressLabel.className = "crisp-reading-rail__progress";
    this.progressLabel.setAttribute("aria-hidden", "true");
    this.progressLabel.textContent = "0.00";

    this.labelsContainer = document.createElement("div");
    this.labelsContainer.className = "crisp-reading-rail__labels";

    this.track.append(
      this.line,
      this.ticksContainer,
      this.headingTicksContainer,
      this.active,
      this.waypointsContainer,
      this.orb,
      this.progressLabel,
    );
    this.root.append(this.track, this.labelsContainer);
    host.append(this.root);

    this.track.addEventListener("pointerdown", this.handlePointerDown);
    this.track.addEventListener("dblclick", this.handleTrackDoubleClick);
    this.track.addEventListener("keydown", this.handleKeyDown);
    this.orb.addEventListener("pointerdown", this.handleOrbPointerDown);
    this.orb.addEventListener("animationend", this.handleCelebrationEnd);
    this.host.addEventListener("pointermove", this.handlePointerMove, { passive: true });
    this.host.addEventListener("pointerleave", this.handlePointerLeave);
    this.root.addEventListener("focusin", this.handleFocusIn);
    this.root.addEventListener("focusout", this.handleFocusOut);
    this.refreshAppearance();
  }

  static mount(
    host: HTMLElement,
    callbacks: RailViewCallbacks,
    options: ReadingRailViewOptions = {},
  ): ReadingRailView {
    return new ReadingRailView(host, callbacks, options);
  }

  setOutline(entries: readonly OutlineEntry[], tickCount: number): void {
    const document = this.root.ownerDocument;
    const count = Math.max(0, Math.floor(tickCount));
    const nextEntries = entries.map((entry) => ({ ...entry }));
    const canReuseNodes = count === this.ticks.length
      && nextEntries.length === this.entries.length
      && nextEntries.every((entry, index) => {
        const previous = this.entries[index];
        return previous?.sourceLine === entry.sourceLine
          && previous.text === entry.text
          && previous.level === entry.level;
      });
    this.entries = nextEntries;

    if (canReuseNodes) {
      this.headingTicks.forEach((tick, index) => {
        const progress = clamp01(this.entries[index]?.progress ?? 0).toString();
        if (tick.style.getPropertyValue("--crisp-reading-heading-progress") !== progress) {
          tick.style.setProperty("--crisp-reading-heading-progress", progress);
        }
      });
      this.updateLabelBranch();
      this.measureLayout();
      this.updateReadTicks();
      this.renderPosition();
      return;
    }

    this.ticks = Array.from({ length: count }, (_, index) => {
      const tick = document.createElement("span");
      tick.className = "crisp-reading-rail__tick";
      tick.setAttribute("aria-hidden", "true");
      const progress = count <= 1 ? 0 : index / (count - 1);
      tick.dataset.progress = progress.toString();
      return tick;
    });
    this.ticksContainer.replaceChildren(...this.ticks);
    this.tickWaveOffsets = Array.from({ length: this.ticks.length }, () => Number.NaN);
    this.tickWaveActiveIndices.clear();

    this.headingTicks = this.entries.map((entry) => {
      const tick = document.createElement("span");
      tick.className = "crisp-reading-rail__heading-tick";
      tick.dataset.level = String(entry.level);
      tick.style.setProperty(
        "--crisp-reading-heading-progress",
        clamp01(entry.progress).toString(),
      );
      tick.setAttribute("aria-hidden", "true");
      return tick;
    });
    this.headingTicksContainer.replaceChildren(...this.headingTicks);
    this.headingTickWaveOffsets = Array.from(
      { length: this.headingTicks.length },
      () => Number.NaN,
    );
    this.headingTickWaveActiveIndices.clear();

    this.labels = this.entries.map((entry, index) => {
      const label = document.createElement("button");
      label.type = "button";
      label.className = "crisp-reading-rail__label";
      label.textContent = entry.text;
      label.style.setProperty("--crisp-reading-level", String(entry.level - 2));
      label.addEventListener("click", (event) => {
        const currentEntry = this.entries[index];
        if (currentEntry) {
          const pointerActivated = event.detail > 0;
          this.callbacks.onHeadingSelect(
            currentEntry,
            pointerActivated,
            pointerActivated,
          );
        }
      });
      return label;
    });
    this.labelsContainer.replaceChildren(...this.labels);
    this.activeHeadingIndex = -1;
    this.lastLabelBranchKey = "";
    this.lastReadTickIndex = Number.MIN_SAFE_INTEGER;
    this.updateLabelBranch();
    this.measureLayout();
    this.renderWaypoints();
    this.updateReadTicks();
    this.renderPosition();
  }

  setOutlineScope(scope: OutlineScope): void {
    if (scope === this.outlineScope) {
      return;
    }
    this.outlineScope = scope;
    this.root.classList.toggle("is-current-h2", scope === "currentH2");
    if (this.updateLabelBranch()) {
      this.measureLayout();
    }
  }

  setProgress(progress: number): void {
    if (this.dragPointerId !== null) {
      return;
    }
    this.updateProgressState(progress);

    if (!this.visible) {
      return;
    }
    if (!this.positionInitialized || this.environment.reducedMotion()) {
      this.snapToTarget();
      return;
    }
    this.scheduleAnimation();
  }

  setWaypoints(waypoints: readonly (ReadingWaypoint | number)[]): void {
    const next = normalizeWaypoints(waypoints);
    if (
      next.length === this.waypoints.length
      && next.every((value, index) => (
        JSON.stringify(value) === JSON.stringify(this.waypoints[index])
      ))
    ) {
      return;
    }
    this.waypoints = next;
    this.renderWaypoints();
  }

  setResumeMarker(progress: number | null): void {
    const next = progress === null ? null : clamp01(progress);
    if (next === this.resumeProgress) {
      return;
    }
    this.resumeProgress = next;
    this.resumeMarker.hidden = next === null;
    if (next === null) {
      this.resumeMarker.removeAttribute("data-progress");
      this.resumeMarker.style.removeProperty("--crisp-reading-resume-progress");
      this.resumeMarker.removeAttribute("aria-label");
      return;
    }
    this.resumeMarker.dataset.progress = next.toString();
    this.resumeMarker.style.setProperty("--crisp-reading-resume-progress", next.toString());
    this.resumeMarker.setAttribute(
      "aria-label",
      `Last reading position at ${Math.round(next * 100)} percent`,
    );
  }

  setActiveHeading(index: number): void {
    const nextIndex = index >= 0 && index < this.entries.length ? index : -1;
    if (nextIndex === this.activeHeadingIndex) {
      return;
    }
    const previousIndex = this.activeHeadingIndex;
    this.labels[previousIndex]?.removeAttribute("aria-current");
    this.headingTicks[previousIndex]?.classList.remove("is-active");
    this.labels[nextIndex]?.setAttribute("aria-current", "location");
    this.headingTicks[nextIndex]?.classList.add("is-active");
    this.activeHeadingIndex = nextIndex;
    if (this.updateLabelBranch()) {
      this.measureLayout();
    }
    if (this.labelListDense && nextIndex >= 0) {
      const label = this.labels[nextIndex];
      if (label) {
        this.scrollLabelIntoView(label);
      }
    }
  }

  setExpanded(expanded: boolean): void {
    if (!expanded) {
      this.cancelCollapse();
    }
    this.root.classList.toggle("is-expanded", expanded);
  }

  togglePinned(): boolean {
    this.setPinned(!this.pinned);
    return this.pinned;
  }

  private setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.root.classList.toggle("is-pinned", pinned);
    this.root.setAttribute("data-pinned", pinned ? "true" : "false");
    if (pinned) {
      this.expandNow();
    }
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.root.hidden = !visible;
    if (!visible) {
      const dragProgress = this.dragPointerId === null ? null : this.currentProgress;
      this.finishDrag();
      if (dragProgress !== null) {
        this.callbacks.onProgressDragCancel?.(dragProgress);
      }
      this.cancelAnimation();
      this.cancelProximityCheck();
      this.positionInitialized = false;
      this.setExpanded(false);
      return;
    }
    this.measureLayout();
  }

  refreshAppearance(): void {
    this.followObserver?.disconnect();
    this.followObserver = null;
    const setting = this.appearance.getOrbStyle();
    this.applyOrbStyle(resolveOrbStyle(setting, this.root.ownerDocument));
    if (setting !== "followFileExplorer") {
      return;
    }
    this.followObserver = this.environment.createMutationObserver((records) => {
      if (this.destroyed || !this.hasCompanionMutation(records)) {
        return;
      }
      const nextStyle = resolveOrbStyle(setting, this.root.ownerDocument);
      if (nextStyle !== this.resolvedOrbStyle) {
        this.applyOrbStyle(nextStyle);
      }
    });
    this.followObserver.observe(this.root.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-orb-style"],
      childList: true,
      subtree: true,
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.finishDrag();
    this.cancelAnimation();
    this.cancelProximityCheck();
    this.cancelCollapse();
    this.followObserver?.disconnect();
    this.followObserver = null;
    if (this.orbImage) {
      this.orbImage.onerror = null;
      this.orbImage = null;
    }
    this.track.removeEventListener("pointerdown", this.handlePointerDown);
    this.track.removeEventListener("dblclick", this.handleTrackDoubleClick);
    this.track.removeEventListener("keydown", this.handleKeyDown);
    this.orb.removeEventListener("pointerdown", this.handleOrbPointerDown);
    this.orb.removeEventListener("animationend", this.handleCelebrationEnd);
    this.host.removeEventListener("pointermove", this.handlePointerMove);
    this.host.removeEventListener("pointerleave", this.handlePointerLeave);
    this.root.removeEventListener("focusin", this.handleFocusIn);
    this.root.removeEventListener("focusout", this.handleFocusOut);
    this.root.remove();
    this.ticks = [];
    this.tickWaveOffsets = [];
    this.tickWaveActiveIndices.clear();
    this.headingTicks = [];
    this.headingTickWaveOffsets = [];
    this.headingTickWaveActiveIndices.clear();
    this.labels = [];
    this.waypointButtons = [];
    this.waypoints = [];
    this.lastWaypointRenderKey = "";
    this.entries = [];
  }

  private measureLayout(): void {
    if (!this.visible || this.root.hidden) {
      this.needsLabelLayout = true;
      return;
    }
    const measuredTrackHeight = this.track.clientHeight
      || this.track.getBoundingClientRect().height;
    if (measuredTrackHeight > 0) {
      this.trackHeight = measuredTrackHeight;
    }
    this.tickYPositions = this.ticks.map((tick) => (
      Number(tick.dataset.progress ?? 0) * this.trackHeight
    ));
    this.headingTickYPositions = this.entries.map((entry) => (
      clamp01(entry.progress) * this.trackHeight
    ));
    const labelHeights = this.labels.map((label) => (
      label.getBoundingClientRect().height || label.scrollHeight || 20
    ));
    const dense = labelListOverflows(
      this.entries,
      this.trackHeight,
      labelHeights,
      LABEL_GAP,
    );
    if (dense !== this.labelListDense) {
      this.labelListDense = dense;
      this.root.classList.toggle("is-dense", dense);
      if (!dense) {
        this.labelsContainer.scrollTop = 0;
      }
    }
    if (dense) {
      this.labels.forEach((label) => {
        label.style.setProperty("--crisp-reading-label-y", "0px");
      });
    } else {
      const resolved = resolveVariableLabelPositions(
        this.entries,
        this.trackHeight,
        labelHeights,
        LABEL_GAP,
      );
      this.labels.forEach((label, index) => {
        label.style.setProperty(
          "--crisp-reading-label-y",
          `${resolved[index]?.labelY ?? 0}px`,
        );
      });
    }
    this.targetPosition = this.currentProgress * this.trackHeight;
    this.needsLabelLayout = false;
  }

  private scrollLabelIntoView(label: HTMLElement): void {
    const container = this.labelsContainer;
    const containerRect = container.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    if (labelRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - labelRect.top;
    } else if (labelRect.bottom > containerRect.bottom) {
      container.scrollTop += labelRect.bottom - containerRect.bottom;
    }
  }

  private snapToTarget(): void {
    this.cancelAnimation();
    this.displayedPosition = this.targetPosition;
    this.velocity = 0;
    this.positionInitialized = true;
    this.renderPosition();
  }

  private scheduleAnimation(): void {
    if (this.frameId !== null || this.destroyed || !this.visible) {
      return;
    }
    this.frameId = this.environment.requestAnimationFrame(this.handleAnimationFrame);
  }

  private readonly handleAnimationFrame = (timestamp: number): void => {
    this.frameId = null;
    if (this.destroyed || !this.visible) {
      return;
    }
    const delta = this.lastFrameTimestamp === null
      ? 1 / 60
      : (timestamp - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = timestamp;
    const next = stepSpring(
      { position: this.displayedPosition, velocity: this.velocity },
      this.targetPosition,
      delta,
    );
    this.displayedPosition = next.position;
    this.velocity = next.velocity;
    if (isSpringSettled(next, this.targetPosition)) {
      this.displayedPosition = this.targetPosition;
      this.velocity = 0;
    }
    this.renderPosition();
    if (this.displayedPosition !== this.targetPosition || this.velocity !== 0) {
      this.scheduleAnimation();
    } else {
      this.lastFrameTimestamp = null;
    }
  };

  private cancelAnimation(): void {
    if (this.frameId !== null) {
      this.environment.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.lastFrameTimestamp = null;
  }

  private renderPosition(): void {
    const translateY = `translateY(${this.displayedPosition}px)`;
    this.active.style.transform = `${translateY} translateY(-50%)`;
    this.orb.style.transform = `${translateY} translate(50%, -50%)`;
    this.progressLabel.style.transform = `${translateY} translateY(-50%)`;
    const lineFocusTransform = `translate3d(0px, ${
      this.displayedPosition - LINE_FOCUS_HEIGHT / 2
    }px, 0)`;
    if (lineFocusTransform !== this.lastLineFocusTransform) {
      this.lineFocus.style.transform = lineFocusTransform;
      this.lastLineFocusTransform = lineFocusTransform;
    }
    this.applyWave(
      this.ticks,
      this.tickYPositions,
      this.tickWaveOffsets,
      this.tickWaveActiveIndices,
    );
    this.applyWave(
      this.headingTicks,
      this.headingTickYPositions,
      this.headingTickWaveOffsets,
      this.headingTickWaveActiveIndices,
    );
    if (
      this.orbMedia
      && this.resolvedOrbStyle !== "default"
      && !STATIC_ORB_STYLES.has(this.resolvedOrbStyle)
      && !this.environment.reducedMotion()
    ) {
      this.orbMedia.style.transform =
        `rotate(${this.displayedPosition * ORB_ROTATION_PER_PX}deg)`;
    }
  }

  private applyWave(
    elements: readonly HTMLElement[],
    positions: readonly number[],
    previousOffsets: number[],
    activeIndices: Set<number>,
  ): void {
    const minimum = this.displayedPosition - WAVE_DYNAMIC_RADIUS;
    const maximum = this.displayedPosition + WAVE_DYNAMIC_RADIUS;
    const first = lowerBound(positions, minimum);
    const end = upperBound(positions, maximum);

    for (const index of [...activeIndices]) {
      if (index >= first && index < end) {
        continue;
      }
      const element = elements[index];
      if (element && previousOffsets[index] !== 0) {
        element.style.setProperty("--crisp-reading-wave-x", "0px");
        previousOffsets[index] = 0;
      }
      activeIndices.delete(index);
    }

    for (let index = first; index < end; index += 1) {
      const element = elements[index];
      if (!element) {
        continue;
      }
      const itemY = positions[index] ?? 0;
      const rawOffset = isWithinWaveRadius(this.displayedPosition, itemY)
        ? -gaussianWaveOffset(this.displayedPosition, itemY)
        : 0;
      const offset = Math.round(rawOffset * 100) / 100;
      if (Object.is(previousOffsets[index], offset)) {
        activeIndices.add(index);
        continue;
      }
      element.style.setProperty("--crisp-reading-wave-x", `${offset}px`);
      previousOffsets[index] = offset;
      activeIndices.add(index);
    }
  }

  private applyOrbStyle(style: ResolvedOrbStyle): void {
    if (this.orbImage) {
      this.orbImage.onerror = null;
      this.orbImage = null;
    }
    this.orb.replaceChildren();
    this.orbMedia = null;
    this.resolvedOrbStyle = style;
    this.orb.dataset.orbStyle = style;
    if (style === "default") {
      return;
    }

    const imageDataUrl = ORB_IMAGE_DATA_URLS[style];
    if (imageDataUrl) {
      const wrapper = this.root.ownerDocument.createElement("span");
      wrapper.className = "crisp-reading-rail__orb-media";
      const image = this.root.ownerDocument.createElement("img");
      image.className = "crisp-reading-rail__orb-image";
      image.alt = "";
      image.draggable = false;
      image.src = imageDataUrl;
      image.onerror = () => {
        if (this.orbImage === image) {
          this.applyOrbStyle("default");
        }
      };
      wrapper.append(image);
      this.orb.append(wrapper);
      this.orbImage = image;
      this.orbMedia = wrapper;
      this.renderPosition();
      return;
    }

    const inlineSvg = INLINE_ORB_SVGS[style];
    if (!inlineSvg) {
      this.applyOrbStyle("default");
      return;
    }
    const wrapper = this.root.ownerDocument.createElement("span");
    wrapper.className = "crisp-reading-rail__orb-media";
    wrapper.innerHTML = inlineSvg;
    this.orb.append(wrapper);
    this.orbMedia = wrapper;
    this.renderPosition();
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.root.contains(event.target as Node | null)) {
      this.cancelProximityCheck();
      this.expandNow();
      return;
    }
    this.pendingProximityPoint = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (this.proximityFrameId !== null) {
      return;
    }
    this.proximityFrameId = this.environment.requestAnimationFrame(() => {
      this.proximityFrameId = null;
      const point = this.pendingProximityPoint;
      this.pendingProximityPoint = null;
      if (!point || this.destroyed || !this.visible) {
        return;
      }
      this.updatePointerProximity(point.clientX, point.clientY);
    });
  };

  private updatePointerProximity(clientX: number, clientY: number): void {
    const bounds = this.root.getBoundingClientRect();
    const verticallyAligned = clientY >= bounds.top && clientY <= bounds.bottom;
    const horizontallyNear = clientX >= bounds.left - PROXIMITY_DISTANCE
      && clientX <= bounds.right;
    if (verticallyAligned && horizontallyNear) {
      this.expandNow();
    } else {
      this.scheduleCollapse();
    }
  }

  private readonly handlePointerLeave = (): void => {
    if (this.dragPointerId !== null) {
      return;
    }
    this.cancelProximityCheck();
    this.scheduleCollapse();
  };

  private readonly handleFocusIn = (): void => {
    this.expandNow();
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (this.root.contains(event.relatedTarget as Node | null)) {
      return;
    }
    this.scheduleCollapse();
  };

  private expandNow(): void {
    this.cancelCollapse();
    this.root.classList.add("is-expanded");
  }

  private scheduleCollapse(): void {
    if (
      this.pinned
      || !this.root.classList.contains("is-expanded")
      || this.collapseTimer !== null
    ) {
      return;
    }
    this.collapseTimer = this.window.setTimeout(() => {
      this.collapseTimer = null;
      this.root.classList.remove("is-expanded");
    }, COLLAPSE_DELAY);
  }

  private cancelCollapse(): void {
    if (this.collapseTimer === null) {
      return;
    }
    this.window.clearTimeout(this.collapseTimer);
    this.collapseTimer = null;
  }

  private cancelProximityCheck(): void {
    if (this.proximityFrameId !== null) {
      this.environment.cancelAnimationFrame(this.proximityFrameId);
      this.proximityFrameId = null;
    }
    this.pendingProximityPoint = null;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (
      event.isPrimary === false
      || event.button !== 0
      || event.detail > 1
      || (event.target as Element | null)?.closest(
        ".crisp-reading-rail__label, .crisp-reading-rail__orb, "
        + ".crisp-reading-rail__waypoint",
      )
    ) {
      return;
    }
    const bounds = this.track.getBoundingClientRect();
    if (bounds.height <= 0) {
      return;
    }
    this.track.focus({ preventScroll: true });
    event.preventDefault();
    this.callbacks.onProgressSelect(
      progressFromPointer(event.clientY, bounds.top, bounds.height),
      true,
      true,
    );
  };

  private readonly handleTrackDoubleClick = (event: MouseEvent): void => {
    if (
      event.button !== 0
      || (event.target as Element | null)?.closest(
        ".crisp-reading-rail__label, .crisp-reading-rail__orb, "
        + ".crisp-reading-rail__waypoint",
      )
    ) {
      return;
    }
    const bounds = this.track.getBoundingClientRect();
    if (bounds.height <= 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.addWaypoint(progressFromPointer(event.clientY, bounds.top, bounds.height));
  };

  private readonly handleOrbPointerDown = (event: PointerEvent): void => {
    if (
      this.dragPointerId !== null
      || event.isPrimary === false
      || event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.dragPointerId = event.pointerId;
    this.cancelAnimation();
    this.expandNow();
    this.root.classList.add("is-dragging");
    this.orb.classList.add("is-dragging");
    this.track.focus({ preventScroll: true });
    try {
      this.orb.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable in synthetic or closing windows.
    }
    this.updateDragProgress(event.clientY);
    this.window.addEventListener("pointermove", this.handleDragPointerMove, {
      passive: false,
    });
    this.window.addEventListener("pointerup", this.handleDragPointerUp, {
      passive: false,
    });
    this.window.addEventListener("pointercancel", this.handleDragPointerUp, {
      passive: false,
    });
    this.window.addEventListener("blur", this.handleDragBlur);
  };

  private readonly handleDragPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.updateDragProgress(event.clientY);
  };

  private readonly handleDragPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const cancelled = event.type === "pointercancel";
    const progress = cancelled
      ? this.currentProgress
      : this.updateDragProgress(event.clientY) ?? this.currentProgress;
    this.finishDrag();
    if (cancelled) {
      this.callbacks.onProgressDragCancel?.(progress);
    } else {
      this.callbacks.onProgressDragEnd?.(progress);
    }
    this.scheduleCollapse();
  };

  private readonly handleDragBlur = (): void => {
    const progress = this.currentProgress;
    this.finishDrag();
    this.callbacks.onProgressDragCancel?.(progress);
  };

  private updateDragProgress(clientY: number): number | null {
    const bounds = this.track.getBoundingClientRect();
    if (bounds.height <= 0) {
      return null;
    }
    const progress = progressFromPointer(clientY, bounds.top, bounds.height);
    this.updateProgressState(progress);
    this.snapToTarget();
    this.callbacks.onProgressDrag?.(progress);
    return progress;
  }

  private finishDrag(): void {
    const pointerId = this.dragPointerId;
    if (pointerId === null) {
      return;
    }
    try {
      this.orb.releasePointerCapture(pointerId);
    } catch {
      // Capture may already be released by the host window.
    }
    this.dragPointerId = null;
    this.root.classList.remove("is-dragging");
    this.orb.classList.remove("is-dragging");
    this.window.removeEventListener("pointermove", this.handleDragPointerMove);
    this.window.removeEventListener("pointerup", this.handleDragPointerUp);
    this.window.removeEventListener("pointercancel", this.handleDragPointerUp);
    this.window.removeEventListener("blur", this.handleDragBlur);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "p") {
      event.preventDefault();
      this.togglePinned();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.setPinned(false);
      this.setExpanded(false);
      return;
    }
    if (key === "j" || key === "k") {
      event.preventDefault();
      this.callbacks.onHeadingStep?.(key === "j" ? 1 : -1);
      return;
    }
    if (key === "m") {
      event.preventDefault();
      this.addWaypoint(this.currentProgress);
      return;
    }

    const changes: Record<string, number> = {
      ArrowDown: 0.01,
      ArrowLeft: -0.01,
      ArrowRight: 0.01,
      ArrowUp: -0.01,
      PageDown: 0.1,
      PageUp: -0.1,
    };
    let next: number | undefined;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = 1;
    } else if (event.key in changes) {
      next = clamp01(this.currentProgress + changes[event.key]);
    }

    if (next === undefined) {
      return;
    }
    event.preventDefault();
    this.updateProgressState(next);
    this.snapToTarget();
    this.callbacks.onProgressSelect(next, false, false);
  };

  private readonly handleCelebrationEnd = (event: AnimationEvent): void => {
    if (
      event.target === this.orb
      && event.animationName === "crisp-orb-celebrate"
    ) {
      this.orb.classList.remove("is-celebrating");
    }
  };

  private hasCompanionMutation(records: readonly MutationRecord[]): boolean {
    const selector = ".crisp-fe-orb";
    const asElement = (node: Node): Element | null => (
      node.nodeType === node.ELEMENT_NODE ? node as Element : null
    );
    const containsCompanion = (node: Node): boolean => {
      const element = asElement(node);
      return element !== null
        && (element.matches(selector) || element.querySelector(selector) !== null);
    };
    return records.some((record) => {
      if (record.type === "attributes") {
        return asElement(record.target)?.matches(selector) ?? false;
      }
      if (record.type !== "childList") {
        return false;
      }
      return Array.from(record.addedNodes).some(containsCompanion)
        || Array.from(record.removedNodes).some(containsCompanion);
    });
  }

  private updateReadTicks(): void {
    if (this.ticks.length === 0) {
      this.lastReadTickIndex = -1;
      return;
    }
    const nextIndex = Math.min(
      this.ticks.length - 1,
      Math.floor(this.currentProgress * (this.ticks.length - 1) + Number.EPSILON),
    );
    if (this.lastReadTickIndex === Number.MIN_SAFE_INTEGER) {
      this.ticks.forEach((tick, index) => {
        tick.classList.toggle("is-read", index <= nextIndex);
      });
    } else if (nextIndex > this.lastReadTickIndex) {
      for (let index = this.lastReadTickIndex + 1; index <= nextIndex; index += 1) {
        this.ticks[index]?.classList.add("is-read");
      }
    } else if (nextIndex < this.lastReadTickIndex) {
      for (let index = nextIndex + 1; index <= this.lastReadTickIndex; index += 1) {
        this.ticks[index]?.classList.remove("is-read");
      }
    }
    this.lastReadTickIndex = nextIndex;
  }

  private updateLabelBranch(): boolean {
    if (this.outlineScope === "all") {
      if (this.lastLabelBranchKey === "all") {
        return false;
      }
      this.lastLabelBranchKey = "all";
      this.labels.forEach((label) => {
        label.hidden = false;
      });
      return true;
    }
    let branchStart = -1;
    for (let index = Math.min(this.activeHeadingIndex, this.entries.length - 1); index >= 0; index -= 1) {
      if (this.entries[index]?.level === 2) {
        branchStart = index;
        break;
      }
    }
    let branchEnd = this.entries.length;
    if (branchStart >= 0) {
      for (let index = branchStart + 1; index < this.entries.length; index += 1) {
        if (this.entries[index]?.level === 2) {
          branchEnd = index;
          break;
        }
      }
    }
    const branchKey = `${branchStart}:${branchEnd}`;
    if (branchKey === this.lastLabelBranchKey) {
      return false;
    }
    this.lastLabelBranchKey = branchKey;
    this.labels.forEach((label, index) => {
      label.hidden = branchStart < 0 || index < branchStart || index >= branchEnd;
    });
    return true;
  }

  private updateProgressState(progress: number): void {
    this.currentProgress = clamp01(progress);
    this.targetPosition = this.currentProgress * this.trackHeight;
    const percentage = Math.round(this.currentProgress * 100);
    const progressText = this.currentProgress.toFixed(2);
    if (progressText !== this.lastProgressText) {
      this.progressLabel.textContent = progressText;
      this.track.setAttribute("aria-valuetext", progressText);
      this.lastProgressText = progressText;
    }
    if (percentage !== this.lastProgressPercentage) {
      this.track.setAttribute("aria-valuenow", percentage.toString());
      this.lastProgressPercentage = percentage;
    }
    this.updateReadTicks();
    if (this.currentProgress >= 0.985 && !this.hasCelebratedCompletion) {
      this.hasCelebratedCompletion = true;
      this.sound?.completionChime?.(this.window);
      if (!this.environment.reducedMotion()) {
        this.orb.classList.add("is-celebrating");
      }
    } else if (this.currentProgress < 0.85) {
      this.hasCelebratedCompletion = false;
      this.orb.classList.remove("is-celebrating");
    }
  }

  private renderWaypoints(): void {
    const document = this.root.ownerDocument;
    const resolved = this.waypoints.map((waypoint) => ({
      waypoint,
      progress: resolveReadingMarkerProgress(waypoint, this.entries),
    }));
    const renderKey = JSON.stringify(resolved);
    if (renderKey === this.lastWaypointRenderKey) {
      return;
    }
    this.lastWaypointRenderKey = renderKey;
    this.waypointButtons = resolved.map(({ waypoint: storedWaypoint, progress }) => {
      const percentage = Math.round(progress * 100);
      const waypoint = document.createElement("button");
      waypoint.type = "button";
      waypoint.className = "crisp-reading-rail__waypoint";
      waypoint.dataset.progress = progress.toString();
      waypoint.style.setProperty("--crisp-reading-waypoint-progress", progress.toString());
      waypoint.textContent = "★";
      waypoint.setAttribute(
        "aria-label",
        `Reading waypoint at ${percentage} percent`,
      );
      waypoint.title = "Click to jump. Right-click or press Delete to remove.";
      waypoint.addEventListener("click", (event) => {
        event.stopPropagation();
        const pointerActivated = event.detail > 0;
        this.callbacks.onProgressSelect(
          progress,
          pointerActivated,
          pointerActivated,
        );
      });
      waypoint.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeWaypoint(storedWaypoint);
      });
      waypoint.addEventListener("keydown", (event) => {
        if (event.key !== "Delete" && event.key !== "Backspace") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.removeWaypoint(storedWaypoint);
      });
      return waypoint;
    });
    this.waypointsContainer.replaceChildren(this.resumeMarker, ...this.waypointButtons);
  }

  private addWaypoint(progress: number): void {
    const next = normalizeWaypoints([
      ...this.waypoints,
      createSemanticMarker(progress, this.entries, Date.now()),
    ]);
    if (
      next.length === this.waypoints.length
      && next.every((value, index) => (
        JSON.stringify(value) === JSON.stringify(this.waypoints[index])
      ))
    ) {
      return;
    }
    this.waypoints = next;
    this.renderWaypoints();
    this.callbacks.onWaypointsChange?.([...this.waypoints]);
  }

  private removeWaypoint(waypoint: ReadingWaypoint): void {
    const next = this.waypoints.filter((candidate) => candidate !== waypoint);
    if (next.length === this.waypoints.length) {
      return;
    }
    this.waypoints = next;
    this.renderWaypoints();
    this.callbacks.onWaypointsChange?.([...this.waypoints]);
  }
}
