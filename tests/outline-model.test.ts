import { describe, expect, it } from "vitest";
import {
  activeHeadingIndex,
  buildOutlineEntries,
  labelListOverflows,
  resolveLabelPositions,
  resolveVariableLabelPositions,
} from "../src/outline-model";

const headings = [
  { text: "Title", level: 1, sourceLine: 0 },
  { text: "First", level: 2, sourceLine: 3 },
  { text: "Detail", level: 3, sourceLine: 9 },
  { text: "Too deep", level: 5, sourceLine: 12 },
];

describe("outline model", () => {
  it("keeps only H2-H4 entries with unambiguous rendered targets", () => {
    const rendered = [
      { text: "First", level: 2, documentY: 200, target: {} as HTMLElement },
      { text: "Detail", level: 3, documentY: 260, target: {} as HTMLElement },
    ];
    const result = buildOutlineEntries(headings, rendered, 100, 1000);
    expect(result.map((entry) => [entry.text, entry.level, entry.progress])).toEqual([
      ["First", 2, 0.1],
      ["Detail", 3, 0.16],
    ]);
  });

  it("omits a mismatched rendered target instead of guessing", () => {
    const rendered = [
      { text: "Wrong", level: 2, documentY: 200, target: {} as HTMLElement },
      { text: "Detail", level: 3, documentY: 260, target: {} as HTMLElement },
    ];
    expect(buildOutlineEntries(headings, rendered, 100, 1000).map((entry) => entry.text)).toEqual([
      "Detail",
    ]);
  });

  it("uses real positions for rendered headings while estimating virtualized headings", () => {
    const detailTarget = {} as HTMLElement;
    const rendered = [
      { text: "Detail", level: 3, documentY: 260, target: detailTarget },
    ];
    const result = buildOutlineEntries(headings, rendered, 100, 1000, 13);
    expect(result.map((entry) => ({
      text: entry.text,
      progress: entry.progress,
      hasTarget: entry.target !== null,
    }))).toEqual([
      { text: "First", progress: 0.25, hasTarget: false },
      { text: "Detail", progress: 0.16, hasTarget: true },
    ]);
  });

  it("interpolates between measured anchors instead of trusting the line ratio", () => {
    const deepHeadings = [
      { text: "A", level: 2, sourceLine: 3 },
      { text: "B", level: 2, sourceLine: 9 },
      { text: "C", level: 2, sourceLine: 15 },
      { text: "D", level: 2, sourceLine: 21 },
    ];
    const rendered = [
      { text: "A", level: 2, documentY: 100, target: {} as HTMLElement },
      { text: "D", level: 2, documentY: 1000, target: {} as HTMLElement },
    ];

    const result = buildOutlineEntries(deepHeadings, rendered, 0, 1000, 24);

    // B and C sit between two real anchors, so they are interpolated rather than
    // estimated from their source line (which would scatter them off the outline).
    expect(result.map((entry) => entry.progress)).toEqual([0.1, 0.4, 0.7, 1]);
    expect(result.map((entry) => entry.target !== null)).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it("keeps a remembered position once a heading leaves the render window", () => {
    const deepHeadings = [
      { text: "A", level: 2, sourceLine: 3 },
      { text: "B", level: 2, sourceLine: 9 },
      { text: "C", level: 2, sourceLine: 15 },
    ];
    const remembered = new Map([[15, 900]]);

    // No heading is rendered at all in this pass, so only the memory can place C.
    const result = buildOutlineEntries(deepHeadings, [], 0, 1000, 24, remembered);

    expect(result[2].progress).toBeCloseTo(0.9, 5);
    expect(result[2].documentY).toBe(900);
    // A and B have no anchor below them, so they still fall back to the source-line ratio.
    expect(result[0].progress).toBeCloseTo(3 / 23, 5);
    expect(result[1].progress).toBeCloseTo(9 / 23, 5);
  });

  it("preserves order while separating colliding labels", () => {
    const entries = [
      { text: "A", level: 2, sourceLine: 1, documentY: 10, progress: 0.1, labelY: 0, target: {} as HTMLElement },
      { text: "B", level: 2, sourceLine: 2, documentY: 11, progress: 0.11, labelY: 0, target: {} as HTMLElement },
    ];
    const result = resolveLabelPositions(entries, 100, 16, 4);
    expect(result[1].labelY - result[0].labelY).toBeGreaterThanOrEqual(20);
    expect(result[0].labelY).toBeGreaterThanOrEqual(0);
    expect(result[1].labelY).toBeLessThanOrEqual(84);
  });

  it("separates labels using their measured heights", () => {
    const entries = [
      { text: "A", level: 2, sourceLine: 1, documentY: 10, progress: 0.3, labelY: 0, target: null },
      { text: "B", level: 3, sourceLine: 2, documentY: 11, progress: 0.31, labelY: 0, target: null },
      { text: "C", level: 4, sourceLine: 3, documentY: 12, progress: 0.32, labelY: 0, target: null },
    ];
    const heights = [18, 36, 54];
    const result = resolveVariableLabelPositions(entries, 160, heights, 4);

    expect(result[1].labelY - result[0].labelY).toBeGreaterThanOrEqual(22);
    expect(result[2].labelY - result[1].labelY).toBeGreaterThanOrEqual(40);
    expect(result[0].labelY).toBeGreaterThanOrEqual(0);
    expect(result[2].labelY + heights[2]).toBeLessThanOrEqual(160);
  });

  it("keeps mixed-height labels inside both track edges", () => {
    const entries = [
      { text: "Top", level: 2, sourceLine: 1, documentY: 0, progress: 0, labelY: 0, target: null },
      { text: "Bottom", level: 2, sourceLine: 2, documentY: 100, progress: 1, labelY: 0, target: null },
    ];
    const heights = [48, 30];
    const result = resolveVariableLabelPositions(entries, 100, heights, 4);

    expect(result[0].labelY).toBe(0);
    expect(result[1].labelY + heights[1]).toBe(100);
  });

  it("falls back to monotonic in-bounds positions when over-constrained", () => {
    const entries = Array.from({ length: 4 }, (_, index) => ({
      text: String(index),
      level: 2,
      sourceLine: index,
      documentY: index,
      progress: index / 3,
      labelY: 0,
      target: null,
    }));
    const result = resolveVariableLabelPositions(entries, 60, [30, 30, 30, 30], 4);
    const positions = result.map((entry) => entry.labelY);

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions[3]).toBeLessThanOrEqual(30);
    expect(positions.every(Number.isFinite)).toBe(true);
  });

  it("detects when labels no longer fit on the track", () => {
    const entries = Array.from({ length: 6 }, (_, index) => ({
      text: String(index),
      level: 2,
      sourceLine: index,
      documentY: index,
      progress: index / 5,
      labelY: 0,
      target: null,
    }));
    const heights = entries.map(() => 16);

    expect(labelListOverflows(entries, 100, heights, 4)).toBe(true);
    expect(labelListOverflows(entries, 200, heights, 4)).toBe(false);
    expect(labelListOverflows([], 100, [], 4)).toBe(false);
  });

  it("returns no active heading before the first threshold", () => {
    const entries = [
      { text: "A", level: 2, sourceLine: 1, documentY: 300, progress: 0.3, labelY: 30, target: {} as HTMLElement },
      { text: "B", level: 2, sourceLine: 2, documentY: 700, progress: 0.7, labelY: 70, target: {} as HTMLElement },
    ];
    expect(activeHeadingIndex(entries, 100, 80)).toBe(-1);
    expect(activeHeadingIndex(entries, 250, 80)).toBe(0);
    expect(activeHeadingIndex(entries, 650, 80)).toBe(1);
  });
});
