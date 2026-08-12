// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ReadingPaneRegistry } from "../src/pane-registry";
import type { ReadingRailControllerOptions } from "../src/reading-rail-controller";
import { MarkdownView } from "obsidian";
import type { View, WorkspaceLeaf } from "obsidian";

function makeController() {
  return {
    start: vi.fn(),
    jumpHeading: vi.fn(),
    jumpToReadingMemory: vi.fn(),
    togglePinnedOutline: vi.fn(),
    refresh: vi.fn(),
    refreshAppearance: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("ReadingPaneRegistry", () => {
  it("mounts a controller only for the selected leaf in each tab group", () => {
    const views = ["one.md", "two.md"].map((path) => ({
      file: { path },
      getMode: () => "preview" as const,
    }));
    const leaves = views.map((view) => ({ view })) as unknown as WorkspaceLeaf[];
    const tabGroup = {
      type: "tabs",
      children: leaves,
      currentTab: 0,
    };
    for (const leaf of leaves) {
      Object.assign(leaf, { parent: tabGroup });
    }
    const controllers = [makeController(), makeController()];
    const factory = vi.fn()
      .mockReturnValueOnce(controllers[0])
      .mockReturnValueOnce(controllers[1]);
    const host = document.createElement("div");
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => leaves.forEach(callback) },
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      {
        isMarkdownView: (view: View): view is MarkdownView => "getMode" in view,
        resolveElements: () => ({ host, scroller: host, preview: host }),
        createController: factory,
      },
    );

    registry.reconcile();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controllers[0].start).toHaveBeenCalledTimes(1);

    tabGroup.currentTab = 1;
    registry.reconcile();
    expect(controllers[0].destroy).toHaveBeenCalledTimes(1);
    expect(controllers[1].start).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("finds the scrollable preview inside Obsidian's reading-view wrapper", () => {
    const host = document.createElement("div");
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-reading-view";
    const scroller = document.createElement("div");
    scroller.className = "markdown-preview-view";
    wrapper.append(scroller);
    host.append(wrapper);

    const MarkdownViewWithoutLeaf = MarkdownView as unknown as new () => MarkdownView;
    const view = new MarkdownViewWithoutLeaf() as MarkdownView & {
      getMode(): "preview";
      file: { path: string };
      previewMode: { containerEl: HTMLElement };
    };
    Object.assign(view, {
      containerEl: host,
      file: { path: "long-note.md" },
      getMode: () => "preview",
      previewMode: { containerEl: wrapper },
    });
    const leaf = { view } as unknown as WorkspaceLeaf;
    const factory = vi.fn(() => makeController());
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => callback(leaf) },
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      { createController: factory },
    );

    registry.reconcile();
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ scroller, preview: scroller }));
    registry.destroy();
  });

  it("creates, reuses, refreshes, and destroys pane-local controllers", () => {
    const file = { path: "long-note.md" };
    const readingView = {
      file,
      getMode: () => "preview",
    };
    const editView = {
      file: { path: "editing.md" },
      getMode: () => "source",
    };
    const otherView = { file: null };
    const leaves = [
      { view: readingView },
      { view: editView },
      { view: otherView },
    ] as unknown as WorkspaceLeaf[];
    const workspace = {
      iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void) {
        leaves.forEach(callback);
      },
    };
    const controller = makeController();
    const replacement = makeController();
    const host = document.createElement("div");
    const factory = vi.fn()
      .mockReturnValueOnce(controller)
      .mockReturnValueOnce(replacement);
    const registry = new ReadingPaneRegistry(
      {
        workspace,
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      {
        isMarkdownView: (view: View): view is MarkdownView => "getMode" in view,
        resolveElements: () => ({ host, scroller: host, preview: host }),
        createController: factory,
      },
    );

    registry.reconcile();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(controller.start).toHaveBeenCalledTimes(1);

    registry.reconcile();
    expect(factory).toHaveBeenCalledTimes(1);

    registry.refreshFile(file as never);
    expect(controller.refresh).toHaveBeenCalledTimes(1);

    readingView.getMode = () => "source";
    registry.reconcile();
    expect(controller.destroy).toHaveBeenCalledTimes(1);

    readingView.getMode = () => "preview";
    registry.reconcile();
    expect(factory).toHaveBeenCalledTimes(2);
    registry.destroy();
    expect(replacement.destroy).toHaveBeenCalledTimes(1);
  });

  it("refreshes appearance in every live pane without rebuilding controllers", () => {
    const views = ["one.md", "two.md"].map((path) => ({
      file: { path },
      getMode: () => "preview" as const,
    }));
    const leaves = views.map((view) => ({ view })) as unknown as WorkspaceLeaf[];
    const controllers = [makeController(), makeController()];
    const appearance = {
      getOrbStyle: () => "gear" as const,
      getAssetUrl: (path: string) => `app://reading/${path}`,
    };
    const sound = { tick: vi.fn(), settle: vi.fn() };
    const factory = vi.fn()
      .mockReturnValueOnce(controllers[0])
      .mockReturnValueOnce(controllers[1]);
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => leaves.forEach(callback) },
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      {
        appearance,
        sound,
        isMarkdownView: (view: View): view is MarkdownView => "getMode" in view,
        resolveElements: (view) => ({
          host: (view as unknown as { host: HTMLElement }).host
            ?? document.createElement("div"),
          scroller: document.createElement("div"),
          preview: document.createElement("div"),
        }),
        createController: factory,
      },
    );

    registry.reconcile();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0][0]).toEqual(expect.objectContaining({ appearance, sound }));

    registry.refreshAppearance();
    expect(controllers[0].refreshAppearance).toHaveBeenCalledTimes(1);
    expect(controllers[1].refreshAppearance).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("routes next and previous heading commands only to the active Reading pane", () => {
    const views = ["one.md", "two.md"].map((path) => ({
      file: { path },
      getMode: () => "preview" as const,
    }));
    const leaves = views.map((view) => ({ view })) as unknown as WorkspaceLeaf[];
    const controllers = [makeController(), makeController()];
    const registry = new ReadingPaneRegistry(
      {
        workspace: {
          iterateAllLeaves: (callback) => leaves.forEach(callback),
          getActiveViewOfType: <T extends View>() => views[1] as unknown as T,
        },
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      {
        isMarkdownView: (view: View): view is MarkdownView => "getMode" in view,
        resolveElements: () => ({
          host: document.createElement("div"),
          scroller: document.createElement("div"),
          preview: document.createElement("div"),
        }),
        createController: vi.fn()
          .mockReturnValueOnce(controllers[0])
          .mockReturnValueOnce(controllers[1]),
      },
    );
    registry.reconcile();

    registry.jumpNextHeading();
    registry.jumpPreviousHeading();
    registry.jumpToLastReadingPosition();
    registry.togglePinnedOutline();

    expect(controllers[0].jumpHeading).not.toHaveBeenCalled();
    expect(controllers[1].jumpHeading).toHaveBeenNthCalledWith(1, 1);
    expect(controllers[1].jumpHeading).toHaveBeenNthCalledWith(2, -1);
    expect(controllers[1].jumpToReadingMemory).toHaveBeenCalledTimes(1);
    expect(controllers[1].togglePinnedOutline).toHaveBeenCalledTimes(1);
    registry.destroy();
  });

  it("resolves global outline preferences with per-note frontmatter", () => {
    const view = {
      file: { path: "Notes/Focused.md" },
      getMode: () => "preview" as const,
    };
    const leaf = { view } as unknown as WorkspaceLeaf;
    const factory = vi.fn(() => makeController());
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => callback(leaf) },
        metadataCache: { getFileCache: () => ({
          headings: [],
          frontmatter: {
            "crisp-reading-rail-levels": 2,
            "crisp-reading-rail-scope": "current-h2",
          },
        }) },
      },
      {
        outlinePreferences: () => ({ enabled: true, maxLevel: 4, scope: "all" }),
        isMarkdownView: (candidate: View): candidate is MarkdownView => "getMode" in candidate,
        resolveElements: () => ({
          host: document.createElement("div"),
          scroller: document.createElement("div"),
          preview: document.createElement("div"),
        }),
        createController: factory,
      },
    );
    registry.reconcile();
    const options = (factory.mock.calls as unknown as Array<[ReadingRailControllerOptions]>)[0][0];
    expect(options.getOutlinePreferences?.()).toEqual({
      enabled: true,
      maxLevel: 2,
      scope: "currentH2",
    });
    registry.destroy();
  });

  it("binds waypoint storage to the pane's current file path", () => {
    const view = {
      file: { path: "Notes/First.md" },
      getMode: () => "preview" as const,
    };
    const leaf = { view } as unknown as WorkspaceLeaf;
    const get = vi.fn((path: string) => path === "Notes/First.md"
      ? [{ progress: 0.2 }]
      : [{ progress: 0.8 }]);
    const set = vi.fn();
    const factory = vi.fn(() => makeController());
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => callback(leaf) },
        metadataCache: { getFileCache: () => ({ headings: [] }) },
      },
      {
        waypoints: { get, set },
        isMarkdownView: (candidate: View): candidate is MarkdownView => "getMode" in candidate,
        resolveElements: () => ({
          host: document.createElement("div"),
          scroller: document.createElement("div"),
          preview: document.createElement("div"),
        }),
        createController: factory,
      },
    );
    registry.reconcile();
    const calls = factory.mock.calls as unknown as
      Array<[ReadingRailControllerOptions]>;
    const options = calls[0][0];

    expect(options.getWaypoints?.()).toEqual([{ progress: 0.2 }]);
    options.setWaypoints?.([{ progress: 0.4 }]);
    expect(set).toHaveBeenCalledWith("Notes/First.md", [{ progress: 0.4 }]);

    view.file.path = "Notes/Second.md";
    expect(options.getWaypoints?.()).toEqual([{ progress: 0.8 }]);
    registry.destroy();
  });

  it("exposes the visible label of a Markdown-linked heading", () => {
    const view = {
      file: { path: "linked-heading.md" },
      getMode: () => "preview" as const,
    };
    const leaf = { view } as unknown as WorkspaceLeaf;
    const factory = vi.fn(() => makeController());
    const registry = new ReadingPaneRegistry(
      {
        workspace: { iterateAllLeaves: (callback) => callback(leaf) },
        metadataCache: {
          getFileCache: () => ({
            headings: [{
              heading: "[Reference guide](https://example.com/docs)",
              level: 2,
              position: {
                start: { line: 4, col: 0, offset: 20 },
                end: { line: 4, col: 52, offset: 72 },
              },
            }],
          }),
        },
      },
      {
        isMarkdownView: (candidate: View): candidate is MarkdownView => "getMode" in candidate,
        resolveElements: () => ({
          host: document.createElement("div"),
          scroller: document.createElement("div"),
          preview: document.createElement("div"),
        }),
        createController: factory,
      },
    );

    registry.reconcile();
    const calls = factory.mock.calls as unknown as
      Array<[ReadingRailControllerOptions]>;

    expect(calls[0][0].getHeadings()).toEqual([{
      text: "Reference guide",
      level: 2,
      sourceLine: 4,
    }]);
    registry.destroy();
  });
});
