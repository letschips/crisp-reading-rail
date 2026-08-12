// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectRenderedHeadings } from "../src/heading-source";
import {
  ReadingRailController,
  type RailControllerEnvironment,
  type RailView,
} from "../src/reading-rail-controller";
import type { RailViewCallbacks } from "../src/reading-rail-view";

function setMetric(element: HTMLElement, key: string, value: number): void {
  Object.defineProperty(element, key, { configurable: true, value });
}

function makeFixture(width = 900) {
  const host = document.createElement("div");
  const scroller = document.createElement("div");
  scroller.className = "markdown-preview-view";
  host.append(scroller);
  document.body.append(host);
  setMetric(host, "clientWidth", width);
  setMetric(host, "clientHeight", 800);
  setMetric(scroller, "clientHeight", 800);
  setMetric(scroller, "scrollHeight", 1800);
  setMetric(scroller, "scrollTop", 0);
  const scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options === "object" && typeof options.top === "number") {
      setMetric(scroller, "scrollTop", options.top);
    }
  });
  scroller.scrollTo = scrollTo as typeof scroller.scrollTo;
  scroller.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 900,
    bottom: 800,
    width: 900,
    height: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { host, scroller };
}

function makeEnvironment() {
  let nextFrame = 1;
  let nextTimer = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  const cancelledFrames: number[] = [];
  const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const resizeCallbacks: Array<() => void> = [];
  const mutationCallbacks: MutationCallback[] = [];
  let frameRequests = 0;
  const environment: RailControllerEnvironment = {
    requestAnimationFrame(callback) {
      frameRequests += 1;
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    createResizeObserver: vi.fn((callback) => {
      resizeCallbacks.push(callback);
      const observer = { observe: vi.fn(), disconnect: vi.fn() };
      observers.push(observer);
      return observer;
    }),
    createMutationObserver: vi.fn((callback) => {
      mutationCallbacks.push(callback);
      const observer = { observe: vi.fn(), disconnect: vi.fn() };
      observers.push(observer);
      return observer;
    }),
    reducedMotion: () => false,
  };
  return {
    environment,
    observers,
    cancelledFrames,
    get frameRequests() {
      return frameRequests;
    },
    flushFrame(timestamp = 0) {
      const first = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (first) {
        frames.delete(first[0]);
        first[1](timestamp);
      }
    },
    flushFrames(timestamps: readonly number[]) {
      for (const timestamp of timestamps) {
        this.flushFrame(timestamp);
      }
    },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    triggerResize() {
      resizeCallbacks.forEach((callback) => callback());
    },
    triggerMutation() {
      mutationCallbacks.forEach((callback) => callback([], {} as MutationObserver));
    },
    get pendingTimers() {
      return timers.size;
    },
    get pendingTimerIds() {
      return [...timers.keys()];
    },
    pendingFrameId() {
      return frames.keys().next().value as number | undefined;
    },
  };
}

function makeView(): RailView & {
  visible: boolean;
  callbacks?: RailViewCallbacks;
} {
  return {
    visible: false,
    setOutline: vi.fn(),
    setProgress: vi.fn(),
    setActiveHeading: vi.fn(),
    setWaypoints: vi.fn(),
    setExpanded: vi.fn(),
    setVisible(visible) {
      this.visible = visible;
    },
    refreshAppearance: vi.fn(),
    destroy: vi.fn(),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("collectRenderedHeadings", () => {
  it("excludes headings from embedded notes", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <h2>First</h2>
      <h3>Detail</h3>
      <div class="internal-embed"><h2>Embedded</h2></div>
      <h5>Too deep</h5>
    `;
    expect(collectRenderedHeadings(container).map((item) => item.text)).toEqual([
      "First",
      "Detail",
    ]);
  });

  it("excludes Crisp Annotations notes from rendered heading text", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <h3>
        <span class="heading-collapse-indicator">Toggle</span>
        <span class="crisp-ann crisp-ann--right">
          <mark class="crisp-ann__target">How a GPU works</mark>
          <span class="crisp-ann__label" role="note">GPU是如何工作的</span>
          <svg class="crisp-ann-margin-connectors"><text>Connector</text></svg>
        </span>
      </h3>
    `;

    expect(collectRenderedHeadings(container).map((item) => item.text)).toEqual([
      "How a GPU works",
    ]);
  });
});

describe("ReadingRailController", () => {
  it("coalesces scroll work, applies visibility rules, and cleans up", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });

    controller.start();
    clock.flushFrame();
    expect(view.visible).toBe(true);

    const beforeScroll = clock.frameRequests;
    for (let index = 0; index < 5; index += 1) {
      scroller.dispatchEvent(new Event("scroll"));
    }
    expect(clock.frameRequests - beforeScroll).toBe(1);
    const pendingFrameId = clock.pendingFrameId()!;

    setMetric(host, "clientWidth", 600);
    controller.refresh();
    expect(view.visible).toBe(false);

    controller.destroy();
    expect(clock.cancelledFrames).toContain(pendingFrameId);
    expect(clock.observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(view.destroy).toHaveBeenCalledTimes(1);
  });

  it("waits for repeated width-only resizes to settle before rebuilding the outline", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    expect(view.setOutline).toHaveBeenCalledTimes(1);

    for (const width of [880, 860, 840]) {
      setMetric(host, "clientWidth", width);
      clock.triggerResize();
      clock.flushFrame();
    }
    expect(view.setOutline).toHaveBeenCalledTimes(1);

    clock.flushTimers();
    clock.flushFrame();
    expect(view.setOutline).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("waits for continuous structure mutations to settle before one refresh", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    clock.triggerMutation();
    const firstTimerId = clock.pendingTimerIds[0];
    clock.triggerMutation();
    clock.triggerMutation();

    expect(clock.pendingTimers).toBe(1);
    expect(clock.pendingTimerIds[0]).not.toBe(firstTimerId);
    clock.flushTimers();
    clock.flushFrame();
    expect(view.setOutline).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("rebuilds the outline on the next frame when pane height changes", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    setMetric(host, "clientHeight", 720);
    setMetric(scroller, "clientHeight", 720);
    clock.triggerResize();
    clock.flushFrame();

    expect(view.setOutline).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("updates visibility immediately when width crosses the pane threshold", () => {
    const { host, scroller } = makeFixture(700);
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    expect(view.visible).toBe(true);

    setMetric(host, "clientWidth", 660);
    clock.triggerResize();
    clock.flushFrame();

    expect(view.visible).toBe(false);
    controller.destroy();
  });

  it("restores a native scroll indicator while a scrollable pane is too narrow for the rail", () => {
    const { host, scroller } = makeFixture(700);
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    expect(scroller.classList.contains(
      "crisp-reading-rail-native-scrollbar",
    )).toBe(false);

    setMetric(host, "clientWidth", 660);
    controller.refresh();
    expect(scroller.classList.contains(
      "crisp-reading-rail-native-scrollbar",
    )).toBe(true);

    controller.destroy();
    expect(scroller.classList.contains(
      "crisp-reading-rail-native-scrollbar",
    )).toBe(false);
  });

  it("suppresses expanded rail labels when right-margin annotations occupy the pane", () => {
    const { host, scroller } = makeFixture();
    const rightMarginNote = document.createElement("span");
    rightMarginNote.className = "crisp-ann-margin-item--right";
    scroller.append(rightMarginNote);
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });

    controller.start();
    clock.flushFrame();
    expect(host.classList.contains(
      "crisp-reading-rail-avoid-right-annotations",
    )).toBe(true);

    rightMarginNote.remove();
    controller.refresh();
    expect(host.classList.contains(
      "crisp-reading-rail-avoid-right-annotations",
    )).toBe(false);

    controller.destroy();
  });

  it("navigates proportionally and honors reduced motion", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    clock.environment.reducedMotion = () => true;
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();
    view.callbacks?.onProgressSelect(0.5);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
    controller.destroy();
  });

  it("runs keyboard navigation immediately without scheduling smooth frames", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();
    const frameRequests = clock.frameRequests;

    view.callbacks?.onProgressSelect(0.5, false, false);

    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 500,
      behavior: "auto",
    });
    expect(clock.frameRequests).toBe(frameRequests);
    controller.destroy();
  });

  it("cancels smooth navigation and scrolls immediately while the orb is dragged", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();
    view.callbacks?.onProgressSelect(0.9);
    const navigationFrame = clock.pendingFrameId();

    view.callbacks?.onProgressDrag?.(0.4);

    expect(clock.cancelledFrames).toContain(navigationFrame);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 400, behavior: "auto" });
    view.callbacks?.onProgressDrag?.(0.65);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 650, behavior: "auto" });

    setMetric(scroller, "scrollHeight", 2800);
    scroller.dispatchEvent(new Event("scroll"));
    clock.flushFrame();
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1300, behavior: "auto" });
    setMetric(scroller, "scrollHeight", 3000);
    view.callbacks?.onProgressDragEnd?.(0.65);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1430, behavior: "auto" });
    setMetric(scroller, "scrollHeight", 3200);
    clock.flushFrame();
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1560, behavior: "auto" });
    controller.destroy();
  });

  it("plays sparse feedback only for direct rail interaction", () => {
    const { host, scroller } = makeFixture();
    const first = document.createElement("h2");
    first.textContent = "First";
    first.getBoundingClientRect = () => ({
      top: 200 - scroller.scrollTop,
      left: 0,
      right: 0,
      bottom: 220 - scroller.scrollTop,
      width: 0,
      height: 20,
      x: 0,
      y: 200 - scroller.scrollTop,
      toJSON: () => ({}),
    });
    const second = document.createElement("h2");
    second.textContent = "Second";
    second.getBoundingClientRect = () => ({
      top: 700 - scroller.scrollTop,
      left: 0,
      right: 0,
      bottom: 720 - scroller.scrollTop,
      width: 0,
      height: 20,
      x: 0,
      y: 700 - scroller.scrollTop,
      toJSON: () => ({}),
    });
    scroller.append(first, second);
    const clock = makeEnvironment();
    const view = makeView();
    const sound = { tick: vi.fn(), settle: vi.fn() };
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [
        { text: "First", level: 2, sourceLine: 10 },
        { text: "Second", level: 2, sourceLine: 20 },
      ],
      getLineCount: () => 30,
      sound,
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();

    scroller.dispatchEvent(new Event("scroll"));
    clock.flushFrame();
    expect(sound.tick).not.toHaveBeenCalled();
    expect(sound.settle).not.toHaveBeenCalled();

    const outline = vi.mocked(view.setOutline).mock.calls[0][0];
    view.callbacks?.onHeadingSelect(outline[0], false, false);
    expect(sound.settle).not.toHaveBeenCalled();

    view.callbacks?.onProgressSelect(0.4, false);
    expect(sound.settle).not.toHaveBeenCalled();

    view.callbacks?.onProgressSelect(0.5, true);
    expect(sound.settle).toHaveBeenCalledOnce();

    view.callbacks?.onProgressDrag?.(0.1);
    view.callbacks?.onProgressDrag?.(0.3);
    view.callbacks?.onProgressDrag?.(0.8);
    expect(sound.tick).toHaveBeenCalledTimes(2);

    view.callbacks?.onProgressDragCancel?.(0.8);
    expect(sound.settle).toHaveBeenCalledOnce();

    view.callbacks?.onProgressDrag?.(0.3);
    view.callbacks?.onProgressDragEnd?.(0.3);
    expect(sound.settle).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("settles long-distance progress navigation against changing scroll height", () => {
    const { host, scroller } = makeFixture();
    setMetric(scroller, "scrollHeight", 10000);
    setMetric(scroller, "scrollTop", 5000);
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();
    view.callbacks?.onProgressSelect(0.2);
    setMetric(scroller, "scrollHeight", 12000);
    clock.flushFrames([0, 1000, 1016, 1032]);

    expect(scroller.scrollTop).toBe(2240);
    const progressScrollCalls = (
      vi.mocked(scroller.scrollTo).mock.calls as unknown
    ) as Array<[ScrollToOptions]>;
    expect(progressScrollCalls.every(([options]) => options.behavior === "auto")).toBe(true);
    controller.destroy();
  });

  it("tracks a rendered heading whose document position shifts during navigation", () => {
    const { host, scroller } = makeFixture();
    setMetric(scroller, "scrollHeight", 12000);
    setMetric(scroller, "scrollTop", 1000);
    let headingDocumentY = 9000;
    const heading = document.createElement("h2");
    heading.textContent = "First";
    heading.getBoundingClientRect = () => ({
      top: headingDocumentY - scroller.scrollTop,
      left: 0,
      right: 0,
      bottom: headingDocumentY - scroller.scrollTop + 20,
      width: 0,
      height: 20,
      x: 0,
      y: headingDocumentY - scroller.scrollTop,
      toJSON: () => ({}),
    });
    scroller.append(heading);
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [{ text: "First", level: 2, sourceLine: 0 }],
      getLineCount: () => 101,
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();
    const firstOutline = vi.mocked(view.setOutline).mock.calls[0][0];
    view.callbacks?.onHeadingSelect(firstOutline[0]);
    headingDocumentY = 8200;
    clock.flushFrames([0, 1000, 1016, 1032]);

    expect(scroller.scrollTop).toBe(8200);
    const headingScrollCalls = (
      vi.mocked(scroller.scrollTo).mock.calls as unknown
    ) as Array<[ScrollToOptions]>;
    expect(headingScrollCalls.every(([options]) => options.behavior === "auto")).toBe(true);
    controller.destroy();
  });

  it("corrects a virtualized heading jump after its target renders", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [{ text: "First", level: 2, sourceLine: 50 }],
      getLineCount: () => 101,
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });
    controller.start();
    clock.flushFrame();

    const firstOutline = vi.mocked(view.setOutline).mock.calls[0][0];
    view.callbacks?.onHeadingSelect(firstOutline[0]);
    clock.flushFrames([0, 1000, 1016, 1032]);
    expect(scroller.scrollTop).toBe(500);

    const heading = document.createElement("h2");
    heading.textContent = "First";
    heading.getBoundingClientRect = () => ({
      top: 600 - scroller.scrollTop,
      left: 0,
      right: 0,
      bottom: 620 - scroller.scrollTop,
      width: 0,
      height: 20,
      x: 0,
      y: 600 - scroller.scrollTop,
      toJSON: () => ({}),
    });
    scroller.append(heading);
    setMetric(scroller, "scrollTop", 500);
    controller.refresh();
    clock.flushFrames([2000, 3000, 3016, 3032]);
    expect(scroller.scrollTop).toBe(600);
    controller.destroy();
  });

  it("forwards appearance changes without rebuilding or scrolling", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      environment: clock.environment,
      createView: () => view,
    });
    controller.start();
    clock.flushFrame();
    vi.mocked(scroller.scrollTo).mockClear();

    controller.refreshAppearance();

    expect(view.refreshAppearance).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    expect(view.destroy).not.toHaveBeenCalled();
  });

  it("loads persisted waypoints and forwards edits to the note store", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const setWaypoints = vi.fn();
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [],
      getWaypoints: () => [0.2, 0.8],
      setWaypoints,
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });

    controller.start();
    clock.flushFrame();
    expect(view.setWaypoints).toHaveBeenCalledWith([0.2, 0.8]);

    view.callbacks?.onWaypointsChange?.([0.4]);
    expect(setWaypoints).toHaveBeenCalledWith([0.4]);
    controller.destroy();
  });

  it("passes drag progress into styled sound feedback", () => {
    const { host, scroller } = makeFixture();
    const clock = makeEnvironment();
    const view = makeView();
    const sound = { tick: vi.fn(), settle: vi.fn() };
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [
        { text: "First", level: 2, sourceLine: 10 },
        { text: "Second", level: 2, sourceLine: 20 },
      ],
      getLineCount: () => 30,
      sound,
      environment: clock.environment,
      createView: (_host, callbacks) => {
        view.callbacks = callbacks;
        return view;
      },
    });

    controller.start();
    clock.flushFrame();
    view.callbacks?.onProgressDrag?.(0.1);
    view.callbacks?.onProgressDrag?.(0.7);

    expect(sound.tick).toHaveBeenLastCalledWith(0.7, expect.anything());
    controller.destroy();
  });

  it("jumps to the next and previous outline heading through public commands", () => {
    const { host, scroller } = makeFixture();
    const first = document.createElement("h2");
    first.textContent = "First";
    first.getBoundingClientRect = () => ({
      top: 200 - scroller.scrollTop,
      left: 0, right: 0, bottom: 220 - scroller.scrollTop,
      width: 0, height: 20, x: 0, y: 200 - scroller.scrollTop,
      toJSON: () => ({}),
    });
    const second = document.createElement("h2");
    second.textContent = "Second";
    second.getBoundingClientRect = () => ({
      top: 700 - scroller.scrollTop,
      left: 0, right: 0, bottom: 720 - scroller.scrollTop,
      width: 0, height: 20, x: 0, y: 700 - scroller.scrollTop,
      toJSON: () => ({}),
    });
    scroller.append(first, second);
    const clock = makeEnvironment();
    clock.environment.reducedMotion = () => true;
    const controller = new ReadingRailController({
      host,
      scroller,
      preview: scroller,
      getHeadings: () => [
        { text: "First", level: 2, sourceLine: 10 },
        { text: "Second", level: 2, sourceLine: 20 },
      ],
      getLineCount: () => 30,
      environment: clock.environment,
    });

    controller.start();
    clock.flushFrame();
    controller.jumpHeading(1);
    expect(scroller.scrollTop).toBe(200);

    scroller.dispatchEvent(new Event("scroll"));
    clock.flushFrame();
    controller.jumpHeading(1);
    expect(scroller.scrollTop).toBe(700);

    scroller.dispatchEvent(new Event("scroll"));
    clock.flushFrame();
    controller.jumpHeading(-1);
    expect(scroller.scrollTop).toBe(200);
    controller.destroy();
  });
});
